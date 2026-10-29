import type { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'

import type { ReflexBehavior } from '../types/behavior'

// Minimum velocity magnitude to consider a player "moving"
const MOVEMENT_THRESHOLD = 0.1
// Max distance (blocks) to care about player movement
const OBSERVATION_RANGE = 16
// An idle observation costs a model turn, so it repeats at most twice per minute.
const COOLDOWN_MS = 30_000
// Attention events older than this are ignored to avoid stale observations.
const ATTENTION_MAX_AGE_MS = 2_000

interface ObservationCandidate {
  entity: Entity
  score: number
  isAttention: boolean
}

function horizontalSpeed(entity: Entity): number {
  const v = entity.velocity
  if (!v)
    return 0
  return Math.sqrt(v.x * v.x + v.z * v.z)
}

function headLookOffset(entity: Entity): number {
  return Number.isFinite(entity.height) ? entity.height * 0.85 : 1.5
}

/**
 * Finds the most noticeable nearby player: a recent attention entity (for example a player who
 * punches near the bot), else the closest moving player.
 *
 * Returns:
 * - The candidate, or null when there is nothing to notice.
 */
function findObservationTarget(
  bot: Bot,
  ctx: Parameters<ReflexBehavior['when']>[0],
): ObservationCandidate | null {
  const selfPos = bot.entity?.position
  if (!selfPos)
    return null

  // 1. Recent attention signal takes priority
  if (
    ctx.attention.lastSignalType === 'entity_attention'
    && ctx.attention.lastSignalAt
    && ctx.now - ctx.attention.lastSignalAt <= ATTENTION_MAX_AGE_MS
    && ctx.attention.lastSignalSourceId
  ) {
    const target = bot.entities[Number(ctx.attention.lastSignalSourceId)]
    if (target) {
      const dist = selfPos.distanceTo(target.position)
      if (dist <= OBSERVATION_RANGE)
        return { entity: target, score: 25 + 35 * (1 - dist / OBSERVATION_RANGE), isAttention: true }
    }
  }

  // 2. Closest moving player
  let best: ObservationCandidate | null = null
  let bestDist = Infinity

  for (const [name, player] of Object.entries(bot.players)) {
    if (name === bot.username)
      continue

    const entity = player?.entity
    if (!entity || horizontalSpeed(entity) <= MOVEMENT_THRESHOLD)
      continue

    const dist = selfPos.distanceTo(entity.position)
    if (dist > OBSERVATION_RANGE)
      continue

    if (dist < bestDist) {
      bestDist = dist
      best = { entity, score: 10 + 30 * (1 - dist / OBSERVATION_RANGE), isAttention: false }
    }
  }

  return best
}

/**
 * Idle observation: while the bot is idle, it notices a nearby player who moves or tries to get its
 * attention, and raises an ambient alert.
 *
 * It does not turn the head. The model decides whether to look (for example
 * `botCall('lookAt', [headPosition])`), to say something, or to do nothing.
 */
export const idleObservationBehavior: ReflexBehavior = {
  id: 'idle-observation',
  modes: ['idle', 'social'],
  cooldownMs: COOLDOWN_MS,
  when: (ctx, api) => api ? findObservationTarget(api.bot.bot, ctx) !== null : false,
  score: (ctx, api) => api ? (findObservationTarget(api.bot.bot, ctx)?.score ?? 0) : 0,
  observe: ({ bot: mfBot, context }) => {
    const bot = mfBot.bot
    const selfPos = bot.entity?.position
    const candidate = findObservationTarget(bot, context.getSnapshot())
    if (!selfPos || !candidate)
      return null

    const { entity } = candidate
    const name = entity.username ?? entity.name ?? 'someone'
    const distance = Math.round(selfPos.distanceTo(entity.position) * 10) / 10
    const head = entity.position.offset(0, headLookOffset(entity), 0)
    const activity = candidate.isAttention ? 'is trying to get your attention' : 'is moving'

    return {
      kind: candidate.isAttention ? 'player_attention' : 'player_moving',
      urgency: 'ambient',
      description: `You are idle. ${name} ${activity} nearby, ${distance} blocks away. Their head is at (${head.x.toFixed(1)}, ${head.y.toFixed(1)}, ${head.z.toFixed(1)}).`,
      metadata: {
        player: name,
        entityId: entity.id ?? null,
        distance,
        headPosition: { x: head.x, y: head.y, z: head.z },
      },
    }
  },
}
