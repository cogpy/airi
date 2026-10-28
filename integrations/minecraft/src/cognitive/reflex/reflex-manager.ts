import type { Logg } from '@guiiai/logg'

import type { TaskExecutor } from '../action/task-executor'
import type { EventBus, TracedEvent } from '../event-bus'
import type { PerceptionSignal } from '../perception/types/signals'
import type { MineflayerWithAgents } from '../types'
import type { ReflexContextState } from './context'
import type { ReflexRuntimeAlert } from './runtime'

import { computed, effect, signal } from 'alien-signals'

import { DebugService } from '../../debug'
import { attackAlertBehavior } from './behaviors/attack-alert'
import { followDistanceAlertBehavior } from './behaviors/follow-distance-alert'
import { hazardAlertBehavior } from './behaviors/hazard-alert'
import { hungerAlertBehavior } from './behaviors/hunger-alert'
import { idleObservationBehavior } from './behaviors/idle-observation'
import { ReflexRuntime } from './runtime'

/**
 * Converts a reflex alert to the perception signal that the conscious brain reads.
 *
 * Before:
 * - `{ behaviorId: 'hazard-alert', kind: 'in_lava', urgency: 'urgent', description: 'You are standing in lava...' }`
 *
 * After:
 * - `{ type: 'reflex_alert', sourceId: 'reflex:hazard-alert', metadata: { kind: 'in_lava', urgency: 'urgent', ... } }`
 */
export function reflexAlertToSignal(alert: ReflexRuntimeAlert, now: number): PerceptionSignal {
  return {
    type: 'reflex_alert',
    description: alert.description,
    sourceId: `reflex:${alert.behaviorId}`,
    confidence: 1,
    timestamp: now,
    metadata: {
      ...alert.metadata,
      kind: alert.kind,
      urgency: alert.urgency,
      behaviorId: alert.behaviorId,
    },
  }
}

/**
 * Whether a perception signal should wake the conscious brain.
 *
 * - `entity_attention` (movement/punch attention) feeds the idle-observation reflex, which raises its
 *   own `reflex_alert` when it is worth a model turn → never forwarded directly.
 * - While the bot is actively attacking (`isAttacking`), routine `damage` signals are suppressed so
 *   the brain does not re-plan on every incoming hit and `stop` its own attack — the combat-thrashing
 *   that got it killed against a kiting pillager. Critical health still reaches the brain via the
 *   separate `low_health` signal (action !== 'damage'), so it can still choose to retreat.
 */
export function shouldForwardSignalToConscious(
  signal: Pick<PerceptionSignal, 'type' | 'metadata'>,
  isAttacking: boolean,
): boolean {
  if (signal.type === 'entity_attention')
    return false
  if (isAttacking && signal.metadata?.action === 'damage')
    return false
  return true
}

export class ReflexManager {
  private bot: MineflayerWithAgents | null = null
  private readonly runtime: ReflexRuntime
  private unsubscribe: (() => void) | null = null
  private unsubscribeTaskExecutor: (() => void) | null = null
  private readonly botSignal = signal<MineflayerWithAgents | null>(null)
  private readonly inFlightActionsCount = signal(0)
  private readonly isWorking = computed(() => this.inFlightActionsCount() > 0)

  constructor(
    private readonly deps: {
      eventBus: EventBus
      taskExecutor: TaskExecutor
      logger: Logg
    },
  ) {
    this.runtime = new ReflexRuntime({
      logger: this.deps.logger,
      onAlert: alert => this.forwardAlert(alert),
    })

    // Reflexes only perceive. Each one raises an alert for the conscious brain, and the model
    // chooses every action through its normal action tools.
    this.runtime.registerBehavior(hazardAlertBehavior)
    this.runtime.registerBehavior(attackAlertBehavior)
    this.runtime.registerBehavior(hungerAlertBehavior)
    this.runtime.registerBehavior(followDistanceAlertBehavior)
    this.runtime.registerBehavior(idleObservationBehavior)

    effect(() => {
      if (!this.botSignal())
        return

      this.runtime.transitionMode(this.isWorking() ? 'work' : 'idle')
    })

    effect(() => {
      if (!this.botSignal())
        return

      DebugService.getInstance().emitReflexState({
        mode: this.runtime.getMode(),
        activeBehaviorId: this.runtime.getActiveBehaviorId(),
        context: this.runtime.getContext().getSnapshot(),
      })
    })
  }

