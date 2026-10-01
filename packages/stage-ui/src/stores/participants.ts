import type { EchoGateConfig, EchoGateDecision, EnvelopeSource, Participant, ParticipantActivity } from '../libs/participants'

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { createDefaultEchoGateConfig, createEchoGate, energyEnvelope } from '../libs/participants'

/** The character's own output. A stage has exactly one. */
export const SELF_PARTICIPANT: Participant = Object.freeze({ id: 'self', kind: 'self' })

/** The local microphone. One device is one participant: no diarization. */
export const DEVICE_PARTICIPANT: Participant = Object.freeze({ id: 'device:microphone', kind: 'other', origin: 'device' })

/**
 * How the store turns per-frame gate answers into speech start and end for
 * the device participant.
 */
export interface DeviceActivityConfig {
  /**
   * Consecutive `other` frames, while voice detection reports speech, before
   * the device counts as speaking over her. Five 10 ms frames is 50 ms: it
   * skips single-frame spikes such as a click.
   *
   * @default 5
   */
  onsetFrames: number
  /**
   * Consecutive frames her echo explains, while she is audible, before the
   * device stops counting as speaking over her. Thirty 10 ms frames is 300 ms:
   * a person's gap between words does not end their interruption, which the
   * barge-in controller would read as a new, short overlap.
   *
   * @default 30
   */
  releaseFrames: number
}

function createDefaultDeviceActivityConfig(): DeviceActivityConfig {
  return { onsetFrames: 5, releaseFrames: 30 }
}

/**
 * Owns the participants a stage perceives and their speech activity.
 *
 * Not synchronized across windows: each renderer has its own audio output and
 * microphone, so each one must judge its own echo.
 *
 * State model:
 *
 * - Self (runtime state). Set by the stage from its playback manager.
 *   `selfSpeaking` is true while any published playback has not stopped.
 * - Device speech (runtime state). `deviceSpeaking` follows voice detection on
 *   the microphone. It does not say who is talking: her echo also trips voice
 *   detection.
 * - Other speech (derived runtime state). `otherSpeaking` is true when the
 *   device is speaking and the echo gate says the sound is not her. Outside
 *   her playback, it starts with device speech. During her playback, it
 *   starts after `onsetFrames` `other` frames and ends after `releaseFrames`
 *   frames her echo explains. It always ends with device speech.
 * - Echo gate (learned state). Lives as long as the store, so calibration
 *   carries over between utterances. {@link configure} replaces it and drops
 *   what it learned.
 *
 * Activity handlers run synchronously, in subscription order, when the state
 * changes.
 */
