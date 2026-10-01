/**
 * Decides, for each microphone frame, whether the sound is the character's own
 * echo or another participant speaking over her.
 *
 * This is residual-energy double-talk detection, not echo cancellation. It
 * does not clean the audio. It only answers "who is talking". Transcription
 * stays suppressed while the character speaks.
 *
 * Tuning:
 * - Every default here was chosen from first principles, not from recordings.
 *   The safe failure is "no barge-in": when the gate is unsure, it answers
 *   `self`, so the character keeps talking instead of stopping herself.
 */
export interface EchoGateConfig {
  /**
   * Length of one envelope frame, in milliseconds. It must match the
   * `frameMs` used for `energyEnvelope` on the self channel.
   *
   * @default 10
   */
  frameMs: number
  /**
   * Expected delay from the playback start event to the echo reaching the
   * microphone: output buffering, the air path, and input buffering.
   *
   * The playback manager stamps `startedAt` before the audio node starts, so
   * this also covers the time to schedule the node.
   *
   * @default 80
   */
  latencyMs: number
  /**
   * How far the real latency may differ from {@link latencyMs}. The gate
   * predicts echo from the loudest self frame in this window on each side, so
   * a wrong latency makes the prediction too high (safe) rather than too low.
   *
   * Raising it tolerates more latency error but hides more double-talk.
   *
   * @default 60
   */
  latencyToleranceMs: number
  /**
   * Time constant of the room reverberation the gate assumes, in
   * milliseconds. Echo of a loud syllable decays by `1/e` in this time, so a
   * short pause between her words is still predicted as echo.
   *
   * Raising it makes her word gaps safer and late interruptions harder to hear.
   *
   * @default 80
   */
  reverbDecayMs: number
  /**
   * How long after a playback ends the gate still treats the microphone as
   * possibly hearing her, in addition to latency and tolerance.
   *
   * Without it, the echo tail of her last word reads as someone else starting
   * to speak.
   *
   * @default 300
   */
  tailMs: number
  /**
   * How many times louder than the predicted echo (plus ambient noise) a
   * microphone frame must be to count as another person.
   *
   * `2` is about 6 dB. Raising it makes interruptions harder; lowering it
   * risks her stopping for her own echo.
   *
   * @default 2
   */
  marginRatio: number
  /**
   * Microphone RMS below this is silence, never speech. Linear RMS in the
   * `-1` to `1` sample scale.
   *
   * @default 0.004
   */
  noiseFloorRms: number
  /**
   * Self frames quieter than this teach the gate nothing about the echo gain:
   * the ratio of two near-silent values is noise.
   *
   * @default 0.01
   */
  selfFloorRms: number
  /**
   * Number of self frames the gate must learn from before it may answer
   * `other` during her playback. 50 frames of 10 ms is half a second of her
   * voice.
   *
   * @default 50
   */
  calibrationFrames: number
  /**
   * Weight of each new self frame in the echo gain average. Higher adapts
   * faster to a volume change and is noisier.
   *
   * @default 0.05
   */
  learningRate: number
  /**
   * Smallest echo gain (microphone RMS per output RMS) the gate will learn.
   * Headphones drive the gain toward this value.
   *
   * @default 0.001
   */
  minGain: number
  /**
   * Largest echo gain the gate will learn. It stops a single wild frame from
   * making the gate deaf to everyone.
   *
   * @default 10
   */
  maxGain: number
}

/**
 * Returns the documented echo-gate defaults.
 */
export function createDefaultEchoGateConfig(): EchoGateConfig {
  return {
    frameMs: 10,
    latencyMs: 80,
    latencyToleranceMs: 60,
    reverbDecayMs: 80,
    tailMs: 300,
    marginRatio: 2,
    noiseFloorRms: 0.004,
    selfFloorRms: 0.01,
    calibrationFrames: 50,
    learningRate: 0.05,
    minGain: 0.001,
    maxGain: 10,
  }
}

/** A self playback registered with the gate. */
export interface SelfPlayback {
  /** Correlates `startSelf` with `stopSelf`. The playback item id. */
  id: string
  /** When playback started, in `Date.now()` milliseconds. */
  at: number
  /** Loudness of the played audio, one value per `frameMs`. */
  envelope: Float32Array
}

