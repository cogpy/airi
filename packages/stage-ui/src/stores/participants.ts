import type { AudioWindow } from '@proj-airi/pipelines-audio'

import type { EchoClassifierConfig, EchoClassifierDecision, EchoGateConfig, EnvelopeSource, Participant, ParticipantActivity } from '../libs/participants'

import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { createDefaultEchoGateConfig, createEchoClassifier, createEchoGate, energyEnvelope } from '../libs/participants'

/** The character's own output. A stage has exactly one. */
export const SELF_PARTICIPANT: Participant = Object.freeze({ id: 'self', kind: 'self' })

/** The local microphone. One device is one participant: no diarization. */
export const DEVICE_PARTICIPANT: Participant = Object.freeze({ id: 'device:microphone', kind: 'other', origin: 'device' })

/**
 * Owns the participants a stage perceives and their speech activity.
 *
 * Not synchronized across windows: each renderer has its own audio output and
 * microphone, so each one must judge its own echo.
 *
 * State model:
 *
 * - Self (runtime state). Set by the self channel from the voice pipeline's
 *   speech output (`composables/speech-output-self-channel.ts`).
 *   `selfSpeaking` is true while any published clip has not stopped.
 * - Echo gate and echo classifier (learned state). They live as long as the
 *   store, so calibration carries over between utterances. The voice store
 *   asks {@link classifyDeviceWindow} whether a microphone window is speech
 *   over her echo. {@link configure} replaces both and drops what they learned.
 * - Agent speech (runtime state). Other AI agents on the server channel, by
 *   participant id. `agentSpeaking` is true while any of them has started and
 *   not ended. Fed by the context bridge from speech events.
 * - Stage participant id (persisted configuration). `stageParticipantId`
 *   names this stage to other stages. It lives in local storage, so it stays
 *   the same across restarts and is shared by every window of one stage: a
 *   window can then recognize, and ignore, speech events that another window
 *   of the same stage published. It is not the card id, because two stages
 *   running the same card must still tell each other apart.
 *
 * Activity handlers run synchronously, in subscription order, when the state
 * changes.
 */
export const useParticipantsStore = defineStore('participants', () => {
  const selfSpeaking = ref(false)
  const agentSpeaking = ref(false)
  const storedStageParticipantId = useLocalStorage('settings/participants/stage-participant-id', () => `stage:${nanoid()}`)
  const stageParticipantId = computed(() => storedStageParticipantId.value)
  const agents = new Map<string, Participant>()
  const speakingAgents = new Set<string>()

  let gateConfig: EchoGateConfig = createDefaultEchoGateConfig()
  let gate = createEchoGate(gateConfig)
  let classifier = createEchoClassifier(gate, { frameMs: gateConfig.frameMs })
  const activeSelfPlaybacks = new Set<string>()
  const handlers = new Set<(activity: ParticipantActivity) => void>()

  function emit(activity: ParticipantActivity): void {
    for (const handler of handlers)
      handler(activity)
  }

  /**
   * Replaces the echo gate and the echo classifier. Both start fresh: the
   * gate uncalibrated, the classifier with no clock estimate. Self activity
   * is kept. The classifier's frame length follows the gate's.
   */
  function configure(config: { echoGate?: Partial<EchoGateConfig>, echoClassifier?: Partial<Omit<EchoClassifierConfig, 'frameMs'>> } = {}): void {
    gateConfig = { ...createDefaultEchoGateConfig(), ...config.echoGate }
    gate = createEchoGate(gateConfig)
    classifier = createEchoClassifier(gate, { ...config.echoClassifier, frameMs: gateConfig.frameMs })
  }

  /**
   * Publishes that one speech clip became audible.
   *
   * `id` correlates this call with {@link publishSelfPlaybackStop}. `at` is
   * `Date.now()` when the clip started. With `audio`, the echo gate gets the
   * clip's loudness envelope: the efference copy of what she is about to say.
   * Without it, only the activity is published, and the gate treats the
   * microphone as if she were silent.
   */
  function publishSelfPlaybackStart(playback: { id: string, audio?: EnvelopeSource, text: string, at: number, turnId?: string, sessionId?: string }): void {
    if (playback.audio) {
      gate.startSelf({
        id: playback.id,
        at: playback.at,
        envelope: energyEnvelope(playback.audio, gateConfig.frameMs),
      })
    }
    activeSelfPlaybacks.add(playback.id)
    selfSpeaking.value = true
    emit({
      participant: SELF_PARTICIPANT,
      phase: 'start',
      at: playback.at,
      text: playback.text,
      ...(playback.turnId ? { turnId: playback.turnId } : {}),
      ...(playback.sessionId ? { sessionId: playback.sessionId } : {}),
    })
  }

  /**
   * Publishes that a speech clip ended, was stopped, or failed. A stop for a
   * clip that never started is ignored.
   */
  function publishSelfPlaybackStop(playback: { id: string, at: number }): void {
    if (!activeSelfPlaybacks.delete(playback.id))
      return

    gate.stopSelf(playback.id, playback.at)
    selfSpeaking.value = activeSelfPlaybacks.size > 0
    emit({ participant: SELF_PARTICIPANT, phase: 'end', at: playback.at })
  }

  /**
   * Decides whether one microphone window is speech over her echo. The voice
   * store calls it as the voice pipeline's echo check, with `now` from
   * `Date.now()`. See {@link createEchoClassifier} for the clock and the rule.
   */
  function classifyDeviceWindow(window: AudioWindow, now: number): EchoClassifierDecision {
    return classifier.classify(window, now)
  }

  /**
   * Another AI agent started or stopped speaking. The first report of an
   * agent registers it as an `other` participant with origin `agent`.
   *
   * A repeated start or an end without a start is ignored, so one agent's
   * activity always alternates. `at` must be on this renderer's clock, not
   * the agent's, so it compares with local playback times.
   */
  function reportAgentActivity(activity: { participantId: string, phase: 'start' | 'end', at: number }): void {
    let participant = agents.get(activity.participantId)
    if (!participant) {
      participant = Object.freeze({ id: activity.participantId, kind: 'other', origin: 'agent' })
      agents.set(activity.participantId, participant)
    }

    if (activity.phase === 'start') {
      if (speakingAgents.has(activity.participantId))
        return
      speakingAgents.add(activity.participantId)
    }
    else if (!speakingAgents.delete(activity.participantId)) {
      return
    }

    agentSpeaking.value = speakingAgents.size > 0
    emit({ participant, phase: activity.phase, at: activity.at })
  }

  /**
   * Ends the speech of every agent still marked as speaking, for example when
   * the card stops conversing with agents or the channel goes away. Without
   * it, a lost end event leaves the agent marked as speaking forever.
   */
  function endAllAgentActivity(at: number): void {
    // Deleting the visited entry while iterating a Set is well defined.
    for (const participantId of speakingAgents)
      reportAgentActivity({ participantId, phase: 'end', at })
  }

  /**
   * Subscribes to activity of every participant. Returns an unsubscribe.
   * Consumers that act on one kind, such as the context bridge publishing
   * her speech, filter on `activity.participant.kind`.
   */
  function onActivity(handler: (activity: ParticipantActivity) => void): () => void {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  }

  return {
    selfSpeaking,
    agentSpeaking,
    stageParticipantId,

    configure,
    publishSelfPlaybackStart,
    publishSelfPlaybackStop,
    classifyDeviceWindow,
    reportAgentActivity,
    endAllAgentActivity,
    onActivity,
  }
})
