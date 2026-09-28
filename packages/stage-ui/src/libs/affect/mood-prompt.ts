import type { AffectiveEvent, Mood, MoodConfig } from '@proj-airi/cognitive-airicog/affect'

import { applyEvent, createMood, decayMood, moodDescriptor } from '@proj-airi/cognitive-airicog/affect'

import { Emotion } from '../../constants/emotions'

/**
 * How each display emotion moves the mood underneath it.
 *
 * The character already picks one of these per reply, so it is affect the
 * runtime gets for free — no sentiment pass, no extra model call. Expressing a
 * feeling and having one are not the same thing, but over a conversation the
 * expressed emotions are the best available evidence of where the character
 * actually sits.
 *
 * Valence runs `-1` to `1`, arousal `0` to `1`. Anger and sadness share a
 * valence and differ almost entirely in arousal, which is the distinction the
 * two-axis model exists to keep.
 */
const EMOTION_AFFECT: Record<Emotion, AffectiveEvent> = {
  [Emotion.Happy]: { valence: 0.8, arousal: 0.6 },
  [Emotion.Sad]: { valence: -0.7, arousal: 0.25 },
  [Emotion.Angry]: { valence: -0.7, arousal: 0.9 },
  [Emotion.Awkward]: { valence: -0.35, arousal: 0.6 },
  [Emotion.Curious]: { valence: 0.45, arousal: 0.6 },
  [Emotion.Surprise]: { valence: 0.1, arousal: 0.9 },
  [Emotion.Think]: { valence: 0, arousal: 0.35 },
  [Emotion.Question]: { valence: 0, arousal: 0.4 },
  [Emotion.Neutral]: { valence: 0, arousal: 0.3 },
}

/**
 * The affective pull of a display emotion the character just expressed.
 */
export function emotionToAffectiveEvent(emotion: Emotion): AffectiveEvent {
  return EMOTION_AFFECT[emotion] ?? EMOTION_AFFECT[Emotion.Neutral]
}

/** Phrasing for each quadrant, as the character would be told it. */
const MOOD_PHRASING: Record<Exclude<ReturnType<typeof moodDescriptor>, 'neutral'>, string> = {
  excited: 'buoyant and energised',
  content: 'settled and quietly pleased',
  distressed: 'rattled and on edge',
  bored: 'flat and disengaged',
}

/**
 * One line describing how the character currently feels, for the model prompt.
 *
 * Returns `undefined` at neutral. A character told every turn that it feels
 * nothing in particular is being handed prompt tokens and a nudge toward
 * performing blandness; saying nothing is both cheaper and truer.
 *
 * The instruction is deliberately to let the mood colour tone rather than to
 * announce it — a model told it feels rattled will otherwise say "I feel
 * rattled", which is not how a mood shows.
 *
 * @example
 * describeMoodForPrompt({ valence: -0.6, arousal: 0.8, at: 0 })
 * // => 'Right now you feel rattled and on edge. Let it colour your tone ...'
 */
export function describeMoodForPrompt(mood: Mood, deadZone?: number): string | undefined {
  const descriptor = moodDescriptor(mood, deadZone)
  if (descriptor === 'neutral')
    return undefined

  return `Right now you feel ${MOOD_PHRASING[descriptor]}. Let it colour your tone and word choice; do not announce it or explain it.`
}

export interface MoodTracker {
  /** The mood as it stands now, decayed to this instant. */
  current: (at?: number) => Mood
  /** Records a display emotion the character just expressed. */
  noteEmotion: (emotion: Emotion, at?: number) => Mood
  /** Records anything else that carries affect, such as being talked over. */
  noteEvent: (event: AffectiveEvent, at?: number) => Mood
  /** The prompt line for the current mood, or undefined at neutral. */
  promptLine: (at?: number) => string | undefined
  /** Returns the character to its temperament. */
  reset: (at?: number) => void
}

/**
 * Holds a mood across turns.
 *
 * Deliberately framework-free and clock-injected, like the barge-in
 * controller: the interesting behaviour is all timing, and it should be
 * testable without a component tree.
 */
export function createMoodTracker(
  options: { now?: () => number, config?: Partial<MoodConfig> } = {},
): MoodTracker {
  const now = options.now ?? (() => Date.now())
  const config = options.config

  let mood = createMood(now(), config)

  function current(at: number = now()): Mood {
    return decayMood(mood, at, config)
  }

  function noteEvent(event: AffectiveEvent, at: number = now()): Mood {
    mood = applyEvent(mood, event, at, config)
    return mood
  }

  return {
    current,
    noteEmotion: (emotion, at) => noteEvent(emotionToAffectiveEvent(emotion), at),
    noteEvent,
    promptLine: at => describeMoodForPrompt(current(at)),
    reset: (at = now()) => {
      mood = createMood(at, config)
    },
  }
}

/**
 * The pull of being talked over.
 *
 * Mildly unpleasant and quite rousing — being cut off is not an insult, but a
 * character that registers nothing at all when it happens reads as inert.
 */
export const INTERRUPTED_AFFECT: AffectiveEvent = { valence: -0.3, arousal: 0.7 }
