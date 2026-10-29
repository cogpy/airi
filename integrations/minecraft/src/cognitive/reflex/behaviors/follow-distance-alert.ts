import type { ReflexApi, ReflexBehavior } from '../types/behavior'

/** Extra blocks beyond the follow distance before the alert triggers, so small steps do not wake the brain. */
export const FOLLOW_SLACK_BLOCKS = 4
/** Minimum time between two follow alerts. */
const COOLDOWN_MS = 5_000
/** Below the survival alerts (hazard 2000, attack 900, hunger 500). */
const SCORE = 300

interface FollowBotView {
  entity?: { position: { x: number, y: number, z: number } }
  players: Record<string, { entity?: { position: { x: number, y: number, z: number } } } | undefined>
}

interface FollowGap {
  player: string
  followDistance: number
  /** Distance to the player in blocks, or null when the player is out of sight. */
  distance: number | null
}

/**
 * Measures how far the followed player is, when the gap is large enough for an alert.
 *
 * Returns:
 * - The gap, or null when no player is followed or the player is within follow distance plus slack.
 */
export function measureFollowGap(
  bot: FollowBotView,
  followPlayer: string | null,
  followDistance: number,
): FollowGap | null {
  if (!followPlayer)
    return null

  const self = bot.entity?.position
  const target = bot.players[followPlayer]?.entity?.position
  if (!self)
    return null
  if (!target)
    return { player: followPlayer, followDistance, distance: null }

  const distance = Math.hypot(target.x - self.x, target.y - self.y, target.z - self.z)
  if (distance <= followDistance + FOLLOW_SLACK_BLOCKS)
    return null

  return { player: followPlayer, followDistance, distance: Math.round(distance * 10) / 10 }
}

function currentGap(api: ReflexApi): FollowGap | null {
  const { followPlayer, followDistance } = api.context.autonomy()
  return measureFollowGap(api.bot.bot, followPlayer, followDistance)
}

/**
 * Follow-distance reflex: detects that the player whom the model chose to follow moved away, and
 * raises an urgent alert.
 *
 * It does not move the bot. The model decides whether to go after the player (for example
 * `goToPlayer`). It is quiet in `work` and `wander` modes, while an action runs.
 */
export const followDistanceAlertBehavior: ReflexBehavior = {
  id: 'follow-distance-alert',
  modes: ['idle', 'social', 'alert'],
  cooldownMs: COOLDOWN_MS,
  when: (_ctx, api) => !!api && currentGap(api) !== null,
  score: () => SCORE,
  observe: (api) => {
    const gap = currentGap(api)
    if (!gap)
      return null

    const description = gap.distance === null
      ? `${gap.player}, the player you follow, is out of sight.`
      : `${gap.player}, the player you follow, is ${gap.distance} blocks away (your follow distance is ${gap.followDistance}).`

    return {
      kind: 'follow_target_far',
      urgency: 'urgent',
      description,
      metadata: { ...gap },
    }
  },
}
