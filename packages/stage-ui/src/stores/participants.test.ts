import type { AudioWindow } from '@proj-airi/pipelines-audio'

import type { EchoClassifierDecision, ParticipantActivity } from '../libs/participants'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { SELF_PARTICIPANT, useParticipantsStore } from './participants'

const START = 1_000_000
const SAMPLE_RATE = 16_000
const WINDOW_SAMPLES = 512
const OUTPUT_LEVEL = 0.1
const ECHO_GAIN = 0.3
const LATENCY_MS = 80

/** A mono buffer at 1 kHz with a steady level, so each 10 ms frame is 10 samples. */
function steadyAudio(durationMs: number) {
  const samples = new Float32Array(durationMs).fill(OUTPUT_LEVEL)
  return { sampleRate: 1000, numberOfChannels: 1, getChannelData: () => samples }
}

/** What the microphone hears from her alone at `at`, for a playback started at START. */
function echoAt(at: number, durationMs: number): number {
  const sinceStart = at - LATENCY_MS - START
  return sinceStart >= 0 && sinceStart < durationMs ? ECHO_GAIN * OUTPUT_LEVEL : 0
}

/**
 * Classifies contiguous 32 ms microphone windows from `fromMs` to `toMs`
 * after START. Sample 0 is heard at START, and each window is delivered as
 * soon as its last sample is heard.
 */
function classifyRange(store: ReturnType<typeof useParticipantsStore>, fromMs: number, toMs: number, mic: (at: number) => number) {
  const decisions: EchoClassifierDecision[] = []
  for (let startFrame = fromMs * SAMPLE_RATE / 1000; startFrame * 1000 / SAMPLE_RATE < toMs; startFrame += WINDOW_SAMPLES) {
    const samples = new Float32Array(WINDOW_SAMPLES)
    for (let index = 0; index < WINDOW_SAMPLES; index++)
      samples[index] = mic(START + (startFrame + index) * 1000 / SAMPLE_RATE)
    const window: AudioWindow = { range: { sourceId: 'mic', startFrame, endFrame: startFrame + WINDOW_SAMPLES }, sampleRate: SAMPLE_RATE, channels: [samples], discontinuity: false }
    decisions.push(store.classifyDeviceWindow(window, START + window.range.endFrame * 1000 / SAMPLE_RATE))
  }
  return decisions
}

function recordActivity(store: ReturnType<typeof useParticipantsStore>) {
  const activity: ParticipantActivity[] = []
  store.onActivity(event => activity.push(event))
  return activity
}

describe('participants store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('publishes self activity with the utterance text', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(1000), text: 'Hello there.', at: START })
    expect(store.selfSpeaking).toBe(true)

    store.publishSelfPlaybackStop({ id: 'item-1', at: START + 1000 })
    expect(store.selfSpeaking).toBe(false)

    expect(activity).toEqual([
      { participant: SELF_PARTICIPANT, phase: 'start', at: START, text: 'Hello there.' },
      { participant: SELF_PARTICIPANT, phase: 'end', at: START + 1000 },
    ])
  })

  it('ignores a stop for a playback that never started', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.publishSelfPlaybackStop({ id: 'rejected-before-start', at: START })

    expect(activity).toEqual([])
  })

  it('stops notifying a handler after it unsubscribes', () => {
    const store = useParticipantsStore()
    const activity: ParticipantActivity[] = []
    const unsubscribe = store.onActivity(event => activity.push(event))

    unsubscribe()
    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(100), text: 'Hi.', at: START })

    expect(activity).toEqual([])
  })

  it('carries the turn and session of a self playback when the self channel knows them', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(100), text: 'Hi.', at: START, turnId: 'turn-1', sessionId: 'session-1' })

    expect(activity).toEqual([
      { participant: SELF_PARTICIPANT, phase: 'start', at: START, text: 'Hi.', turnId: 'turn-1', sessionId: 'session-1' },
    ])
  })

  it('does not accept her own echo from the published playback', () => {
    const store = useParticipantsStore()

    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(5000), text: 'A long monologue.', at: START })
    const decisions = classifyRange(store, 0, 4000, at => echoAt(at, 5000) + 0.001)

    expect(decisions.filter(decision => decision.accept)).toEqual([])
  })

  it('accepts a person talking over the published playback once the gate is calibrated', () => {
    const store = useParticipantsStore()

    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(5000), text: 'Let me tell you.', at: START })
    classifyRange(store, 0, 1024, at => echoAt(at, 5000))
    const decisions = classifyRange(store, 1024, 1088, at => echoAt(at, 5000) + 0.2)

    expect(decisions.at(-1)).toEqual({ accept: true, reason: 'above-echo', otherFrames: 5 })
  })

  it('drops what the gate learned when it is configured again', () => {
    const store = useParticipantsStore()
    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(5000), text: 'Let me tell you.', at: START })
    classifyRange(store, 0, 1024, at => echoAt(at, 5000))

    store.configure()
    store.publishSelfPlaybackStart({ id: 'item-2', audio: steadyAudio(5000), text: 'Again.', at: START })
    const decisions = classifyRange(store, 1024, 1088, at => echoAt(at, 5000) + 0.2)

    expect(decisions.at(-1)?.reason).toBe('uncalibrated')
  })

  it('publishes a clip without audio as activity only, so the echo check hears no playback', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.publishSelfPlaybackStart({ id: 'stream-clip', text: 'Streamed.', at: START })
    const decisions = classifyRange(store, 0, 320, () => 0.3)

    expect(store.selfSpeaking).toBe(true)
    expect(activity).toEqual([{ participant: SELF_PARTICIPANT, phase: 'start', at: START, text: 'Streamed.' }])
    expect(decisions.every(decision => decision.reason === 'self-inaudible')).toBe(true)
  })

  it('reports another agent as an other participant with origin agent', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)
    const agent = { id: 'stage:b', kind: 'other', origin: 'agent' }

    store.reportAgentActivity({ participantId: 'stage:b', phase: 'start', at: START })
    expect(store.agentSpeaking).toBe(true)

    store.reportAgentActivity({ participantId: 'stage:b', phase: 'end', at: START + 500 })
    expect(store.agentSpeaking).toBe(false)

    expect(activity).toEqual([
      { participant: agent, phase: 'start', at: START },
      { participant: agent, phase: 'end', at: START + 500 },
    ])
  })

  it('keeps one agent\'s activity alternating', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.reportAgentActivity({ participantId: 'stage:b', phase: 'end', at: START })
    store.reportAgentActivity({ participantId: 'stage:b', phase: 'start', at: START + 10 })
    store.reportAgentActivity({ participantId: 'stage:b', phase: 'start', at: START + 20 })

    expect(activity.map(event => event.phase)).toEqual(['start'])
  })

  it('ends every speaking agent at once', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.reportAgentActivity({ participantId: 'stage:b', phase: 'start', at: START })
    store.reportAgentActivity({ participantId: 'stage:c', phase: 'start', at: START })
    store.endAllAgentActivity(START + 100)

    expect(store.agentSpeaking).toBe(false)
    expect(activity.filter(event => event.phase === 'end').map(event => event.participant.id)).toEqual(['stage:b', 'stage:c'])
  })

  it('names this stage with a stable participant id', () => {
    const store = useParticipantsStore()

    expect(store.stageParticipantId).toMatch(/^stage:/)
  })
})
