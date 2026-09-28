import { describe, expect, it } from 'vitest'

import {
  applyEvent,
  createDefaultMoodConfig,
  createMood,
  decayMood,
  moodDescriptor,
} from './mood'

const NOW = 1_000_000
const config = createDefaultMoodConfig()

describe('createMood', () => {
  it('starts at the character\'s temperament, not at zero', () => {
    const mood = createMood(NOW)

    expect(mood.valence).toBe(config.baselineValence)
    expect(mood.arousal).toBe(config.baselineArousal)
  })

  it('takes a different temperament from config', () => {
    const gloomy = createMood(NOW, { baselineValence: -0.4 })

    expect(gloomy.valence).toBe(-0.4)
  })
})

describe('applyEvent', () => {
  it('pulls mood toward what happened', () => {
    const after = applyEvent(createMood(NOW), { valence: 1 }, NOW)

    expect(after.valence).toBeGreaterThan(config.baselineValence)
    expect(after.at).toBe(NOW)
  })

  it('pulls the other way for an unpleasant event', () => {
    const after = applyEvent(createMood(NOW), { valence: -1 }, NOW)

    expect(after.valence).toBeLessThan(config.baselineValence)
  })

  it('moves by the configured share of the distance', () => {
    // Sensitivity 0.5 from baseline 0 toward +1 lands halfway.
    const after = applyEvent(
      createMood(NOW, { baselineValence: 0 }),
      { valence: 1 },
      NOW,
      { baselineValence: 0, sensitivity: 0.5 },
    )

    expect(after.valence).toBeCloseTo(0.5)
  })

  it('never leaves the unit range however hard it is pushed', () => {
    let mood = createMood(NOW)

    for (let i = 0; i < 100; i++)
      mood = applyEvent(mood, { valence: 1, arousal: 1 }, NOW, { sensitivity: 1 })

    expect(mood.valence).toBeLessThanOrEqual(1)
    expect(mood.arousal).toBeLessThanOrEqual(1)
  })

  it('treats a strong feeling of either sign as rousing', () => {
    const calm = createMood(NOW, { baselineArousal: 0 })

    const upset = applyEvent(calm, { valence: -1 }, NOW, { baselineArousal: 0 })
    const delighted = applyEvent(calm, { valence: 1 }, NOW, { baselineArousal: 0 })

    expect(upset.arousal).toBeCloseTo(delighted.arousal)
    expect(upset.arousal).toBeGreaterThan(0)
  })

  it('leaves a bland event barely rousing at all', () => {
    const after = applyEvent(createMood(NOW, { baselineArousal: 0 }), { valence: 0 }, NOW, {
      baselineArousal: 0,
    })

    expect(after.arousal).toBeCloseTo(0)
  })

  it('decays before applying, so events minutes apart do not compound', () => {
    // Two identical events an hour apart should leave the character no more
    // wound up than the second one alone from a rested state.
    const spaced = applyEvent(
      applyEvent(createMood(NOW), { valence: 1 }, NOW),
      { valence: 1 },
      NOW + 3_600_000,
    )
    const single = applyEvent(createMood(NOW + 3_600_000), { valence: 1 }, NOW + 3_600_000)

    expect(spaced.valence).toBeCloseTo(single.valence, 2)
  })

  it('compounds when the events arrive together', () => {
    const once = applyEvent(createMood(NOW), { valence: 1 }, NOW)
    const twice = applyEvent(once, { valence: 1 }, NOW)

    expect(twice.valence).toBeGreaterThan(once.valence)
  })

  it('does not mutate the mood it was given', () => {
    const mood = createMood(NOW)
    const before = { ...mood }

    applyEvent(mood, { valence: -1 }, NOW + 1000)

    expect(mood).toEqual(before)
  })
})

