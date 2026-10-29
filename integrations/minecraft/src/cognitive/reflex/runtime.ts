import type { Logg } from '@guiiai/logg'

import type { MineflayerWithAgents } from '../types'
import type { ReflexModeId } from './modes'
import type { ReflexAlert, ReflexBehavior } from './types/behavior'

import { signal } from 'alien-signals'

import { ReflexContext } from './context'
import { selectMode } from './modes'

/** A reflex alert together with the id of the behavior that raised it. */
export interface ReflexRuntimeAlert extends ReflexAlert {
  behaviorId: string
}

/**
 * Perception runtime for reflex behaviors.
 *
 * Each tick refreshes the reflex context from the bot and asks every behavior whether its situation
 * is present. A behavior that triggers raises a {@link ReflexAlert} through `onAlert`. The runtime
 * never moves, equips, eats, or fights for the bot. The conscious brain (the model) decides every
 * action.
 */
export class ReflexRuntime {
  private readonly context = new ReflexContext()
  private readonly behaviors: ReflexBehavior[] = []
  private readonly runHistory = new Map<string, { lastRunAt: number }>()
  private readonly mode = signal<ReflexModeId>('idle')
  private readonly activeBehaviorId = signal<string | null>(null)

  public constructor(
    private readonly deps: {
      logger: Logg
      onAlert?: (alert: ReflexRuntimeAlert) => void
    },
  ) {}

  public getContext(): ReflexContext {
    return this.context
  }

  public getMode(): ReflexModeId {
    return this.mode()
  }

  /**
   * Sets the player that the model chose to follow.
   *
   * The runtime does not move the bot. The follow-distance reflex raises an alert when this player
   * moves out of range, and the model decides whether to go after them.
   */
  public setAutoFollowTarget(playerName: string, followDistance = 2): void {
    this.context.updateAutonomy({
      followPlayer: playerName,
      followDistance: Math.max(0, followDistance),
    })
  }

  public clearAutoFollowTarget(): void {
    this.context.updateAutonomy({
      followPlayer: null,
      followDistance: 2,
    })
  }

  /**
   * Single entrypoint for mode changes. Modes only filter which reflex behaviors can raise alerts.
   */
  public transitionMode(mode: ReflexModeId): void {
    if (mode === this.mode())
      return

    this.mode(mode)
  }

  /** Id of the behavior that raised the latest alert, for the debug dashboard. */
  public getActiveBehaviorId(): string | null {
    return this.activeBehaviorId()
  }

  public registerBehavior(behavior: ReflexBehavior): void {
    this.behaviors.push(behavior)
  }

  /**
   * Refreshes the context and raises the alerts of all triggered behaviors.
   *
   * Returns:
   * - The ids of the behaviors that raised an alert in this tick, highest score first.
   */
  public tick(bot: MineflayerWithAgents): string[] {
    const now = Date.now()

    this.context.updateNow(now)

    const entity = bot.bot.entity
    if (!entity)
      return []

    // TODO: future refactor: update ReflexContext via world_update/self_update events instead of polling Mineflayer state.
    this.context.updateSelf({
      location: entity.position,
      health: bot.bot.health ?? 0,
      food: bot.bot.food ?? 0,
      holding: bot.bot.heldItem?.name ?? null,
    })

    const selfPos = entity.position
    const maxNearbyDistance = 32
    const players = Object.entries(bot.bot.players ?? {})
      .filter(([name]) => name !== bot.bot.username)
      .reduce((acc, [name, player]) => {
        const pos = player?.entity?.position
        if (!pos)
          return acc
        let distance: number | null = null
        try {
          distance = selfPos.distanceTo(pos)
        }
        catch {
          distance = null
        }
        if (distance === null || distance > maxNearbyDistance)
          return acc
        acc.push({
          name,
          distance,
          holding: player?.entity?.heldItem?.name ?? null,
        })
        return acc
      }, [] as Array<{ name: string, distance: number, holding: string | null }>)

    const formatMinecraftTime = (timeOfDay?: number): string => {
      if (typeof timeOfDay !== 'number')
        return 'Unknown time'

      const hours24 = (6 + Math.floor(timeOfDay / 1000)) % 24
      const minutes = Math.floor(((timeOfDay % 1000) * 60) / 1000)

      const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
      const suffix = hours24 >= 12 ? 'PM' : 'AM'
      return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`
    }

    this.context.updateEnvironment({
      time: formatMinecraftTime(bot.bot.time?.timeOfDay),
      weather: bot.bot.isRaining ? 'rain' : 'clear',
      nearbyPlayers: players,
    })

    // Allow explicit modes like 'work' / 'wander' to remain until changed by caller.
    // Otherwise, compute from context automatically.
    if (this.mode() !== 'work' && this.mode() !== 'wander') {
      const nextMode = selectMode(this.context.getSnapshot())
      this.transitionMode(nextMode)
    }

    const ctx = this.context.getSnapshot()
    const api = { bot, context: this.context }

    // Every eligible behavior raises its alert, highest score first. A reflex never acts on the
    // body, so two alerts cannot conflict. The model reads all of them and chooses what to do.
    const eligible: Array<{ behavior: ReflexBehavior, score: number }> = []
    for (const behavior of this.behaviors) {
      if (!behavior.modes.includes(this.mode()))
        continue

      const history = this.runHistory.get(behavior.id)
      const cooldownMs = behavior.cooldownMs ?? 0
      if (history && cooldownMs > 0 && now - history.lastRunAt < cooldownMs)
        continue

      if (!behavior.when(ctx, api))
        continue

      const score = behavior.score(ctx, api)
      if (score <= 0)
        continue

      eligible.push({ behavior, score })
    }

    eligible.sort((a, b) => b.score - a.score)

    const alerted: string[] = []
    for (const { behavior } of eligible) {
      try {
        const alert = behavior.observe(api)
        if (!alert)
          continue

        this.runHistory.set(behavior.id, { lastRunAt: now })
        this.activeBehaviorId(behavior.id)
        this.deps.onAlert?.({ ...alert, behaviorId: behavior.id })
        alerted.push(behavior.id)
      }
      catch (err) {
        this.deps.logger.withError(err as Error).error('ReflexRuntime: behavior observation failed')
      }
    }

    return alerted
  }
}