/**
 * The answer for one microphone frame, with the reason.
 *
 * - `silence` / `below-noise-floor`: nobody is audible.
 * - `other` / `no-self-playback`: she is not audible, so any sound is someone else.
 * - `other` / `above-echo`: the microphone is louder than her echo can explain.
 * - `self` / `uncalibrated`: she is audible and the gate has not learned the
 *   echo gain yet, so it assumes the sound is her.
 * - `self` / `within-echo`: her echo explains the sound.
 *
 * `predictedEcho` is the microphone RMS her echo alone would give at this
 * frame, `0` until calibrated.
 */
export type EchoGateDecision
  = | { source: 'silence', reason: 'below-noise-floor', predictedEcho: number }
    | { source: 'other', reason: 'no-self-playback' | 'above-echo', predictedEcho: number }
    | { source: 'self', reason: 'uncalibrated' | 'within-echo', predictedEcho: number }

/** What the gate has learned so far. */
export interface EchoGateCalibration {
  /** Learned microphone RMS per output RMS. `undefined` before the first sample. */
  gain: number | undefined
  /** Self frames learned from. */
  frames: number
  /** Whether {@link frames} reached `calibrationFrames`. */
  calibrated: boolean
  /** Running estimate of the microphone's noise level during her playback. */
  ambientRms: number
}

export interface EchoGate {
  /** Registers a playback that started. A repeated id replaces the earlier one. */
  startSelf: (playback: SelfPlayback) => void
  /**
   * Marks a playback as stopped at `at`. Envelope frames after `at` no longer
   * predict echo; the tail window still runs from `at`. Unknown ids are
   * ignored, because the playback manager may report a stop for an item the
   * gate never saw (for example, one rejected before it started).
   */
  stopSelf: (id: string, at: number) => void
  /**
   * Classifies one microphone frame and learns from it.
   *
   * Side effects: during her playback, a frame that is not `other` updates the
   * echo gain and the ambient noise estimate. Playbacks whose tail has passed
   * are dropped.
   */
  observeFrame: (at: number, micRms: number) => EchoGateDecision
  /** Whether the microphone may hear her at `at`. Pure read. */
  isSelfAudible: (at: number) => boolean
  /** A copy of the learned state. Pure read. */
  calibration: () => EchoGateCalibration
}

/** Rate at which the ambient estimate falls toward a quieter frame. */
const AMBIENT_FALL_RATE = 0.1
/**
 * Rate at which the ambient estimate rises toward a louder frame. It is slow
 * (a time constant of about 5 s at 10 ms frames), so her speech and a person's
 * speech barely move it.
 */
const AMBIENT_RISE_RATE = 0.002
/** Reverberation older than this many time constants is below 2% and ignored. */
const REVERB_LOOKBACK_CONSTANTS = 4

function finiteOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Creates an echo gate.
 *
 * State model:
 *
 * - Playback window (runtime state, per playback). A playback is audible from
 *   its start until its end (stop time, or the envelope's end) plus
 *   `latencyMs + latencyToleranceMs + tailMs`. Inside any window, a frame is
 *   judged against the predicted echo. Outside every window, any sound above
 *   the noise floor is `other`.
 * - Calibration (learned state, kept for the gate's lifetime). The gate
 *   learns the echo gain from frames inside a window where her envelope is
 *   loud and the frame was not judged `other`. Until it has
 *   `calibrationFrames` such frames, every frame inside a window is `self`.
 *   Double-talk during calibration raises the gain, which makes the gate
 *   answer `self` more often: the safe direction.
 * - Ambient noise (learned state). A slow tracker of the microphone level
 *   during her playback, added to the predicted echo so room noise in her
 *   word gaps does not read as another person.
 *
 * The gate never reads a clock. Callers pass `Date.now()` times for both
 * playback and microphone frames.
 */
export function createEchoGate(config: Partial<EchoGateConfig> = {}): EchoGate {
  const resolved: EchoGateConfig = { ...createDefaultEchoGateConfig(), ...config }
  const playbacks = new Map<string, { at: number, envelope: Float32Array, stoppedAt?: number }>()

  let gain: number | undefined
  let frames = 0
  let ambientRms = resolved.noiseFloorRms

  function audibleUntil(playback: { at: number, envelope: Float32Array, stoppedAt?: number }): number {
    const envelopeEnd = playback.at + playback.envelope.length * resolved.frameMs
    const end = playback.stoppedAt === undefined ? envelopeEnd : Math.min(envelopeEnd, playback.stoppedAt)
    return end + resolved.latencyMs + resolved.latencyToleranceMs + resolved.tailMs
  }

  function isSelfAudible(at: number): boolean {
    for (const playback of playbacks.values()) {
      if (at >= playback.at && at <= audibleUntil(playback))
        return true
    }
    return false
  }

  function prune(at: number): void {
    const reverbSpan = resolved.reverbDecayMs * REVERB_LOOKBACK_CONSTANTS
    for (const [id, playback] of playbacks) {
      if (at > audibleUntil(playback) + reverbSpan)
        playbacks.delete(id)
    }
  }

  /**
   * The envelope level that reaches the microphone at `at`, before the echo
   * gain.
   *
   * The reference time is `at - latencyMs`. Frames within the tolerance on
   * either side count fully, so the loudest one wins. Older frames count with
   * exponential reverb decay. Frames after a stop never count.
   */
  function predictSelfLevel(at: number): number {
    const reference = at - resolved.latencyMs
    const newest = reference + resolved.latencyToleranceMs
    const fullWeightFrom = reference - resolved.latencyToleranceMs
    const oldest = fullWeightFrom - resolved.reverbDecayMs * REVERB_LOOKBACK_CONSTANTS

    let level = 0
    for (const playback of playbacks.values()) {
      const lastFrame = playback.envelope.length - 1
      const firstIndex = Math.max(0, Math.floor((oldest - playback.at) / resolved.frameMs))
      const lastIndex = Math.min(lastFrame, Math.floor((newest - playback.at) / resolved.frameMs))
      for (let index = firstIndex; index <= lastIndex; index++) {
        const frameAt = playback.at + index * resolved.frameMs
        if (playback.stoppedAt !== undefined && frameAt >= playback.stoppedAt)
          break

        const age = fullWeightFrom - frameAt
        const weight = age > 0 ? Math.exp(-age / resolved.reverbDecayMs) : 1
        level = Math.max(level, playback.envelope[index] * weight)
      }
    }
    return level
  }

  function learn(micRms: number, selfLevel: number): void {
    if (micRms < ambientRms)
      ambientRms += (micRms - ambientRms) * AMBIENT_FALL_RATE
    else
      ambientRms += (micRms - ambientRms) * AMBIENT_RISE_RATE

    if (selfLevel < resolved.selfFloorRms)
      return

    const sample = Math.min(resolved.maxGain, Math.max(resolved.minGain, micRms / selfLevel))
    gain = gain === undefined ? sample : gain + (sample - gain) * resolved.learningRate
    frames += 1
  }

  function observeFrame(at: number, rawMicRms: number): EchoGateDecision {
    const micRms = finiteOrZero(rawMicRms)
    prune(at)

    if (!isSelfAudible(at)) {
      if (micRms < resolved.noiseFloorRms)
        return { source: 'silence', reason: 'below-noise-floor', predictedEcho: 0 }
      return { source: 'other', reason: 'no-self-playback', predictedEcho: 0 }
    }

    const selfLevel = predictSelfLevel(at)
    const calibrated = frames >= resolved.calibrationFrames && gain !== undefined
    const predictedEcho = calibrated ? (gain ?? 0) * selfLevel : 0
    const threshold = resolved.marginRatio * (predictedEcho + ambientRms)
    const isOther = calibrated && micRms >= resolved.noiseFloorRms && micRms > threshold

    // Learn only from frames her echo can explain. A frame judged `other`
    // contains someone else, and learning from it would make the gate deaf to
    // the next interruption.
    if (!isOther)
      learn(micRms, selfLevel)

    if (micRms < resolved.noiseFloorRms)
      return { source: 'silence', reason: 'below-noise-floor', predictedEcho }
    if (!calibrated)
      return { source: 'self', reason: 'uncalibrated', predictedEcho }
    if (isOther)
      return { source: 'other', reason: 'above-echo', predictedEcho }
    return { source: 'self', reason: 'within-echo', predictedEcho }
  }

  return {
    startSelf(playback) {
      playbacks.set(playback.id, { at: playback.at, envelope: playback.envelope })
    },
    stopSelf(id, at) {
      const playback = playbacks.get(id)
      if (!playback || playback.stoppedAt !== undefined)
        return
      playback.stoppedAt = at
    },
    observeFrame,
    isSelfAudible,
    calibration: () => ({
      gain,
      frames,
      calibrated: frames >= resolved.calibrationFrames && gain !== undefined,
      ambientRms,
    }),
  }
}
