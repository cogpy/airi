import { afterEach, describe, expect, it } from 'vitest'

import { recordAttacker } from '../../perception/events/definitions/attacker-tracker'
import { attackAlertBehavior, isHostileMobAttacker } from './attack-alert'

// The attack reflex alerts the brain about hostile mobs only. A player attack reaches the brain
// through the damage perception signal, which names the attacker.
describe('isHostileMobAttacker', () => {
  it('accepts hostile mobs', () => {
    expect(isHostileMobAttacker({ type: 'hostile', name: 'zombie' })).toBe(true)
    expect(isHostileMobAttacker({ type: 'mob', name: 'skeleton' })).toBe(true)
    expect(isHostileMobAttacker({ type: 'hostile', name: 'pillager' })).toBe(true)
  })

  it('rejects a player (master or otherwise)', () => {
    expect(isHostileMobAttacker({ type: 'player', name: 'dssadg' })).toBe(false)
  })

  it('rejects friendly/passive entities', () => {
    expect(isHostileMobAttacker({ type: 'mob', name: 'iron_golem' })).toBe(false)
    expect(isHostileMobAttacker({ type: 'animal', name: 'cow' })).toBe(false)
  })

  it('rejects no/environmental attacker', () => {
    expect(isHostileMobAttacker(null)).toBe(false)
    expect(isHostileMobAttacker(undefined)).toBe(false)
  })
})

/** ReflexApi stub. Records any fight call, which must never happen. */
function botApi(pvpTarget: unknown = null) {
  const calls: string[] = []
  const bot: any = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    health: 8,
    pvp: {
      target: pvpTarget,
      attack: () => calls.push('pvp.attack'),
    },
    attack: () => calls.push('attack'),
  }
  return { api: { bot: { bot }, context: {} } as any, calls }
}

describe('attackAlertBehavior', () => {
  afterEach(() => {
    // Age the attacker out of the recency window for the next test.
    recordAttacker({ type: 'hostile', name: 'zombie' }, 0)
  })

  it('raises an urgent alert for a hostile mob that hit the bot, and never fights', () => {
    const zombie = { type: 'hostile', name: 'zombie', id: 7, position: { x: 3, y: 64, z: 4 } }
    recordAttacker(zombie, Date.now())
    const { api, calls } = botApi()

    expect(attackAlertBehavior.when(undefined as any, api)).toBe(true)
    expect(attackAlertBehavior.observe(api)).toMatchObject({
      kind: 'under_attack',
      urgency: 'urgent',
      description: 'A zombie is attacking you, 5 blocks away. Health 8/20.',
    })
    // The reflex only perceives: the model chooses to fight, flee, or something else.
    expect(calls).toEqual([])
  })

  it('stays quiet while the bot already fights this attacker', () => {
    const zombie = { type: 'hostile', name: 'zombie', id: 7 }
    recordAttacker(zombie, Date.now())
    const { api } = botApi(zombie)

    expect(attackAlertBehavior.when(undefined as any, api)).toBe(false)
    expect(attackAlertBehavior.observe(api)).toBeNull()
  })

  it('stays quiet for a player attacker', () => {
    recordAttacker({ type: 'player', name: 'dssadg' }, Date.now())
    const { api } = botApi()
    expect(attackAlertBehavior.when(undefined as any, api)).toBe(false)
  })
})
