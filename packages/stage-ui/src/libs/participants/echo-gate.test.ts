import type { EchoGate, EchoGateDecision } from './echo-gate'

import { describe, expect, it } from 'vitest'

import { createEchoGate } from './echo-gate'

const START = 1_000_000
const FRAME_MS = 10

/** Builds an envelope from `[durationMs, level]` segments. */
function envelopeOf(...segments: Array<[durationMs: number, level: number]>): Float32Array {
  const values: number[] = []
  for (const [durationMs, level] of segments) {
    for (let i = 0; i < durationMs / FRAME_MS; i++)
      values.push(level)
  }
  return Float32Array.from(values)
}

/** Reads the envelope level at `at`, as the microphone would hear it `latencyMs` later. */
function levelAt(envelope: Float32Array, start: number, at: number): number {
  const index = Math.floor((at - start) / FRAME_MS)
  return index >= 0 && index < envelope.length ? envelope[index] : 0
}

/** Feeds one frame every 10 ms in `[from, to)` and returns each decision with its time. */
function feed(gate: EchoGate, from: number, to: number, mic: (at: number) => number) {
  const decisions: Array<{ at: number, decision: EchoGateDecision }> = []
  for (let at = from; at < to; at += FRAME_MS)
    decisions.push({ at, decision: gate.observeFrame(at, mic(at)) })
  return decisions
}

describe('createEchoGate', () => {
  it('keeps pure echo as self, before and after calibration', () => {
    const gate = createEchoGate()
    const envelope = envelopeOf([3000, 0.1])
    gate.startSelf({ id: 'a', at: START, envelope })

    // Speakers: the microphone hears her at 0.3 of the output level, 80 ms late.
    const decisions = feed(gate, START, START + 3000, at => 0.3 * levelAt(envelope, START, at - 80) + 0.001)

    expect(decisions.some(({ decision }) => decision.source === 'other')).toBe(false)
    expect(gate.calibration().calibrated).toBe(true)
    expect(decisions.at(-1)?.decision.reason).toBe('within-echo')
  })

  it('reports loud double-talk as other once calibrated', () => {
    const gate = createEchoGate()
    const envelope = envelopeOf([3000, 0.1])
    gate.startSelf({ id: 'a', at: START, envelope })
    const echo = (at: number) => 0.3 * levelAt(envelope, START, at - 80)

    feed(gate, START, START + 1000, echo)
    expect(gate.calibration().calibrated).toBe(true)

    // A person close to the microphone talks over her.
    const decisions = feed(gate, START + 1000, START + 1200, at => echo(at) + 0.2)

    expect(decisions.every(({ decision }) => decision.source === 'other')).toBe(true)
    expect(decisions[0].decision.reason).toBe('above-echo')
  })

  it('never answers other during playback before calibration, even for loud speech', () => {
    const gate = createEchoGate({ calibrationFrames: 50 })
    const envelope = envelopeOf([3000, 0.1])
    gate.startSelf({ id: 'a', at: START, envelope })

    // Someone talks loudly from the first frame. Until the gate has learned
    // the echo gain it cannot tell them from her, so it must not yield.
    const decisions = feed(gate, START, START + 490, at => 0.3 * levelAt(envelope, START, at - 80) + 0.3)

    expect(decisions.some(({ decision }) => decision.source === 'other')).toBe(false)
    expect(decisions.every(({ decision }) => decision.reason === 'uncalibrated')).toBe(true)
  })

  it('learns a higher gain from double-talk during calibration, which keeps later echo self', () => {
    const gate = createEchoGate()
    const envelope = envelopeOf([5000, 0.1])
    gate.startSelf({ id: 'a', at: START, envelope })
    const echo = (at: number) => 0.3 * levelAt(envelope, START, at - 80)

    feed(gate, START, START + 1000, at => echo(at) + 0.1)
    const after = feed(gate, START + 1000, START + 3000, echo)

    expect(gate.calibration().gain).toBeGreaterThan(0.3)
    expect(after.some(({ decision }) => decision.source === 'other')).toBe(false)
  })

  it('treats any audible sound outside her playback as other', () => {
    const gate = createEchoGate()

    expect(gate.observeFrame(START, 0.05)).toEqual({ source: 'other', reason: 'no-self-playback', predictedEcho: 0 })
    expect(gate.observeFrame(START + 10, 0.001)).toEqual({ source: 'silence', reason: 'below-noise-floor', predictedEcho: 0 })
  })

  it('keeps the echo tail as self after a stop, then hears others again', () => {
    const gate = createEchoGate()
    const envelope = envelopeOf([3000, 0.1])
    gate.startSelf({ id: 'a', at: START, envelope })
    feed(gate, START, START + 1000, at => 0.3 * levelAt(envelope, START, at - 80))

    gate.stopSelf('a', START + 1000)

    // latency 80 + tolerance 60 + tail 300: the microphone may still hear her.
    expect(gate.isSelfAudible(START + 1400)).toBe(true)
    expect(gate.observeFrame(START + 1100, 0.03).source).toBe('self')
    expect(gate.isSelfAudible(START + 1500)).toBe(false)
    expect(gate.observeFrame(START + 1500, 0.03)).toEqual({ source: 'other', reason: 'no-self-playback', predictedEcho: 0 })
  })

  it('ignores a stop for a playback it never saw', () => {
    const gate = createEchoGate()
    gate.startSelf({ id: 'a', at: START, envelope: envelopeOf([1000, 0.1]) })

    gate.stopSelf('unknown', START)

    expect(gate.isSelfAudible(START + 500)).toBe(true)
  })

  it('predicts echo at the configured latency', () => {
    // One second of steady speech to calibrate, a gap, then a loud burst.
    const envelope = envelopeOf([1000, 0.1], [400, 0], [100, 0.3], [500, 0])
    const echoArrivingAfter = (latencyMs: number) => (at: number) => 0.3 * levelAt(envelope, START, at - latencyMs) + 0.001
    const burstEcho = { from: START + 1400 + 200, to: START + 1500 + 200 }

    // The room really delays her by 200 ms, and the gate is told so.
    const matched = createEchoGate({ latencyMs: 200, latencyToleranceMs: 20, reverbDecayMs: 10 })
    matched.startSelf({ id: 'a', at: START, envelope })
    const matchedDecisions = feed(matched, START, START + 2000, echoArrivingAfter(200))
      .filter(({ at }) => at >= burstEcho.from && at < burstEcho.to)

    expect(matchedDecisions.some(({ decision }) => decision.source === 'other')).toBe(false)

    // Same room, but the gate expects no delay: the burst echo arrives after
    // the gate believes it ended, so it reads as someone else.
    const mismatched = createEchoGate({ latencyMs: 0, latencyToleranceMs: 20, reverbDecayMs: 10 })
    mismatched.startSelf({ id: 'a', at: START, envelope })
    const mismatchedDecisions = feed(mismatched, START, START + 2000, echoArrivingAfter(200))
      .filter(({ at }) => at >= burstEcho.from && at < burstEcho.to)

    expect(mismatchedDecisions.some(({ decision }) => decision.source === 'other')).toBe(true)
  })

  it('treats a non-finite microphone level as silence', () => {
    const gate = createEchoGate()

    expect(gate.observeFrame(START, Number.NaN).source).toBe('silence')
  })
})
