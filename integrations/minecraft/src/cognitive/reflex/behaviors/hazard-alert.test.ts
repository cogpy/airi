import { Vec3 } from 'vec3'
import { describe, expect, it } from 'vitest'

import { findNearestSafeStand, hazardAlertBehavior } from './hazard-alert'

const STONE = { name: 'stone', boundingBox: 'block' }
const AIR = { name: 'air', boundingBox: 'empty' }
const LAVA = { name: 'lava', boundingBox: 'empty' } // liquid: not standable, and a hazard so not "clear"

/**
 * Fake world: a small lava pool. Columns with |x|>=2 or |z|>=2 are dry land (stone floor at y<=63,
 * air above). Inside the pool, lava fills up to y=64 (the bot's feet) with air above.
 */
function poolBlockAt(x: number, y: number, z: number) {
  if (Math.abs(x) >= 2 || Math.abs(z) >= 2)
    return y <= 63 ? STONE : AIR
  return y <= 64 ? LAVA : AIR
}

describe('findNearestSafeStand', () => {
  it('finds the nearest dry edge to climb out of a lava pool', () => {
    const stand = findNearestSafeStand(poolBlockAt, { x: 0, y: 64, z: 0 }, 6)
    expect(stand).not.toBeNull()
    // an edge column (|x|==2 or |z|==2), standing at the bot's level on the stone lip
    expect(Math.abs(stand!.x) === 2 || Math.abs(stand!.z) === 2).toBe(true)
    expect(stand!.y).toBe(64)
  })

  it('never returns a spot standing on lava (the pool centre)', () => {
    const stand = findNearestSafeStand(poolBlockAt, { x: 0, y: 64, z: 0 }, 6)
    // the centre columns are lava under the feet -> must not be chosen
    expect(stand && Math.abs(stand.x) < 2 && Math.abs(stand.z) < 2).toBeFalsy()
  })

  it('returns null when no safe stand is within range (all lava)', () => {
    const allLava = (_x: number, y: number, _z: number) => (y <= 64 ? LAVA : AIR)
    expect(findNearestSafeStand(allLava, { x: 0, y: 64, z: 0 }, 4)).toBeNull()
  })
})

/** ReflexApi stub with a bot in the lava pool. Records any body control, which must never happen. */
function hazardApi(state: { lava: boolean, water?: boolean, oxygen?: number }) {
  const controls: string[] = []
  const bot: any = {
    entity: {
      get isInLava() {
        return state.lava
      },
      get isInWater() {
        return state.water ?? false
      },
      position: new Vec3(0, 64, 0),
    },
    health: 14,
    get oxygenLevel() {
      return state.oxygen ?? 20
    },
    blockAt: (pos: Vec3) => poolBlockAt(pos.x, pos.y, pos.z),
    lookAt: async () => {
      controls.push('lookAt')
    },
    setControlState: (control: string) => {
      controls.push(control)
    },
    pathfinder: {
      stop: () => {
        controls.push('pathfinder.stop')
      },
    },
  }
  return { api: { bot: { bot }, context: {} } as any, controls }
}

describe('hazardAlertBehavior', () => {
  it('triggers while the bot is in lava and is quiet outside of it', () => {
    const state = { lava: true }
    const { api } = hazardApi(state)
    expect(hazardAlertBehavior.when(undefined as any, api)).toBe(true)
    state.lava = false
    expect(hazardAlertBehavior.when(undefined as any, api)).toBe(false)
  })

  it('raises an urgent lava alert with the nearest safe ground, and never moves the bot', () => {
    const { api, controls } = hazardApi({ lava: true })
    const alert = hazardAlertBehavior.observe(api)

    expect(alert).toMatchObject({ kind: 'in_lava', urgency: 'urgent' })
    expect(alert!.description).toContain('You are standing in lava')
    expect(alert!.description).toContain('Health 14/20')
    expect(alert!.description).toContain('Nearest safe ground')
    expect(alert!.metadata.safeStand).not.toBeNull()
    // The reflex only perceives: the model chooses how to escape.
    expect(controls).toEqual([])
  })

  it('raises a drowning alert when oxygen is low under water', () => {
    const { api } = hazardApi({ lava: false, water: true, oxygen: 4 })
    const alert = hazardAlertBehavior.observe(api)
    expect(alert).toMatchObject({ kind: 'drowning', urgency: 'urgent' })
    expect(alert!.description).toContain('oxygen 4/20')
  })

  it('returns no alert once the hazard has ended', () => {
    const { api } = hazardApi({ lava: false })
    expect(hazardAlertBehavior.observe(api)).toBeNull()
  })
})