export const useParticipantsStore = defineStore('participants', () => {
  const selfSpeaking = ref(false)
  const deviceSpeaking = ref(false)
  const otherSpeaking = ref(false)

  let gateConfig: EchoGateConfig = createDefaultEchoGateConfig()
  let activityConfig: DeviceActivityConfig = createDefaultDeviceActivityConfig()
  let gate = createEchoGate(gateConfig)
  const activeSelfPlaybacks = new Set<string>()
  const handlers = new Set<(activity: ParticipantActivity) => void>()

  let otherFrames = 0
  let otherOnsetAt = 0
  let explainedFrames = 0

  function emit(activity: ParticipantActivity): void {
    for (const handler of handlers)
      handler(activity)
  }

  function resetDeviceCounters(): void {
    otherFrames = 0
    explainedFrames = 0
  }

  function startOther(at: number): void {
    if (otherSpeaking.value)
      return
    otherSpeaking.value = true
    explainedFrames = 0
    emit({ participant: DEVICE_PARTICIPANT, phase: 'start', at })
  }

  function endOther(at: number): void {
    if (!otherSpeaking.value)
      return
    otherSpeaking.value = false
    resetDeviceCounters()
    emit({ participant: DEVICE_PARTICIPANT, phase: 'end', at })
  }

  /**
   * Replaces the echo gate and the activity thresholds. The new gate starts
   * uncalibrated. Device and self activity are kept.
   */
  function configure(config: { echoGate?: Partial<EchoGateConfig>, deviceActivity?: Partial<DeviceActivityConfig> } = {}): void {
    gateConfig = { ...createDefaultEchoGateConfig(), ...config.echoGate }
    activityConfig = { ...createDefaultDeviceActivityConfig(), ...config.deviceActivity }
    gate = createEchoGate(gateConfig)
    resetDeviceCounters()
  }

  /**
   * Publishes that one playback item became audible: the efference copy of
   * what she is about to say.
   *
   * `id` correlates this call with {@link publishSelfPlaybackStop}. `at` is the
   * playback manager's `startedAt`.
   */
  function publishSelfPlaybackStart(playback: { id: string, audio: EnvelopeSource, text: string, at: number }): void {
    gate.startSelf({
      id: playback.id,
      at: playback.at,
      envelope: energyEnvelope(playback.audio, gateConfig.frameMs),
    })
    activeSelfPlaybacks.add(playback.id)
    selfSpeaking.value = true
    emit({ participant: SELF_PARTICIPANT, phase: 'start', at: playback.at, text: playback.text })
  }

  /**
   * Publishes that a playback item ended, was interrupted, or was rejected.
   * A stop for an item that never started is ignored.
   */
  function publishSelfPlaybackStop(playback: { id: string, at: number }): void {
    if (!activeSelfPlaybacks.delete(playback.id))
      return

    gate.stopSelf(playback.id, playback.at)
    selfSpeaking.value = activeSelfPlaybacks.size > 0
    emit({ participant: SELF_PARTICIPANT, phase: 'end', at: playback.at })
  }

  /**
   * Feeds one microphone loudness frame (linear RMS, about 10 ms) to the
   * echo gate and updates other speech. Returns the gate's decision for logs.
   *
   * Frames are fed whether or not voice detection reports speech, because the
   * gate calibrates on her echo alone.
   */
  function feedDeviceFrame(at: number, rms: number): EchoGateDecision {
    const decision = gate.observeFrame(at, rms)
    if (!deviceSpeaking.value)
      return decision

    if (!otherSpeaking.value) {
      if (decision.source !== 'other') {
        otherFrames = 0
        return decision
      }

      if (otherFrames === 0)
        otherOnsetAt = at
      otherFrames += 1
      if (otherFrames >= activityConfig.onsetFrames)
        startOther(otherOnsetAt)
      return decision
    }

    // Only frames her echo explains end an interruption. Silence does not:
    // voice detection ends it when the person really stops.
    if (decision.source === 'other') {
      explainedFrames = 0
    }
    else if (decision.source === 'self') {
      explainedFrames += 1
      if (explainedFrames >= activityConfig.releaseFrames)
        endOther(at)
    }
    return decision
  }

  /**
   * Voice detection on the microphone heard speech start. Outside her
   * playback that is another person at once; during it, the frames decide.
   */
  function reportDeviceSpeechStart(at: number): void {
    deviceSpeaking.value = true
    resetDeviceCounters()
    if (!gate.isSelfAudible(at))
      startOther(at)
  }

  /** Voice detection on the microphone heard speech end, or listening stopped. */
  function reportDeviceSpeechEnd(at: number): void {
    deviceSpeaking.value = false
    resetDeviceCounters()
    endOther(at)
  }

  /**
   * Subscribes to activity of every participant. Returns an unsubscribe.
   * Consumers that act only on others, such as barge-in, filter on
   * `activity.participant.kind`.
   */
  function onActivity(handler: (activity: ParticipantActivity) => void): () => void {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  }

  return {
    selfSpeaking,
    deviceSpeaking,
    otherSpeaking,

    configure,
    publishSelfPlaybackStart,
    publishSelfPlaybackStop,
    feedDeviceFrame,
    reportDeviceSpeechStart,
    reportDeviceSpeechEnd,
    onActivity,
  }
})
