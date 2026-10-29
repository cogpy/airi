import type { ReflexBehavior } from './types/behavior'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReflexRuntime } from './runtime'

function createLogger() {
  const logger = {
    withError: vi.fn(),
    withFields: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  } as any
  logger.withError.mockReturnValue(logger)
  logger.withFields.mockReturnValue(logger)
  return logger
}

function createMockBot() {
  const setMovements = vi.fn()
  const setGoal = vi.fn()
  const stop = vi.fn()
  const selfPosition = {
    distanceTo: vi.fn(() => 4),
  }

  const bot = {
    bot: {
      username: 'AiriBot',
      entity: { position: selfPosition },
      health: 20,
      food: 20,
      heldItem: null,
      time: { timeOfDay: 1000 },
      isRaining: false,
      players: {} as Record<string, { entity?: any }>,
      pathfinder: {
        setMovements,
        setGoal,
        stop,
      },
    },
  } as any

  return { bot, setGoal, setMovements, stop }
}

function alertBehavior(id: string, score: number, overrides: Partial<ReflexBehavior> = {}): ReflexBehavior {
  return {
    id,
    modes: ['idle', 'social', 'work', 'wander', 'alert'],
    when: () => true,
    score: () => score,
    observe: () => ({ kind: id, urgency: 'urgent', description: `${id} happened`, metadata: {} }),
    ...overrides,
  }
}

describe('reflexRuntime follow target', () => {
  // Reflexes never act on the body. Following a player only records the target: the
  // follow-distance reflex raises alerts, and the model decides whether to move.
  it('records the follow target without driving the pathfinder', () => {
    const runtime = new ReflexRuntime({ logger: createLogger() })
    const { bot, setGoal, setMovements, stop } = createMockBot()
    bot.bot.players.Alex = { entity: { id: 42, position: { x: 8, y: 64, z: 5 }, heldItem: null } }

    runtime.setAutoFollowTarget('Alex', 3)
    runtime.tick(bot)

    expect(runtime.getContext().getSnapshot().autonomy).toEqual({ followPlayer: 'Alex', followDistance: 3 })
    expect(setGoal).not.toHaveBeenCalled()
    expect(setMovements).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })

  it('clears the follow target', () => {
    const runtime = new ReflexRuntime({ logger: createLogger() })
    runtime.setAutoFollowTarget('Alex', 3)
    runtime.clearAutoFollowTarget()
    expect(runtime.getContext().getSnapshot().autonomy).toEqual({ followPlayer: null, followDistance: 2 })
  })
})

describe('reflexRuntime alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('raises the alert of every triggered behavior, highest score first', () => {
    const onAlert = vi.fn()
    const runtime = new ReflexRuntime({ logger: createLogger(), onAlert })
    const { bot } = createMockBot()

    runtime.registerBehavior(alertBehavior('hunger', 500))
    runtime.registerBehavior(alertBehavior('hazard', 2000))
    runtime.registerBehavior(alertBehavior('quiet', 900, { when: () => false }))

    expect(runtime.tick(bot)).toEqual(['hazard', 'hunger'])
    expect(onAlert.mock.calls.map(call => call[0])).toEqual([
      { behaviorId: 'hazard', kind: 'hazard', urgency: 'urgent', description: 'hazard happened', metadata: {} },
      { behaviorId: 'hunger', kind: 'hunger', urgency: 'urgent', description: 'hunger happened', metadata: {} },
    ])
    expect(runtime.getActiveBehaviorId()).toBe('hunger')
  })

  it('repeats an alert only after its cooldown', () => {
    const onAlert = vi.fn()
    const runtime = new ReflexRuntime({ logger: createLogger(), onAlert })
    const { bot } = createMockBot()
    runtime.registerBehavior(alertBehavior('hazard', 2000, { cooldownMs: 2000 }))

    expect(runtime.tick(bot)).toEqual(['hazard'])
    vi.advanceTimersByTime(1000)
    expect(runtime.tick(bot)).toEqual([])
    vi.advanceTimersByTime(1500)
    expect(runtime.tick(bot)).toEqual(['hazard'])
    expect(onAlert).toHaveBeenCalledTimes(2)
  })

  it('does not start the cooldown when the situation ended before the alert', () => {
    const onAlert = vi.fn()
    const runtime = new ReflexRuntime({ logger: createLogger(), onAlert })
    const { bot } = createMockBot()
    let present = false
    runtime.registerBehavior(alertBehavior('hazard', 2000, {
      cooldownMs: 2000,
      observe: () => present ? { kind: 'in_lava', urgency: 'urgent', description: 'lava', metadata: {} } : null,
    }))

    expect(runtime.tick(bot)).toEqual([])
    present = true
    expect(runtime.tick(bot)).toEqual(['hazard'])
    expect(onAlert).toHaveBeenCalledTimes(1)
  })

  it('skips behaviors that do not run in the current mode', () => {
    const onAlert = vi.fn()
    const runtime = new ReflexRuntime({ logger: createLogger(), onAlert })
    const { bot } = createMockBot()
    runtime.registerBehavior(alertBehavior('idle-only', 100, { modes: ['idle'] }))

    runtime.transitionMode('work')
    expect(runtime.tick(bot)).toEqual([])
    expect(onAlert).not.toHaveBeenCalled()
  })

  it('keeps raising other alerts when one observation throws', () => {
    const onAlert = vi.fn()
    const logger = createLogger()
    const runtime = new ReflexRuntime({ logger, onAlert })
    const { bot } = createMockBot()
    runtime.registerBehavior(alertBehavior('broken', 2000, {
      observe: () => {
        throw new Error('boom')
      },
    }))
    runtime.registerBehavior(alertBehavior('hunger', 500))

    expect(runtime.tick(bot)).toEqual(['hunger'])
    expect(logger.error).toHaveBeenCalledWith('ReflexRuntime: behavior observation failed')
  })
})
