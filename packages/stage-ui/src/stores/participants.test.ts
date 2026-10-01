import type { ParticipantActivity } from '../libs/participants'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEVICE_PARTICIPANT, SELF_PARTICIPANT, useParticipantsStore } from './participants'

const START = 1_000_000
const FRAME_MS = 10
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

function feedFrames(store: ReturnType<typeof useParticipantsStore>, from: number, to: number, mic: (at: number) => number) {
  for (let at = from; at < to; at += FRAME_MS)
    store.feedDeviceFrame(at, mic(at))
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

  it('reports device speech as other at once when she is silent', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.reportDeviceSpeechStart(START)
    store.reportDeviceSpeechEnd(START + 800)

    expect(activity).toEqual([
      { participant: DEVICE_PARTICIPANT, phase: 'start', at: START },
      { participant: DEVICE_PARTICIPANT, phase: 'end', at: START + 800 },
    ])
  })

  it('does not report her own echo as other, even when voice detection fires on it', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(5000), text: 'A long monologue.', at: START })
    store.reportDeviceSpeechStart(START + 100)
    feedFrames(store, START, START + 5000, at => echoAt(at, 5000) + 0.001)

    expect(store.otherSpeaking).toBe(false)
    expect(activity.filter(event => event.participant.kind === 'other')).toEqual([])
  })

  it('does not report loud speech as other before the gate is calibrated', () => {
    const store = useParticipantsStore()
    store.configure({ echoGate: { calibrationFrames: 100 } })
    const activity = recordActivity(store)

    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(5000), text: 'Hi.', at: START })
    store.reportDeviceSpeechStart(START)
    feedFrames(store, START, START + 990, at => echoAt(at, 5000) + 0.3)

    expect(activity.filter(event => event.participant.kind === 'other')).toEqual([])
  })

  it('reports a person talking over her once the gate is calibrated', () => {
    const store = useParticipantsStore()
    const activity = recordActivity(store)

    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(5000), text: 'Let me tell you.', at: START })
    feedFrames(store, START, START + 1000, at => echoAt(at, 5000))

    store.reportDeviceSpeechStart(START + 1000)
    feedFrames(store, START + 1000, START + 1200, at => echoAt(at, 5000) + 0.2)

    const others = activity.filter(event => event.participant.kind === 'other')
    // Five `other` frames are needed; the start is dated from the first.
    expect(others).toEqual([{ participant: DEVICE_PARTICIPANT, phase: 'start', at: START + 1000 }])
    expect(store.otherSpeaking).toBe(true)

    store.reportDeviceSpeechEnd(START + 1500)

    expect(store.otherSpeaking).toBe(false)
    expect(activity.at(-1)).toEqual({ participant: DEVICE_PARTICIPANT, phase: 'end', at: START + 1500 })
  })

  it('ends other speech after her echo alone explains the microphone for the release time', () => {
    const store = useParticipantsStore()
    store.configure({ deviceActivity: { releaseFrames: 30 } })
    const activity = recordActivity(store)

    store.publishSelfPlaybackStart({ id: 'item-1', audio: steadyAudio(5000), text: 'Let me tell you.', at: START })
    feedFrames(store, START, START + 1000, at => echoAt(at, 5000))
    store.reportDeviceSpeechStart(START + 1000)
    feedFrames(store, START + 1000, START + 1200, at => echoAt(at, 5000) + 0.2)

    // The person stops; voice detection stays on because it hears her echo.
    feedFrames(store, START + 1200, START + 1490, at => echoAt(at, 5000))
    expect(store.otherSpeaking).toBe(true)

    store.feedDeviceFrame(START + 1490, echoAt(START + 1490, 5000))

    expect(store.otherSpeaking).toBe(false)
    expect(activity.at(-1)).toEqual({ participant: DEVICE_PARTICIPANT, phase: 'end', at: START + 1490 })
  })

  it('stops notifying a handler after it unsubscribes', () => {
    const store = useParticipantsStore()
    const activity: ParticipantActivity[] = []
    const unsubscribe = store.onActivity(event => activity.push(event))

    unsubscribe()
    store.reportDeviceSpeechStart(START)

    expect(activity).toEqual([])
  })
})
