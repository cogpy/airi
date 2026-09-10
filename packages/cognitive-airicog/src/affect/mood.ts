/**
 * AiriCog Mood
 *
 * The package already carries affect in two places, and neither of them
 * persists: `Emotion` is a display label chosen per message for the avatar's
 * face, and an episode's `valence` is affect attached to one stored memory.
 * Between turns the character feels nothing in particular.
 *
 * Mood is the state that carries. It is moved by what happens, and it returns
 * to a baseline rather than to zero — the baseline is temperament, which is
 * what separates a cheerful character from a gloomy one given the same day.
 *
 * The model is the circumplex: valence (how pleasant) and arousal (how
 * activated) as independent axes. Two axes rather than a list of named feelings
 * because mood has to be *blended and decayed*, and "slightly less angry than a
 * minute ago" is arithmetic on an axis, not a step between labels.
 */

/**
 * An affective state at an instant.
 */
export interface Mood {
  /** How pleasant, `-1` (distressed) to `1` (delighted). */
  valence: number
  /** How activated, `0` (calm) to `1` (worked up). */
  arousal: number
  /** Epoch milliseconds this state describes. */
  at: number
}

/**
 * Something that happened, expressed as the pull it exerts on mood.
 */
export interface AffectiveEvent {
  /** Pleasantness of the event, `-1` to `1`. */
  valence: number
  /**
   * How activating it is, `0` to `1`.
   *
   * Defaults to the event's absolute valence: strong feelings of either sign
   * are rousing, and a neutral event is not.
   */
  arousal?: number
}

export interface MoodConfig {
  /**
   * Temperament: the valence the character settles back to.
   *
   * @default 0.1
   */
  baselineValence: number
  /**
   * The arousal the character settles back to.
   *
   * @default 0.3
   */
  baselineArousal: number
  /**
   * Time for valence to close half the distance back to baseline.
   *
   * Mood lingers: a bad exchange should still be faintly present several
   * minutes later, or the character reads as having no memory of how it felt.
   *
   * @default 600000
   */
  valenceHalfLifeMs: number
  /**
   * Time for arousal to close half the distance back to baseline.
   *
   * Shorter than valence deliberately — being startled wears off long before
   * being upset does.
   *
   * @default 120000
   */
  arousalHalfLifeMs: number
  /**
   * How far a single event pulls mood toward itself, `0` to `1`.
   *
   * At `1` one event replaces the mood outright; at `0` nothing moves it.
   *
   * @default 0.35
   */
  sensitivity: number
}

/**
 * The circumplex quadrants, as a coarse label a host can map onto its own
 * display emotions. `neutral` covers the middle, where naming a feeling would
 * overstate it.
 */
export type MoodDescriptor = 'excited' | 'content' | 'bored' | 'distressed' | 'neutral'

export function createDefaultMoodConfig(): MoodConfig {
  return {
    baselineValence: 0.1,
    baselineArousal: 0.3,
    valenceHalfLifeMs: 600_000,
    arousalHalfLifeMs: 120_000,
    sensitivity: 0.35,
  }
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value))
    return low === -1 ? 0 : low

  return Math.min(high, Math.max(low, value))
}

/**
 * Closes half the distance to `baseline` every `halfLifeMs`.
 *
 * Elapsed time that is zero or negative leaves the value untouched, so a clock
 * that has run backwards cannot age a mood.
 */
function towardBaseline(value: number, baseline: number, elapsedMs: number, halfLifeMs: number): number {
  if (elapsedMs <= 0)
    return value
  if (halfLifeMs <= 0)
    return baseline

  return baseline + (value - baseline) * 0.5 ** (elapsedMs / halfLifeMs)
}

/**
 * A mood sitting at its baseline — the character before anything has happened.
 */
export function createMood(at: number, config: Partial<MoodConfig> = {}): Mood {
  const resolved: MoodConfig = { ...createDefaultMoodConfig(), ...config }

  return {
    valence: clamp(resolved.baselineValence, -1, 1),
    arousal: clamp(resolved.baselineArousal, 0, 1),
    at,
  }
}

/**
 * The mood as it stands at `now`, having drifted back toward baseline.
 *
 * Pure and time-based rather than ticked: any caller can ask what the mood is
 * at an instant without anything having run in between.
 */
export function decayMood(mood: Mood, now: number, config: Partial<MoodConfig> = {}): Mood {
  const resolved: MoodConfig = { ...createDefaultMoodConfig(), ...config }
  const elapsed = now - mood.at

  return {
    valence: clamp(
      towardBaseline(mood.valence, resolved.baselineValence, elapsed, resolved.valenceHalfLifeMs),
      -1,
      1,
    ),
    arousal: clamp(
      towardBaseline(mood.arousal, resolved.baselineArousal, elapsed, resolved.arousalHalfLifeMs),
      0,
      1,
    ),
    at: elapsed > 0 ? now : mood.at,
  }
}

/**
 * The mood after something happened.
 *
 * Decays to `now` first, then pulls toward the event. Order matters: applying
 * the event first would let a burst of events arriving minutes apart compound
 * as though they were simultaneous.
 */
export function applyEvent(
  mood: Mood,
  event: AffectiveEvent,
  now: number,
  config: Partial<MoodConfig> = {},
): Mood {
  const resolved: MoodConfig = { ...createDefaultMoodConfig(), ...config }
  const current = decayMood(mood, now, resolved)

  const pull = clamp(resolved.sensitivity, 0, 1)
  const eventValence = clamp(event.valence, -1, 1)
  const eventArousal = clamp(event.arousal ?? Math.abs(eventValence), 0, 1)

  return {
    valence: clamp(current.valence + (eventValence - current.valence) * pull, -1, 1),
    arousal: clamp(current.arousal + (eventArousal - current.arousal) * pull, 0, 1),
    at: now,
  }
}

/**
 * Names the quadrant a mood sits in, for a host that needs a label.
 *
 * The dead zone around the centre is deliberate: most of the time the honest
 * answer is that the character is not visibly feeling anything, and a display
 * layer that switches expression on every small drift looks twitchy.
 *
 * @example
 * moodDescriptor({ valence: 0.6, arousal: 0.8, at: 0 }) // => 'excited'
 * moodDescriptor({ valence: -0.6, arousal: 0.2, at: 0 }) // => 'bored'
 */
export function moodDescriptor(mood: Mood, deadZone: number = 0.2): MoodDescriptor {
  const pleasant = mood.valence > deadZone
  const unpleasant = mood.valence < -deadZone

  if (!pleasant && !unpleasant)
    return 'neutral'

  // Arousal is measured against its own midpoint, not the dead zone, since it
  // runs 0 to 1 rather than -1 to 1.
  const activated = mood.arousal > 0.5

  if (pleasant)
    return activated ? 'excited' : 'content'

  return activated ? 'distressed' : 'bored'
}