  public init(bot: MineflayerWithAgents): void {
    this.bot = bot
    this.botSignal(bot)
    // Subscribe to all signals produced by the perception rules
    this.unsubscribe = this.deps.eventBus.subscribe('signal:*', (event) => {
      this.onSignal(event as TracedEvent<PerceptionSignal>)
    })

    const onStarted = () => {
      this.inFlightActionsCount(this.inFlightActionsCount() + 1)
    }

    const onEnded = () => {
      this.inFlightActionsCount(Math.max(0, this.inFlightActionsCount() - 1))
    }

    this.deps.taskExecutor.on('action:started', onStarted)
    this.deps.taskExecutor.on('action:completed', onEnded)
    this.deps.taskExecutor.on('action:failed', onEnded)

    this.unsubscribeTaskExecutor = () => {
      // Node's EventEmitter supports off() but we keep a fallback for compatibility.
      ; (this.deps.taskExecutor as any).off?.('action:started', onStarted)
      ; (this.deps.taskExecutor as any).off?.('action:completed', onEnded)
      ; (this.deps.taskExecutor as any).off?.('action:failed', onEnded)
      ; (this.deps.taskExecutor as any).removeListener?.('action:started', onStarted)
      ; (this.deps.taskExecutor as any).removeListener?.('action:completed', onEnded)
      ; (this.deps.taskExecutor as any).removeListener?.('action:failed', onEnded)
    }
  }

  public destroy(): void {
    this.runtime.transitionMode('idle')

    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    if (this.unsubscribeTaskExecutor) {
      this.unsubscribeTaskExecutor()
      this.unsubscribeTaskExecutor = null
    }
    this.inFlightActionsCount(0)
    this.botSignal(null)
    this.bot = null
  }

  public getContextSnapshot(): ReflexContextState {
    return this.runtime.getContext().getSnapshot()
  }

  public getMode(): ReturnType<ReflexRuntime['getMode']> {
    return this.runtime.getMode()
  }

  public updateEnvironment(patch: Partial<ReflexContextState['environment']>): void {
    this.runtime.getContext().updateEnvironment(patch)
  }

  public setFollowTarget(playerName: string, followDistance = 2): void {
    this.runtime.setAutoFollowTarget(playerName, followDistance)
  }

  public clearFollowTarget(): void {
    this.runtime.clearAutoFollowTarget()
  }

  public refreshFromBotState(): void {
    if (!this.bot)
      return

    this.runtime.tick(this.bot)
  }

  private onSignal(event: TracedEvent<PerceptionSignal>): void {
    const bot = this.bot
    if (!bot)
      return

    const signal = event.payload
    const now = Date.now()

    // Update Context
    this.runtime.getContext().updateNow(now)
    this.runtime.getContext().updateAttention({
      lastSignalType: signal.type,
      lastSignalSourceId: signal.sourceId ?? null,
      lastSignalAt: now,
    })

    if (signal.type === 'social_gesture') {
      this.runtime.getContext().updateSocial({
        lastGesture: (signal.metadata as any)?.gesture ?? 'unknown',
        lastGestureAt: now,
      })
    }

    if (signal.type === 'chat_message') {
      const username = typeof (signal.metadata as any)?.username === 'string'
        ? String((signal.metadata as any).username)
        : (signal.sourceId ?? null)

      const message = typeof (signal.metadata as any)?.message === 'string'
        ? String((signal.metadata as any).message)
        : null

      this.runtime.getContext().updateSocial({
        lastSpeaker: username,
        lastMessage: message,
        lastMessageAt: now,
      })
    }

    // If it's a chat message (simulated via signal for now, or direct?)
    // For now we rely on signal metadata or separate chat event.
    // Assuming 'signal:social:chat' or similar might exist later.

    // Re-check the reflex conditions. Triggered reflexes raise alerts for the brain.
    this.runtime.tick(bot)

    // Forward signals to conscious layer (Brain) ONLY when Reflex decides.
    if (this.shouldForwardToConscious(signal)) {
      this.deps.eventBus.emitChild(event, {
        type: `conscious:signal:${signal.type}`,
        payload: signal,
        source: { component: 'reflex', id: 'reflexManager' },
      })
    }
  }

  private forwardAlert(alert: ReflexRuntimeAlert): void {
    this.deps.logger.withFields({ behaviorId: alert.behaviorId, kind: alert.kind, urgency: alert.urgency }).log('ReflexManager: alert for the conscious brain')
    this.deps.eventBus.emit({
      type: 'conscious:signal:reflex_alert',
      payload: reflexAlertToSignal(alert, Date.now()),
      source: { component: 'reflex', id: alert.behaviorId },
    })
  }

  private shouldForwardToConscious(signal: PerceptionSignal): boolean {
    return shouldForwardSignalToConscious(signal, this.isAttacking())
  }

  /** mineflayer-pvp sets `bot.pvp.target` while the bot is actively attacking an entity. */
  private isAttacking(): boolean {
    return Boolean((this.bot?.bot as any)?.pvp?.target)
  }
}
