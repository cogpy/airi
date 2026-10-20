import type { AudioWindow } from '@proj-airi/pipelines-audio'

import type { EchoClassifierDecision } from './echo-classifier'

import { describe, expect, it } from 'vitest'

import { createEchoClassifier } from './echo-classifier'
import { createEchoGate } from './echo-gate'

const START = 1_000_000
const SAMPLE_RATE = 16_000
/** The voice activity plugin's window: 512 samples at 16 kHz. */
const WINDOW_SAMPLES = 512
const OUTPUT_LEVEL = 0.1
const ECHO_GAIN = 0.3
const LATENCY_MS = 80
const PLAYBACK_MS = 5000

/** Sample `index` of source `mic` is heard at `START + index / 16` ms. */
function timeOf(sample: number) {
  return START + sample * 1000 / SAMPLE_RATE
}

/** One window of a steady level per sample, from `mic(at)`. */
function windowAt(startFrame: number, mic: (at: number) => number, sourceId = 'mic'): AudioWindow {
  const samples = new Float32Array(WINDOW_SAMPLES)
  for (let index = 0; index < WINDOW_SAMPLES; index++)
    samples[index] = mic(timeOf(startFrame + index))
  return { range: { sourceId, startFrame, endFrame: startFrame + WINDOW_SAMPLES }, sampleRate: SAMPLE_RATE, channels: [samples], discontinuity: false }
}

/** What the microphone hears from her alone at `at`. */
function echoAt(at: number) {
  const sinceStart = at - LATENCY_MS - START
  return sinceStart >= 0 && sinceStart < PLAYBACK_MS ? ECHO_GAIN * OUTPUT_LEVEL : 0
}

function createPlayingClassifier() {
  const gate = createEchoGate()
  gate.startSelf({ id: 'clip-1', at: START, envelope: new Float32Array(PLAYBACK_MS / 10).fill(OUTPUT_LEVEL) })
  return { gate, classifier: createEchoClassifier(gate) }
}

/** Classifies contiguous windows from `fromMs` to `toMs` after START, each delivered with no delay. */
function classifyRange(classifier: ReturnType<typeof createEchoClassifier>, fromMs: number, toMs: number, mic: (at: number) => number) {
  const decisions: EchoClassifierDecision[] = []
  for (let startFrame = fromMs * SAMPLE_RATE / 1000; timeOf(startFrame) < START + toMs; startFrame += WINDOW_SAMPLES)
    decisions.push(classifier.classify(windowAt(startFrame, mic), timeOf(startFrame + WINDOW_SAMPLES)))
  return decisions
}

describe('createEchoClassifier', () => {
  it('does not accept her own echo', () => {
    const { classifier } = createPlayingClassifier()

    const decisions = classifyRange(classifier, 0, 4000, at => echoAt(at) + 0.001)

    expect(decisions.filter(decision => decision.accept)).toEqual([])
    expect(decisions.at(-1)?.reason).toBe('within-echo')
  })

  it('does not accept loud speech before the gate learns her echo level', () => {
    const { classifier } = createPlayingClassifier()

    const decisions = classifyRange(classifier, 0, 320, at => echoAt(at) + 0.3)

    expect(decisions.filter(decision => decision.accept)).toEqual([])
    expect(decisions.at(-1)?.reason).toBe('uncalibrated')
  })

  it('accepts speech over her echo after the onset frames', () => {
    const { classifier } = createPlayingClassifier()
    classifyRange(classifier, 0, 1024, echoAt)

    // Each window has three full 10 ms frames, so the second one reaches five.
    const [first, second] = classifyRange(classifier, 1024, 1088, at => echoAt(at) + 0.2)

    expect(first).toEqual({ accept: false, reason: 'onset', otherFrames: 3 })
    expect(second).toEqual({ accept: true, reason: 'above-echo', otherFrames: 5 })
  })

  it('restarts the onset run after a gap between windows', () => {
    const { classifier } = createPlayingClassifier()
    classifyRange(classifier, 0, 1024, echoAt)
    const loud = (at: number) => echoAt(at) + 0.2

    classifyRange(classifier, 1024, 1056, loud)
    // The window at 1056 ms never reached the classifier.
    const [afterGap, next] = classifyRange(classifier, 1088, 1152, loud)

    expect(afterGap).toEqual({ accept: false, reason: 'onset', otherFrames: 3 })
    expect(next).toEqual({ accept: true, reason: 'above-echo', otherFrames: 5 })
  })

  it('does not accept when no playback of hers is audible, so the caller keeps its own rule', () => {
    const classifier = createEchoClassifier(createEchoGate())

    const decisions = classifyRange(classifier, 0, 320, () => 0.3)

    expect(decisions.every(decision => decision.reason === 'self-inaudible' && !decision.accept)).toBe(true)
  })

  it('dates a late window by the smallest delay seen on its source', () => {
    const gate = createEchoGate()
    gate.startSelf({ id: 'clip-1', at: START, envelope: new Float32Array(100).fill(OUTPUT_LEVEL) })
    gate.stopSelf('clip-1', START + 1000)
    // She stays audible until 1000 + 80 + 60 + 300 = 1440 ms.
    const classifier = createEchoClassifier(gate)
    classifier.classify(windowAt(0, () => 0), timeOf(WINDOW_SAMPLES))

    // Heard at 1408 ms, delivered 100 ms late after a slow detection.
    const late = windowAt(1376 * SAMPLE_RATE / 1000, () => 0)

    expect(classifier.classify(late, timeOf(late.range.endFrame) + 100).reason).toBe('silence')
  })

  it('starts a new clock estimate for a new source', () => {
    const gate = createEchoGate()
    gate.startSelf({ id: 'clip-1', at: START, envelope: new Float32Array(100).fill(OUTPUT_LEVEL) })
    gate.stopSelf('clip-1', START + 1000)
    const classifier = createEchoClassifier(gate)
    classifier.classify(windowAt(0, () => 0), timeOf(WINDOW_SAMPLES))

    // A new connection restarts sample positions. Delivered at 1500 ms, it can only be dated then.
    const reconnected = windowAt(0, () => 0, 'mic-2')

    expect(classifier.classify(reconnected, START + 1500).reason).toBe('self-inaudible')
  })
})
