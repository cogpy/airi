import { definePerceptionEvent } from '..'

/** Health at or below this (out of 20, about 3 hearts) counts as critical. */
const LOW_HEALTH_THRESHOLD = 6

// Edge-trigger latch: fire at most once per descent into critical, re-arming only after health
// climbs back above the threshold. Prevents waking the brain every health packet while low.
let armed = true

/**
 * Emits a high-salience signal when the bot enters critical health.
 *
 * Nothing eats or retreats for the bot automatically. The conscious brain (the model) gets this
 * signal every time and decides how to recover: eat ready food, cook raw food, or retreat.
 */
export const lowHealthEvent = definePerceptionEvent<[], { health: number }>({
  id: 'low_health',
  modality: 'felt',
  kind: 'low_health',

  mineflayer: {
    event: 'health',
    filter: (ctx) => {
      const health = ctx.bot.health
      if (typeof health !== 'number')
        return false

      if (health > LOW_HEALTH_THRESHOLD) {
        armed = true
        return false
      }

      if (!armed)
        return false

      armed = false
      return true
    },
    extract: ctx => ({ health: typeof ctx.bot.health === 'number' ? ctx.bot.health : 0 }),
  },
})
