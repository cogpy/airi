import { describe, expect, it } from 'vitest'

import { Emotion } from '../../constants/emotions'
import {
  createMoodTracker,
  describeMoodForPrompt,
  emotionToAffectiveEvent,
  INTERRUPTED_AFFECT,
} from './mood-prompt'

const NOW = 1_000_000

describe('emotionToAffectiveEvent', () => {
  it('maps every display emotion the character can pick', () => {
    for (const emotion of Object.values(Emotion)) {
      const event = emotionToAffectiveEvent(emotion)

      expect(event.valence).toBeGreaterThanOrEqual(-1)
      expect(event.valence).toBeLessThanOrEqual(1)
      expect(event.arousal).toBeGreaterThanOrEqual(0)
      expect(event.arousal).toBeLessThanOrEqual(1)
    }
  })

  it('separates anger from sadness by arousal, not by valence', () => {
    // The distinction the two-axis model exists to keep: both are unpleasant,
    // one is worked up and the other is not.
    const angry = emotionToAffectiveEvent(Emotion.Angry)
    const sad = emotionToAffectiveEvent(Emotion.Sad)

    expect(angry.valence).toBeCloseTo(sad.valence)
    expect(angry.arousal!).toBeGreaterThan(sad.arousal!)
  })

  it('treats happiness as pleasant and sadness as not', () => {
    expect(emotionToAffectiveEvent(Emotion.Happy).valence).toBeGreaterThan(0)
    expect(emotionToAffectiveEvent(Emotion.Sad).valence).toBeLessThan(0)
  })

  it('falls back to neutral for an emotion it does not know', () => {
    const unknown = emotionToAffectiveEvent('nonsense' as Emotion)

    expect(unknown).toEqual(emotionToAffectiveEvent(Emotion.Neutral))
  })
})

describe('describeMoodForPrompt', () => {
  it('says nothing when nothing shows', () => {
    // A character told each turn that it feels nothing is being handed prompt
    // tokens and a nudge toward performing blandness.
    expect(describeMoodForPrompt({ valence: 0.05, arousal: 0.3, at: NOW })).toBeUndefined()
  })

  it('describes a mood that does show', () => {
    const line = describeMoodForPrompt({ valence: -0.6, arousal: 0.8, at: NOW })

    expect(line).toContain('rattled')
  })

  it('tells the model to colour its tone rather than announce the mood', () => {
    const line = describeMoodForPrompt({ valence: 0.7, arousal: 0.8, at: NOW })

    expect(line).toMatch(/do not announce it/i)
  })

  it('gives each quadrant its own phrasing', () => {
    const lines = [
      describeMoodForPrompt({ valence: 0.7, arousal: 0.8, at: NOW }),
      describeMoodForPrompt({ valence: 0.7, arousal: 0.2, at: NOW }),
      describeMoodForPrompt({ valence: -0.7, arousal: 0.8, at: NOW }),
      describeMoodForPrompt({ valence: -0.7, arousal: 0.2, at: NOW }),
    ]

    expect(new Set(lines).size).toBe(4)
  })

  it('takes a wider dead zone for a character that shows less', () => {
    const mood = { valence: 0.3, arousal: 0.8, at: NOW }

    expect(describeMoodForPrompt(mood)).toBeDefined()
    expect(describeMoodForPrompt(mood, 0.5)).toBeUndefined()
  })
})

describe('createMoodTracker', () => {
  function trackerAt(start: number) {
    let clock = start
    const tracker = createMoodTracker({ now: () => clock })

    function advance(ms: number) {
      clock += ms
    }

    return { tracker, advance }
  }

  it('starts with nothing showing', () => {
    const { tracker } = trackerAt(NOW)

    expect(tracker.promptLine()).toBeUndefined()
  })

  it('does not let a single expressed emotion flip the whole mood', () => {
    // If one emotion moved the mood outright, mood would be a copy of the last
    // message and would add nothing over the per-message Emotion that already
    // exists. What it contributes is accumulation.
    const { tracker } = trackerAt(NOW)

    tracker.noteEmotion(Emotion.Angry)

    expect(tracker.current().valence).toBeLessThan(0)
    expect(tracker.promptLine()).toBeUndefined()
  })

  it('carries a sustained mood into the next turn', () => {
    // The whole point: the character has been angry, and the next prompt
    // should still know it.
    const { tracker, advance } = trackerAt(NOW)

    tracker.noteEmotion(Emotion.Angry)
    advance(2000)
    tracker.noteEmotion(Emotion.Angry)
    advance(30_000)

    expect(tracker.promptLine()).toContain('rattled')
  })

  it('lets a mood fade rather than persisting forever', () => {
    const { tracker, advance } = trackerAt(NOW)

    tracker.noteEmotion(Emotion.Angry)
    advance(3_600_000)

    expect(tracker.promptLine()).toBeUndefined()
  })

  it('builds up when the character keeps expressing the same feeling', () => {
    const { tracker, advance } = trackerAt(NOW)

    tracker.noteEmotion(Emotion.Happy)
    const afterOne = tracker.current().valence

    for (let i = 0; i < 3; i++) {
      advance(5000)
      tracker.noteEmotion(Emotion.Happy)
    }

    expect(tracker.current().valence).toBeGreaterThan(afterOne)
  })

  it('turns around when the conversation does', () => {
    const { tracker, advance } = trackerAt(NOW)

    tracker.noteEmotion(Emotion.Sad)
    const low = tracker.current().valence

    for (let i = 0; i < 4; i++) {
      advance(10_000)
      tracker.noteEmotion(Emotion.Happy)
    }

    expect(tracker.current().valence).toBeGreaterThan(low)
  })

  it('registers being talked over', () => {
    const { tracker } = trackerAt(NOW)

    const before = tracker.current().valence
    tracker.noteEvent(INTERRUPTED_AFFECT)

    expect(tracker.current().valence).toBeLessThan(before)
    expect(tracker.current().arousal).toBeGreaterThan(0.3)
  })

  it('decays between events rather than compounding them', () => {
    const spaced = trackerAt(NOW)
    spaced.tracker.noteEmotion(Emotion.Happy)
    spaced.advance(3_600_000)
    spaced.tracker.noteEmotion(Emotion.Happy)

    const fresh = trackerAt(NOW + 3_600_000)
    fresh.tracker.noteEmotion(Emotion.Happy)

    expect(spaced.tracker.current().valence).toBeCloseTo(fresh.tracker.current().valence, 2)
  })

  it('returns to temperament when reset', () => {
    const { tracker } = trackerAt(NOW)

    tracker.noteEmotion(Emotion.Angry)
    tracker.reset()

    expect(tracker.promptLine()).toBeUndefined()
  })
})
