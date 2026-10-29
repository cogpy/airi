import { describe, expect, it } from 'vitest'

import { describeFood, hungerAlertBehavior } from './hunger-alert'

/** Minimal reflex snapshot stub: only the self fields that the hunger alert reads. */
function snapshot(health: number, food: number): any {
  return { self: { health, food } }
}

/** ReflexApi stub with an inventory and a context snapshot. Records any eat call, which must never happen. */
function apiWith(items: Array<{ name: string, count?: number, foodPoints?: number }>, health: number, food: number) {
  const calls: string[] = []
  const api: any = {
    bot: {
      bot: {
        inventory: { items: () => items },
        equip: async () => calls.push('equip'),
        consume: async () => calls.push('consume'),
      },
    },
    context: { getSnapshot: () => snapshot(health, food) },
  }
  return { api, calls }
}

const bread = { name: 'bread', count: 2, foodPoints: 5 }
const rawBeef = { name: 'beef', count: 1, foodPoints: 3 }
const dirt = { name: 'dirt', count: 10 }

describe('describeFood', () => {
  it('splits ready-to-eat food from raw food that is better cooked, and skips non-food', () => {
    expect(describeFood([bread, rawBeef, dirt])).toEqual({ ready: ['bread x2'], raw: ['beef x1'] })
  })
})

describe('hungerAlertBehavior', () => {
  it('triggers at low food and is quiet above the threshold', () => {
    expect(hungerAlertBehavior.when(snapshot(20, 6))).toBe(true)
    expect(hungerAlertBehavior.when(snapshot(20, 7))).toBe(false)
  })

  it('raises an urgent alert with the food in the inventory, and never eats', () => {
    const { api, calls } = apiWith([bread, rawBeef], 12, 4)

    expect(hungerAlertBehavior.observe(api)).toMatchObject({
      kind: 'hungry',
      urgency: 'urgent',
      description: 'You are hungry: food 4/20, health 12/20. Ready-to-eat food in your inventory: bread x2. Raw food that is better cooked: beef x1.',
    })
    // The reflex only perceives: the model chooses whether and what to eat.
    expect(calls).toEqual([])
  })

  it('says when there is no ready food', () => {
    const { api } = apiWith([], 20, 3)
    expect(hungerAlertBehavior.observe(api)!.description).toContain('Ready-to-eat food in your inventory: none.')
  })
})
