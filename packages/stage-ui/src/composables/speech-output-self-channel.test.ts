import type { SpeechOutput } from '@proj-airi/core-agent'
import type { AudioWindow, TtsRequest } from '@proj-airi/pipelines-audio'

import type { EnvelopeSource, ParticipantActivity } from '../libs/participants'

import { Playback } from '@proj-airi/pipelines-audio'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SELF_PARTICIPANT, useParticipantsStore } from '../stores/participants'
import { observeSelfSpeech } from './speech-output-self-channel'

const START = 1_000_000
const TURN = { sessionId: 'session-1', turnId: 'turn-1' }
const CLIP = { id: 'segment-1', text: 'Hello.' }

function request(): TtsRequest {
  return { turnId: TURN.turnId, streamId: 'stream', intentId: 'intent', segmentId: CLIP.id, sequence: 0, text: CLIP.text, special: null, reason: 'hard', priority: 0, createdAt: 0 }
}

/** One second of a steady level at 1 kHz. */
const AUDIO: EnvelopeSource = { sampleRate: 1000, numberOfChannels: 1, getChannelData: () => new Float32Array(1000).fill(0.1) }

function synthesizedOutput(): SpeechOutput {
  return {
    playback: new Playback({ nowMs: () => 0, play: vi.fn() }),
    synthesize: async () => new Blob(['speech']),
    onPlaybackStart: vi.fn(),
    onPlaybackEnd: vi.fn(),
  }
}

async function synthesize(output: SpeechOutput) {
  if (!('synthesize' in output))
    throw new Error('Expected pipeline synthesis')
  await output.synthesize(request(), new AbortController().signal)
}

/** A loud 32 ms microphone window delivered at `START + 200` ms. */
function loudWindow(): AudioWindow {
  return { range: { sourceId: 'mic', startFrame: 0, endFrame: 512 }, sampleRate: 16_000, channels: [new Float32Array(512).fill(0.3)], discontinuity: false }
}

function recordActivity() {
  const activity: ParticipantActivity[] = []
  useParticipantsStore().onActivity(event => activity.push(event))
  return activity
}

describe('observeSelfSpeech', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers({ now: START })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes a synthesized clip with its decoded audio, turn, and session, then its stop', async () => {
    const activity = recordActivity()
    const inner = synthesizedOutput()
    const decode = vi.fn(async () => AUDIO)
    const output = observeSelfSpeech(TURN, inner, decode, () => true)

    await synthesize(output)
    output.onPlaybackStart?.(CLIP)
    await vi.waitFor(() => expect(activity).toHaveLength(1))
    vi.setSystemTime(START + 1000)
    output.onPlaybackEnd?.(CLIP, { status: 'ended' })

    expect(decode).toHaveBeenCalledWith(expect.any(Blob))
    expect(inner.onPlaybackStart).toHaveBeenCalledWith(CLIP)
    expect(inner.onPlaybackEnd).toHaveBeenCalledWith(CLIP, { status: 'ended' })
    expect(activity).toEqual([
      { participant: SELF_PARTICIPANT, phase: 'start', at: START, text: 'Hello.', turnId: 'turn-1', sessionId: 'session-1' },
      { participant: SELF_PARTICIPANT, phase: 'end', at: START + 1000 },
    ])
  })

  it('gives the echo gate the clip, so the microphone is judged against her playback', async () => {
    const output = observeSelfSpeech(TURN, synthesizedOutput(), async () => AUDIO, () => true)

    await synthesize(output)
    output.onPlaybackStart?.(CLIP)
    await vi.waitFor(() => expect(useParticipantsStore().selfSpeaking).toBe(true))

    expect(useParticipantsStore().classifyDeviceWindow(loudWindow(), START + 200).reason).toBe('uncalibrated')
  })

  it('publishes nothing and decodes nothing when the session card does not opt in', async () => {
    const activity = recordActivity()
    const decode = vi.fn(async () => AUDIO)
    const output = observeSelfSpeech(TURN, synthesizedOutput(), decode, () => false)

    await synthesize(output)
    output.onPlaybackStart?.(CLIP)
    output.onPlaybackEnd?.(CLIP, { status: 'ended' })
    await vi.runAllTimersAsync()

    expect(decode).not.toHaveBeenCalled()
    expect(activity).toEqual([])
  })

  it('never publishes a clip that ends before its audio decodes', async () => {
    const activity = recordActivity()
    const decoding = Promise.withResolvers<EnvelopeSource>()
    const output = observeSelfSpeech(TURN, synthesizedOutput(), () => decoding.promise, () => true)

    await synthesize(output)
    output.onPlaybackStart?.(CLIP)
    output.onPlaybackEnd?.(CLIP, { status: 'stopped', reason: 'speech-input' })
    decoding.resolve(AUDIO)
    await vi.runAllTimersAsync()

    expect(activity).toEqual([])
    expect(useParticipantsStore().selfSpeaking).toBe(false)
  })

  it('publishes a streamed clip without audio', async () => {
    const activity = recordActivity()
    const inner: SpeechOutput = {
      playback: new Playback({ nowMs: () => 0, play: vi.fn() }),
      stream: async () => new ReadableStream(),
    }
    const output = observeSelfSpeech(TURN, inner, vi.fn(async () => AUDIO), () => true)

    output.onPlaybackStart?.(CLIP)

    expect(activity).toEqual([
      { participant: SELF_PARTICIPANT, phase: 'start', at: START, text: 'Hello.', turnId: 'turn-1', sessionId: 'session-1' },
    ])
    expect(useParticipantsStore().classifyDeviceWindow(loudWindow(), START + 200).reason).toBe('self-inaudible')
  })
})
