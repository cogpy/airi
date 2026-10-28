import { describe, expect, it } from 'vitest'

import { FOLLOW_SLACK_BLOCKS, followDistanceAlertBehavior, measureFollowGap } from './follow-distance-alert'

/** Bot stub with an optional followed player. Records any pathfinder call, which must never happen. */
function botWith(playerPos: { x: number, y: number, z: number } | null) {
  const calls: string[] = []
  const bot: any = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    players: playerPos ? { Alex: { entity: { position: playerPos } } } : {},
    pathfinder: {
      setGoal: () => calls.push('setGoal'),
      stop: () => calls.push('stop'),
    },
  }
  return { bot, calls }
}

function apiWith(bot: unknown, followPlayer: string | null, followDistance = 2): any {
  return { bot: { bot }, context: { autonomy: () => ({ followPlayer, followDistance }) } }
}

describe('measureFollowGap', () => {
  it('returns null when no player is followed', () => {
    expect(measureFollowGap(botWith({ x: 30, y: 64, z: 0 }).bot, null, 2)).toBeNull()
  })

  it('returns null within follow distance plus slack', () => {
    const { bot } = botWith({ x: 2 + FOLLOW_SLACK_BLOCKS, y: 64, z: 0 })
    expect(measureFollowGap(bot, 'Alex', 2)).toBeNull()
  })

  it('measures a player beyond follow distance plus slack', () => {
    const { bot } = botWith({ x: 12, y: 64, z: 0 })
    expect(measureFollowGap(bot, 'Alex', 2)).toEqual({ player: 'Alex', followDistance: 2, distance: 12 })
  })

  it('reports a player out of sight', () => {
    const { bot } = botWith(null)
    expect(measureFollowGap(bot, 'Alex', 2)).toEqual({ player: 'Alex', followDistance: 2, distance: null })
  })
})

describe('followDistanceAlertBehavior', () => {
  it('raises an urgent alert when the followed player moved away, and never moves the bot', () => {
    const { bot, calls } = botWith({ x: 12, y: 64, z: 0 })
    const api = apiWith(bot, 'Alex')

    expect(followDistanceAlertBehavior.when(undefined as any, api)).toBe(true)
    expect(followDistanceAlertBehavior.observe(api)).toMatchObject({
      kind: 'follow_target_far',
      urgency: 'urgent',
      description: 'Alex, the player you follow, is 12 blocks away (your follow distance is 2).',
    })
    // The reflex only perceives: the model chooses whether to go to the player.
    expect(calls).toEqual([])
  })

  it('is quiet in work and wander modes', () => {
    expect(followDistanceAlertBehavior.modes).not.toContain('work')
    expect(followDistanceAlertBehavior.modes).not.toContain('wander')
  })
})
