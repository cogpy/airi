import type { Bot } from 'mineflayer'

import type { ReflexBehavior } from '../types/behavior'

import { isCookableToHigherSaturation } from '../../../libs/mineflayer/foods'

/**
 * Food (out of 20) at or below this is hunger. At 6 or less the bot cannot sprint, and health stops
 * regenerating.
 */
export const HUNGER_FOOD_THRESHOLD = 6
/** Hunger changes slowly, so one alert per minute is enough. */
const COOLDOWN_MS = 60_000
/** Below the hazard (2000) and attack (900) alerts. */
const SCORE = 500

/** prismarine-item adds `foodPoints` to inventory items at runtime. Its types do not declare it. */
interface FoodItemView { name: string, count?: number, foodPoints?: number }

/**
 * Lists the food in the inventory, split into ready-to-eat food and raw food that is better cooked.
 *
 * Before:
 * - inventory `[bread x2, beef x1, dirt x10]`
 *
 * After:
 * - `{ ready: ['bread x2'], raw: ['beef x1'] }`
 */
export function describeFood(items: FoodItemView[]): { ready: string[], raw: string[] } {
  const ready: string[] = []
  const raw: string[] = []
  for (const item of items) {
    if ((item.foodPoints ?? 0) <= 0)
      continue
    const label = `${item.name} x${item.count ?? 1}`
    if (isCookableToHigherSaturation(item.name))
      raw.push(label)
    else
      ready.push(label)
  }
  return { ready, raw }
}

function inventoryFood(bot: Pick<Bot, 'inventory'>): FoodItemView[] {
  return bot.inventory.items()
}

/**
 * Hunger reflex: detects low food, and raises an urgent alert with the food in the inventory.
 *
 * It does not eat. The model decides whether and what to eat (for example `consume`), or to cook raw
 * food first (`smeltItem`). Critical health reaches the brain separately through the `low_health`
 * perception signal.
 */
export const hungerAlertBehavior: ReflexBehavior = {
  id: 'hunger-alert',
  modes: ['idle', 'social', 'work', 'wander', 'alert'],
  cooldownMs: COOLDOWN_MS,
  when: ctx => ctx.self.food <= HUNGER_FOOD_THRESHOLD,
  score: () => SCORE,
  observe: (api) => {
    const snapshot = api.context.getSnapshot()
    if (snapshot.self.food > HUNGER_FOOD_THRESHOLD)
      return null

    const { ready, raw } = describeFood(inventoryFood(api.bot.bot))
    const readyText = ready.length > 0 ? ready.join(', ') : 'none'
    const rawText = raw.length > 0 ? ` Raw food that is better cooked: ${raw.join(', ')}.` : ''

    return {
      kind: 'hungry',
      urgency: 'urgent',
      description: `You are hungry: food ${snapshot.self.food}/20, health ${snapshot.self.health}/20. Ready-to-eat food in your inventory: ${readyText}.${rawText}`,
      metadata: {
        food: snapshot.self.food,
        health: snapshot.self.health,
        readyFood: ready,
        rawFood: raw,
      },
    }
  },
}
