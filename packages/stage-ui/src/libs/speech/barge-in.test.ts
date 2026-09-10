import type { BargeInPlaybackManager } from './barge-in'

import { describe, expect, it, vi } from 'vitest'

import { bindBargeInToPlaybackManager, createBargeInController } from './barge-in'

/**
 * A controllable clock and timer, so overlap length is set by the test rather
 * than by waiting. Timers fire only when the clock is advanced past them.
 */
function harness(config?: Parameters<typeof createBargeInController>[0]['config']) {
  let clock = 10_000
  const timers = new Map<number, { at: number, fn: () => void }>()
  let nextHandle = 1

  const stopSpeaking = vi.fn<(reason: string) => void>()

  const controller = createBargeInController({
    stopSpeaking,
    config,
    now: () => clock,
    setTimer: (fn, ms) => {
      const handle = nextHandle++
      timers.set(handle, { at: clock + ms, fn })
      return handle
    },
    clearTimer: (handle) => {
      timers.delete(handle as number)
    },
  })

  return {
    controller,
    stopSpeaking,
    pendingTimers: () => timers.size,
    advance(ms: number) {
      const target = clock + ms

      // Fire due timers in order, letting each schedule its successor.
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0]

        if (!due)
          break

        const [handle, timer] = due
        timers.delete(handle)
        clock = timer.at
        timer.fn()
      }

      clock = target
    },
  }
}

describe('createBargeInController', () => {
  it('stops the character once an interruption outlasts backchannel length', () => {
    const { controller, stopSpeaking, advance } = harness()

    controller.onPlaybackStart()
    advance(2000) // well past the opening grace
    controller.onSpeechStart()
    advance(500) // past backchannelMs of 400

    expect(stopSpeaking).toHaveBeenCalledWith('interrupted')
  })

  it('ignores a backchannel that ends before it counts', () => {
    const { controller, stopSpeaking, advance } = harness()

    controller.onPlaybackStart()
    advance(2000)
    controller.onSpeechStart()
    advance(150) // an "mhm"
    controller.onSpeechEnd()
    advance(5000)

    expect(stopSpeaking).not.toHaveBeenCalled()
  })

  it('does not let a run of short backchannels add up to an interruption', () => {
    const { controller, stopSpeaking, advance } = harness()

    controller.onPlaybackStart()
    advance(2000)

    for (let i = 0; i < 5; i++) {
      controller.onSpeechStart()
      advance(150)
      controller.onSpeechEnd()
      advance(150)
    }

    expect(stopSpeaking).not.toHaveBeenCalled()
  })

  it('holds through overlap in the opening moments of its own utterance', () => {
    const { controller, stopSpeaking, advance } = harness()

    controller.onPlaybackStart()
    advance(100) // inside the 300ms grace
    controller.onSpeechStart()
    advance(150)
    controller.onSpeechEnd()
    advance(5000)

    expect(stopSpeaking).not.toHaveBeenCalled()
  })

  it('yields to someone who starts early and keeps talking past the grace', () => {
    const { controller, stopSpeaking, advance } = harness()

    controller.onPlaybackStart()
    advance(50) // they cut in almost immediately
    controller.onSpeechStart()
    advance(1300)

    // The grace covers the utterance's first 300ms, not the whole overlap, so
    // by the time the overlap outlasts backchannel length this is an ordinary
    // interruption rather than the insistent case.
    expect(stopSpeaking).toHaveBeenCalledWith('interrupted')
  })

  it('stops only once for a single interruption', () => {
    const { controller, stopSpeaking, advance } = harness()

    controller.onPlaybackStart()
    advance(2000)
    controller.onSpeechStart()
    advance(5000)

    expect(stopSpeaking).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the character is not speaking', () => {
    const { controller, stopSpeaking, advance } = harness()

    controller.onSpeechStart()
    advance(10_000)

    expect(stopSpeaking).not.toHaveBeenCalled()
  })

  it('judges someone already talking from the new utterance, not before it', () => {
    const { controller, stopSpeaking, advance } = harness()

    // They were already mid-sentence when the character began. The grace holds
    // it briefly, but the overlap is measured from when they actually started,
    // so it is 1000ms old already and insistence comes due almost at once —
    // this is the one path that reaches `insisted` on the default config.
    controller.onSpeechStart()
    advance(1000)
    controller.onPlaybackStart()
    advance(300)

    expect(stopSpeaking).toHaveBeenCalledWith('insisted')
  })

  it('leaves no timer pending once the character stops on its own', () => {
    const { controller, advance, pendingTimers } = harness()

    controller.onPlaybackStart()
    advance(2000)
    controller.onSpeechStart()
    controller.onPlaybackStopped()
    advance(5000)

    expect(pendingTimers()).toBe(0)
  })

  it('drops its pending timer when disposed', () => {
    const { controller, stopSpeaking, advance, pendingTimers } = harness()

    controller.onPlaybackStart()
    advance(2000)
    controller.onSpeechStart()
    controller.dispose()
    advance(5000)

    expect(pendingTimers()).toBe(0)
    expect(stopSpeaking).not.toHaveBeenCalled()
  })

  it('honours a character configured to hold the floor harder', () => {
    const { controller, stopSpeaking, advance } = harness({
      backchannelMs: 2000,
      insistentMs: 5000,
    })

    controller.onPlaybackStart()
    advance(2000)
    controller.onSpeechStart()
    advance(1500) // would interrupt on the defaults

    expect(stopSpeaking).not.toHaveBeenCalled()

    advance(1000) // now past the configured 2000ms

    expect(stopSpeaking).toHaveBeenCalledWith('interrupted')
  })
})

describe('bindBargeInToPlaybackManager', () => {
  it('tracks whether the character is audible across every terminal outcome', () => {
    // The binder never reads the event payload, so the listeners are collected
    // at their declared types and invoked with a stand-in.
    type AnyListener = (event: never) => void

    const listeners = {
      start: [] as AnyListener[],
      end: [] as AnyListener[],
      interrupt: [] as AnyListener[],
      reject: [] as AnyListener[],
    }

    const manager: BargeInPlaybackManager<AudioBuffer> = {
      onStart: (f) => { listeners.start.push(f as AnyListener) },
      onEnd: (f) => { listeners.end.push(f as AnyListener) },
      onInterrupt: (f) => { listeners.interrupt.push(f as AnyListener) },
      onReject: (f) => { listeners.reject.push(f as AnyListener) },
      stopAll: vi.fn(),
    }

    const controller = {
      onPlaybackStart: vi.fn(),
      onPlaybackStopped: vi.fn(),
      onSpeechStart: vi.fn(),
      onSpeechEnd: vi.fn(),
      evaluate: vi.fn(),
      dispose: vi.fn(),
    }

    bindBargeInToPlaybackManager(manager, controller)

    listeners.start.forEach(f => f(undefined as never))
    expect(controller.onPlaybackStart).toHaveBeenCalledTimes(1)

    // Every terminal outcome means the character is no longer audible.
    listeners.end.forEach(f => f(undefined as never))
    listeners.interrupt.forEach(f => f(undefined as never))
    listeners.reject.forEach(f => f(undefined as never))
    expect(controller.onPlaybackStopped).toHaveBeenCalledTimes(3)
  })
})
