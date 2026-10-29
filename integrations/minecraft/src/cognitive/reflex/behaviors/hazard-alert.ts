import type { ReflexBehavior } from '../types/behavior'

import { Vec3 } from 'vec3'

/** Oxygen (out of 20) at or below which the bot is drowning. */
const LOW_OXYGEN = 6
/** How far to look for a safe block to stand on. */
const SAFE_STAND_RADIUS = 6
/** Lava kills in a few seconds, so the alert repeats often while the hazard stays. */
const COOLDOWN_MS = 2_000
/** Highest reflex score: a hazard alert comes before the attack (900) and hunger (500) alerts. */
const SCORE = 2_000

interface BlockLike { name?: string, boundingBox?: string }

const HAZARD_BLOCK = /lava|fire|magma/

function isHazardBlock(b: BlockLike | null | undefined): boolean {
  return !!b?.name && HAZARD_BLOCK.test(b.name)
}

/** A block the bot can stand ON: full solid, and not a burning hazard. */
function isStandable(b: BlockLike | null | undefined): boolean {
  return !!b && b.boundingBox === 'block' && !isHazardBlock(b)
}

/** A block the bot can occupy (feet/head): non-solid and not lava/fire. */
function isClear(b: BlockLike | null | undefined): boolean {
  return !!b && b.boundingBox !== 'block' && !isHazardBlock(b)
}

/**
 * Nearest position the bot could safely stand (solid non-hazard ground, clear feet+head), searched
 * around `origin`. Pure (takes a `blockAt`), so it is unit-testable without a live world.
 *
 * Returns:
 * - The feet position, or null when no safe stand is within `radius`.
 */
export function findNearestSafeStand(
  blockAt: (x: number, y: number, z: number) => BlockLike | null,
  origin: { x: number, y: number, z: number },
  radius: number,
): { x: number, y: number, z: number } | null {
  const ox = Math.floor(origin.x)
  const oy = Math.floor(origin.y)
  const oz = Math.floor(origin.z)

  let best: { x: number, y: number, z: number } | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      // Prefer level/above so the bot climbs out rather than diving deeper.
      for (let dy = -1; dy <= 3; dy++) {
        const x = ox + dx
        const y = oy + dy
        const z = oz + dz
        if (isStandable(blockAt(x, y - 1, z)) && isClear(blockAt(x, y, z)) && isClear(blockAt(x, y + 1, z))) {
          const score = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 0.5
          if (score < bestScore) {
            bestScore = score
            best = { x, y, z }
          }
        }
      }
    }
  }

  return best
}

interface HazardBotView {
  entity?: { isInLava?: boolean, isInWater?: boolean, position: { x: number, y: number, z: number } }
  oxygenLevel?: number
  health?: number
  blockAt: (pos: Vec3) => BlockLike | null
}

function inLava(bot: HazardBotView): boolean {
  return Boolean(bot.entity?.isInLava)
}

function drowning(bot: HazardBotView): boolean {
  return Boolean(bot.entity?.isInWater) && typeof bot.oxygenLevel === 'number' && bot.oxygenLevel <= LOW_OXYGEN
}

function inHazard(bot: HazardBotView): boolean {
  return inLava(bot) || drowning(bot)
}

function formatPos(pos: { x: number, y: number, z: number }): string {
  return `(${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)})`
}

/**
 * Hazard reflex: detects that the bot is in lava or is drowning, and raises an urgent alert.
 *
 * It does not move the bot. The alert gives the model the nearest safe ground, so the model can
 * choose how to get out (for example `goToCoordinate`, or `botCall('setControlState', ['jump', true])`).
 */
export const hazardAlertBehavior: ReflexBehavior = {
  id: 'hazard-alert',
  modes: ['idle', 'social', 'alert', 'wander', 'work'],
  cooldownMs: COOLDOWN_MS,
  score: () => SCORE,
  when: (_ctx, api) => !!api && inHazard(api.bot.bot),
  observe: (api) => {
    const bot: HazardBotView = api.bot.bot
    const position = bot.entity?.position
    if (!position || !inHazard(bot))
      return null

    const lava = inLava(bot)
    const safeStand = findNearestSafeStand((x, y, z) => bot.blockAt(new Vec3(x, y, z)), position, SAFE_STAND_RADIUS)
    const health = typeof bot.health === 'number' ? bot.health : null

    const situation = lava
      ? 'You are standing in lava and burning.'
      : `You are under water and drowning (oxygen ${bot.oxygenLevel}/20).`
    const ground = safeStand
      ? `Nearest safe ground: ${formatPos(safeStand)}.`
      : `No safe ground within ${SAFE_STAND_RADIUS} blocks.`

    return {
      kind: lava ? 'in_lava' : 'drowning',
      urgency: 'urgent',
      description: `${situation} Health ${health ?? '?'}/20. You are at ${formatPos(position)}. ${ground}`,
      metadata: {
        position: { x: position.x, y: position.y, z: position.z },
        health,
        oxygen: bot.oxygenLevel ?? null,
        safeStand,
      },
    }
  },
}