describe('decayMood', () => {
  it('closes half the distance to baseline in one half-life', () => {
    const upset = applyEvent(createMood(NOW), { valence: -1 }, NOW, { sensitivity: 1 })

    const later = decayMood(upset, NOW + config.valenceHalfLifeMs)

    const distanceBefore = config.baselineValence - upset.valence
    const distanceAfter = config.baselineValence - later.valence
    expect(distanceAfter).toBeCloseTo(distanceBefore / 2, 5)
  })

  it('settles back to temperament given long enough', () => {
    const upset = applyEvent(createMood(NOW), { valence: -1 }, NOW, { sensitivity: 1 })

    const muchLater = decayMood(upset, NOW + 100 * config.valenceHalfLifeMs)

    expect(muchLater.valence).toBeCloseTo(config.baselineValence, 5)
  })

  it('lets arousal settle faster than valence', () => {
    // Being startled wears off before being upset does.
    const stirred = applyEvent(createMood(NOW), { valence: -1, arousal: 1 }, NOW, { sensitivity: 1 })

    const later = decayMood(stirred, NOW + config.arousalHalfLifeMs)

    const arousalClosed = (stirred.arousal - later.arousal) / (stirred.arousal - config.baselineArousal)
    const valenceClosed = (later.valence - stirred.valence) / (config.baselineValence - stirred.valence)
    expect(arousalClosed).toBeGreaterThan(valenceClosed)
  })

  it('does not age a mood when the clock has run backwards', () => {
    const mood = applyEvent(createMood(NOW), { valence: -1 }, NOW)

    const earlier = decayMood(mood, NOW - 60_000)

    expect(earlier).toEqual(mood)
  })

  it('is unchanged at the instant it was measured', () => {
    const mood = applyEvent(createMood(NOW), { valence: 0.8 }, NOW)

    expect(decayMood(mood, NOW)).toEqual(mood)
  })
})

describe('moodDescriptor', () => {
  it('names each quadrant', () => {
    expect(moodDescriptor({ valence: 0.6, arousal: 0.8, at: NOW })).toBe('excited')
    expect(moodDescriptor({ valence: 0.6, arousal: 0.2, at: NOW })).toBe('content')
    expect(moodDescriptor({ valence: -0.6, arousal: 0.8, at: NOW })).toBe('distressed')
    expect(moodDescriptor({ valence: -0.6, arousal: 0.2, at: NOW })).toBe('bored')
  })

  it('declines to name a feeling near the centre', () => {
    // Most of the time the honest answer is that nothing shows.
    expect(moodDescriptor({ valence: 0.1, arousal: 0.9, at: NOW })).toBe('neutral')
    expect(moodDescriptor({ valence: -0.1, arousal: 0.1, at: NOW })).toBe('neutral')
  })

  it('takes a wider dead zone for a character that shows less', () => {
    const mood = { valence: 0.3, arousal: 0.8, at: NOW }

    expect(moodDescriptor(mood)).toBe('excited')
    expect(moodDescriptor(mood, 0.5)).toBe('neutral')
  })

  it('reads a character back to baseline as showing nothing', () => {
    expect(moodDescriptor(createMood(NOW))).toBe('neutral')
  })
})

describe('mood over a conversation', () => {
  it('still carries a rough exchange into the next turn', () => {
    // The point of the module: a character that resets between turns reads as
    // having no continuity.
    const start = createMood(NOW)
    const afterRudeness = applyEvent(start, { valence: -0.9 }, NOW)

    const aMinuteLater = decayMood(afterRudeness, NOW + 60_000)

    expect(aMinuteLater.valence).toBeLessThan(start.valence)
    expect(moodDescriptor(aMinuteLater)).not.toBe(moodDescriptor(start))
  })

  it('recovers when the conversation turns pleasant again', () => {
    const upset = applyEvent(createMood(NOW), { valence: -0.9 }, NOW)

    let mood = upset
    for (let i = 1; i <= 5; i++)
      mood = applyEvent(mood, { valence: 0.8 }, NOW + i * 30_000)

    expect(mood.valence).toBeGreaterThan(upset.valence)
  })
})
