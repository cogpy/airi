import { describe, expect, it } from 'vitest'

import { createTemperament } from './temperament'

describe('temperament', () => {
  it('starts neutral, leaving the card threshold as it is', () => {
    const temperament = createTemperament()

    expect(temperament.thresholdFactor()).toBe(1)
    expect(temperament.answerRate()).toBe(0.5)
  })

  it('speaks more readily after people keep answering', () => {
    const temperament = createTemperament()

    for (let outcome = 0; outcome < 10; outcome++)
      temperament.recordOutcome(true)

    expect(temperament.answerRate()).toBeGreaterThan(0.5)
    expect(temperament.thresholdFactor()).toBeLessThan(1)
  })

  it('grows quieter after people keep ignoring her', () => {
    const temperament = createTemperament()

    for (let outcome = 0; outcome < 10; outcome++)
      temperament.recordOutcome(false)

    expect(temperament.answerRate()).toBeLessThan(0.5)
    expect(temperament.thresholdFactor()).toBeGreaterThan(1)
  })

  it('keeps the threshold factor within its range however long the streak', () => {
    const temperament = createTemperament(undefined, { range: 0.3 })

    for (let outcome = 0; outcome < 500; outcome++)
      temperament.recordOutcome(false)

    expect(temperament.thresholdFactor()).toBeCloseTo(1.3, 5)
  })

  it('resumes from a snapshot with what it learned', () => {
    const learned = createTemperament()
    for (let outcome = 0; outcome < 10; outcome++)
      learned.recordOutcome(true)

    const resumed = createTemperament(learned.snapshot())

    expect(resumed.thresholdFactor()).toBe(learned.thresholdFactor())
    expect(resumed.answerRate()).toBe(learned.answerRate())
  })

  it('keeps its constraint genes fixed', () => {
    const temperament = createTemperament()
    for (let outcome = 0; outcome < 20; outcome++)
      temperament.recordOutcome(false)

    const safety = temperament.snapshot().genes.find(gene => gene.id === 'safety')

    expect(safety?.value).toBe(0.95)
  })
})
