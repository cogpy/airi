import type { AudioWindow } from '@proj-airi/pipelines-audio'

import type { EchoGate } from './echo-gate'

import { energyEnvelope } from './energy-envelope'

/**
 * Settings for the echo classifier, the voice pipeline's check for speech
 * over the character's own echo.
 */
export interface EchoClassifierConfig {
  /**
   * Length of one microphone frame given to the echo gate, in milliseconds.
   * Keep it equal to the gate's `frameMs`, so microphone and envelope frames
   * have the same length.
   *
   * @default 10
   */
  frameMs: number
  /**
   * Consecutive frames the gate must judge `other` before the classifier
   * accepts speech over her echo. Five 10 ms frames is 50 ms: one click or
   * one loud syllable of her echo does not stop her.
   *
   * Raising it makes her slower to yield. Lowering it makes her stop for
   * short noises.
   *
   * @default 5
   */
  onsetFrames: number
  /**
   * How fast the clock offset estimate can rise, in milliseconds per second
   * of wall time. It lets the estimate follow a microphone clock that runs
   * slower than `Date.now()`, so the error does not grow over a long session.
   *
   * The estimate never goes above the offset of the current window, so a
   * larger value only lets a short delay spike count for less time.
   *
   * @default 1
   */
  clockRiseMsPerSecond: number
}

/** Returns the documented echo classifier defaults. */
export function createDefaultEchoClassifierConfig(): EchoClassifierConfig {
  return { frameMs: 10, onsetFrames: 5, clockRiseMsPerSecond: 1 }
}

/**
 * The answer for one voice activity window, with the reason.
 *
 * - `accept` / `above-echo`: the gate judged `onsetFrames` consecutive frames
 *   louder than her echo can explain. Someone talks over her.
 * - `self-inaudible`: no published playback of hers is audible at the end of
 *   the window. The classifier has no echo to compare with, so it does not
 *   accept. The caller keeps its own rule for this case.
 * - `onset`: some frames were `other`, but fewer than `onsetFrames` in a row.
 * - `uncalibrated`: she is audible and the gate has not learned her echo level.
 * - `within-echo`: her echo explains the last frame.
 * - `silence`: the last frame is below the gate's noise floor.
 *
 * `otherFrames` is the current run of consecutive `other` frames.
 */
export type EchoClassifierDecision
  = | { accept: true, reason: 'above-echo', otherFrames: number }
    | { accept: false, reason: 'self-inaudible' | 'onset' | 'uncalibrated' | 'within-echo' | 'silence', otherFrames: number }

export interface EchoClassifier {
  /**
   * Feeds one microphone window to the echo gate and decides whether it
   * contains speech over her echo.
   *
   * `now` is `Date.now()` at the call. The classifier dates the window's
   * frames from it, on the same clock as the self playback times.
   */
  classify: (window: AudioWindow, now: number) => EchoClassifierDecision
}

/**
 * Creates an echo classifier on top of an echo gate.
 *
 * Clock:
 *
 * The gate compares microphone frames with self playbacks that the self
 * channel dates with `Date.now()` when a clip starts. A window carries only
 * sample positions of its source, so the classifier maps positions to
 * `Date.now()` time:
 *
 *   frameTime = offset + endSample * 1000 / sampleRate
 *
 * `endSample` is the position after the last sample of the frame. For each
 * source, `offset` is the smallest value of `now - windowEnd * 1000 /
 * sampleRate` seen so far, where `windowEnd` is the window's `endFrame`. A
 * window always arrives after its last sample, so each value is too large
 * by the queue and detection delay of that window. The smallest one is the
 * best estimate of the moment a sample reached the renderer. The gate's
 * `latencyMs` already includes the input buffering before that moment.
 *
 * The estimate can rise by `clockRiseMsPerSecond`, so a slow microphone clock
 * does not leave it behind. A new source id starts a new estimate, because
 * sample positions restart with each source connection.
 *
 * State model:
 *
 * - Clock offset (runtime state, per source id), as above.
 * - Onset run (runtime state). Consecutive `other` frames. A gap between
 *   windows, a discontinuity, a frame that is not `other`, and a frame where
 *   she is not audible end the run. An acceptance resets it, because the
 *   pipeline starts an input and sends no more windows until it ends.
 * - Gate state. The gate learns from every frame this classifier feeds.
 *   The pipeline sends only windows that can start an input, so the gate
 *   learns her echo level only from windows where voice detection fires.
 */
