import { describe, expect, it } from 'vitest'

import { lowHealthEvent } from './low-health'

const filter = lowHealthEvent.mineflayer.filter!
const extract = lowHealthEvent.mineflayer.extract

/** Perception-context stub: drives the low-health filter with a health value, inventory, and pvp state. */
function ctx(health: number, items: Array<{ name: string, foodPoints?: number }> = [], pvpTarget: unknown = null): any {
  return { bot: { health, inventory: { items: () => items }, pvp: { target: pvpTarget } } }
}

const bread = { name: 'bread', foodPoints: 5 }
const rawBeef = { name: 'beef', foodPoints: 3 }

describe('low_health perception event', () => {
  it('fires once when entering critical health with no ready food, then re-arms above threshold', () => {
    filter(ctx(20)) // arm
    expect(filter(ctx(6))).toBe(true) // critical, no food -> wake brain (disarms)
    expect(filter(ctx(6))).toBe(false) // still critical but already fired this episode
    filter(ctx(20)) // recover -> re-arm
    expect(filter(ctx(4))).toBe(true) // dropped critical again -> fires
  })

  // Nothing eats for the bot automatically, so critical health always reaches the brain, with or
  // without ready food, in combat or not. The model decides how to recover.
  it('fires at critical health also when the bot has ready-to-eat food', () => {
    filter(ctx(20)) // arm
    expect(filter(ctx(6, [bread]))).toBe(true)
    filter(ctx(20)) // recover -> re-arm
    expect(filter(ctx(6, [rawBeef]))).toBe(true)
  })

  it('fires at critical health mid-fight', () => {
    filter(ctx(20)) // arm
    expect(filter(ctx(6, [bread], { id: 1 }))).toBe(true)
  })

  it('extracts the current health for the signal', () => {
    expect(extract(ctx(5))).toEqual({ health: 5 })
  })
})
