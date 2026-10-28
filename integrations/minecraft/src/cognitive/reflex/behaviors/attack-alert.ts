import type { Entity } from 'prismarine-entity'

import type { AttackerEntity } from '../../perception/events/definitions/attacker-tracker'
import type { ReflexBehavior } from '../types/behavior'

import { isHostile } from '../../../utils/mcdata'
import { recentAttacker } from '../../perception/events/definitions/attacker-tracker'

/** Below the hazard alert (2000), above the hunger alert (500). */
const SCORE = 900
/** Repeats while the mob keeps hitting, without a model turn for every single hit. */
const COOLDOWN_MS = 3_000

/**
 * Whether the attacker is a hostile mob.
 *
 * Use when:
 * - Deciding, in the attack reflex, whether the entity that just hurt the bot raises an attack alert.
 *
 * Returns:
 * - true only for hostile mobs. A player attack reaches the brain through the `damage` perception
 *   signal, which names the attacker. Null or environmental damage gives false.
 */
export function isHostileMobAttacker(attacker: { type?: string, name?: string } | null | undefined): boolean {
  if (!attacker)
    return false
  if (attacker.type === 'player')
    return false
  return isHostile(attacker as Entity)
}

interface AttackBotView {
  entity?: { position: { x: number, y: number, z: number } }
  health?: number
  pvp?: { target?: unknown }
}

function isAlreadyFighting(bot: AttackBotView, attacker: AttackerEntity): boolean {
  return Boolean(bot.pvp?.target) && bot.pvp?.target === attacker
}

/**
 * Attack reflex: detects that a hostile mob hit the bot, and raises an urgent alert.
 *
 * It does not fight. The model decides to fight back (for example `attack`), to flee, or to do
 * something else. While the bot already attacks this mob, the reflex stays quiet, so a fight that
 * the model started does not wake the brain on every hit.
 */
export const attackAlertBehavior: ReflexBehavior = {
  id: 'attack-alert',
  modes: ['idle', 'social', 'alert', 'wander', 'work'],
  cooldownMs: COOLDOWN_MS,
  when: (_ctx, api) => {
    const attacker = recentAttacker(Date.now())
    if (!attacker || !isHostileMobAttacker(attacker))
      return false
    return !api || !isAlreadyFighting(api.bot.bot, attacker)
  },
  score: () => SCORE,
  observe: (api) => {
    const attacker = recentAttacker(Date.now())
    const bot: AttackBotView = api.bot.bot
    if (!attacker || !isHostileMobAttacker(attacker) || isAlreadyFighting(bot, attacker))
      return null

    const name = attacker.name ?? 'hostile mob'
    const self = bot.entity?.position
    const target = attacker.position
    const distance = self && target
      ? Math.round(Math.hypot(target.x - self.x, target.y - self.y, target.z - self.z) * 10) / 10
      : null
    const health = typeof bot.health === 'number' ? bot.health : null
    const where = distance === null ? '' : `, ${distance} blocks away`

    return {
      kind: 'under_attack',
      urgency: 'urgent',
      description: `A ${name} is attacking you${where}. Health ${health ?? '?'}/20.`,
      metadata: {
        attacker: name,
        attackerId: attacker.id ?? null,
        distance,
        health,
      },
    }
  },
}