export function createEchoClassifier(gate: EchoGate, config: Partial<EchoClassifierConfig> = {}): EchoClassifier {
  const resolved: EchoClassifierConfig = { ...createDefaultEchoClassifierConfig(), ...config }
  let clock: { sourceId: string, sampleRate: number, offset: number, at: number } | undefined
  let lastEnd: { sourceId: string, frame: number } | undefined
  let otherFrames = 0

  function offsetFor(window: AudioWindow, now: number): number {
    const { sourceId, endFrame } = window.range
    const observed = now - endFrame * 1000 / window.sampleRate
    if (!clock || clock.sourceId !== sourceId || clock.sampleRate !== window.sampleRate) {
      clock = { sourceId, sampleRate: window.sampleRate, offset: observed, at: now }
      return observed
    }

    // A clock that ran backward is not elapsed time.
    const elapsed = Math.max(0, now - clock.at)
    clock.offset = Math.min(observed, clock.offset + elapsed * resolved.clockRiseMsPerSecond / 1000)
    clock.at = now
    return clock.offset
  }

  function classify(window: AudioWindow, now: number): EchoClassifierDecision {
    const { sourceId, startFrame, endFrame } = window.range
    const offset = offsetFor(window, now)

    // The run continues only from the window that ends where this one starts.
    // An overlap continues too: its frames already fed are skipped below.
    const continues = !window.discontinuity
      && lastEnd?.sourceId === sourceId
      && startFrame <= lastEnd.frame
      && lastEnd.frame <= endFrame
    if (!continues)
      otherFrames = 0
    const from = continues && lastEnd ? lastEnd.frame : startFrame
    lastEnd = { sourceId, frame: endFrame }

    const frameSize = Math.max(1, Math.round(window.sampleRate * resolved.frameMs / 1000))
    const envelope = energyEnvelope({
      sampleRate: window.sampleRate,
      numberOfChannels: window.channels.length,
      getChannelData: channel => window.channels[channel].subarray(from - startFrame),
    }, resolved.frameMs)
    // A short last frame is a few samples, too few for a stable loudness.
    const fullFrames = Math.floor((endFrame - from) / frameSize)

    // The run length at the frame that reached `onsetFrames`. Later frames of
    // the window still feed the gate, but do not change the answer.
    let acceptedRun = 0
    let lastReason: Exclude<EchoClassifierDecision['reason'], 'above-echo' | 'onset'> = 'silence'
    let lastAt = offset + endFrame * 1000 / window.sampleRate
    for (let index = 0; index < fullFrames; index++) {
      lastAt = offset + (from + (index + 1) * frameSize) * 1000 / window.sampleRate
      const decision = gate.observeFrame(lastAt, envelope[index])
      if (decision.source === 'other' && decision.reason === 'above-echo') {
        otherFrames += 1
        if (acceptedRun === 0 && otherFrames >= resolved.onsetFrames)
          acceptedRun = otherFrames
        continue
      }

      otherFrames = 0
      if (decision.source === 'other')
        lastReason = 'self-inaudible'
      else if (decision.source === 'silence')
        lastReason = gate.isSelfAudible(lastAt) ? 'silence' : 'self-inaudible'
      else
        lastReason = decision.reason
    }

    if (acceptedRun > 0) {
      otherFrames = 0
      return { accept: true, reason: 'above-echo', otherFrames: acceptedRun }
    }
    if (!gate.isSelfAudible(lastAt)) {
      otherFrames = 0
      return { accept: false, reason: 'self-inaudible', otherFrames: 0 }
    }
    if (otherFrames > 0)
      return { accept: false, reason: 'onset', otherFrames }
    return { accept: false, reason: lastReason, otherFrames }
  }

  return { classify }
}
