import type { YieldConfig } from '@proj-airi/cognitive-airicog/initiative'
import type {
  PlaybackEndEvent,
  PlaybackInterruptEvent,
  PlaybackRejectEvent,
  PlaybackStartEvent,
} from '@proj-airi/pipelines-audio'

import { createDefaultYieldConfig, decideYield } from '@proj-airi/cognitive-airicog/initiative'

/**
 * The slice of a playback manager barge-in needs: the terminal events that say
 * whether the character is audible, and a way to cut it off.
 */
export interface BargeInPlaybackManager<TAudio> {
  onStart: (listener: (event: PlaybackStartEvent<TAudio>) => void) => void
  onEnd: (listener: (event: PlaybackEndEvent<TAudio>) => void) => void
  onInterrupt: (listener: (event: PlaybackInterruptEvent<TAudio>) => void) => void
  onReject: (listener: (event: PlaybackRejectEvent<TAudio>) => void) => void
  stopAll: (reason?: string) => void
}

/**
 * Injected so tests can drive the clock and the timer directly. The defaults
 * are the real ones.
 */
export interface BargeInDeps {
  /** Cuts the character off. `reason` is the yield reason, for logging. */
  stopSpeaking: (reason: string) => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  config?: Partial<YieldConfig>
}

export interface BargeInController {
  /** The character started producing audio. */
  onPlaybackStart: (at?: number) => void
  /** The character's audio ended, was interrupted, or was rejected. */
  onPlaybackStopped: () => void
  /** Voice activity detected the other party starting to speak. */
  onSpeechStart: (at?: number) => void
  /** Voice activity detected them stopping. */
  onSpeechEnd: () => void
  /**
   * Re-checks the yield policy. Called automatically as thresholds come due;
   * exposed so a host that already ticks can drive it instead.
   */
  evaluate: (at?: number) => void
  /** Drops any pending timer. */
  dispose: () => void
}

/**
 * Connects voice activity to speech playback, so the character stops when it
 * is talked over.
 *
 * Both halves of this already existed and were never joined: voice activity
 * detection knows when the other party speaks, and the playback manager can be
 * stopped — but nothing asked whether it should be. The policy is
 * `decideYield`; this owns only the bookkeeping it needs, which is when the
 * current utterance began and how long the overlap has run.
 *
 * Overlap grows with time, so one check at the moment speech starts is not
 * enough — a backchannel and a real interruption look identical at 50ms. Rather
 * than poll, the controller schedules a single re-check at the next instant the
 * decision could change, and stops entirely once it has.
 */
export function createBargeInController(deps: BargeInDeps): BargeInController {
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  })
  const config: YieldConfig = { ...createDefaultYieldConfig(), ...deps.config }

  let speaking = false
  let utteranceStartedAt = 0
  let overlapStartedAt: number | undefined
  let timer: unknown

  function cancelTimer(): void {
    if (timer === undefined)
      return

    clearTimer(timer)
    timer = undefined
  }

  /**
   * The next instant the decision could flip, or undefined if it cannot.
   *
   * Holding for opening grace ends when the grace does; holding for backchannel
   * ends when the overlap outlasts it; insistence overrides both, so it caps
   * the wait either way.
   */
  function nextDecisionAt(at: number): number | undefined {
    if (overlapStartedAt === undefined || !speaking)
      return undefined

    const candidates = [
      utteranceStartedAt + config.openingGraceMs,
      overlapStartedAt + config.backchannelMs,
      overlapStartedAt + config.insistentMs,
    ].filter(candidate => candidate > at)

    return candidates.length > 0 ? Math.min(...candidates) : undefined
  }

  function scheduleNext(at: number): void {
    cancelTimer()

    const next = nextDecisionAt(at)
    if (next === undefined)
      return

    timer = setTimer(() => {
      timer = undefined
      evaluate()
    }, next - at)
  }

  function evaluate(at: number = now()): void {
    if (!speaking || overlapStartedAt === undefined) {
      cancelTimer()
      return
    }

    const decision = decideYield({
      speaking,
      utteranceElapsedMs: at - utteranceStartedAt,
      overlapMs: at - overlapStartedAt,
    }, config)

    if (!decision.yieldFloor) {
      scheduleNext(at)
      return
    }

    // Stopping playback emits a terminal event, which calls onPlaybackStopped
    // in the bound case — but this controller may be driven directly, so clear
    // the speaking state here too rather than depend on the round trip.
    cancelTimer()
    speaking = false
    deps.stopSpeaking(decision.reason)
  }

  return {
    onPlaybackStart(at = now()) {
      speaking = true
      utteranceStartedAt = at
      // Someone already talking when the character starts is judged from this
      // utterance's beginning, so the opening grace applies to it.
      evaluate(at)
    },
    onPlaybackStopped() {
      speaking = false
      cancelTimer()
    },
    onSpeechStart(at = now()) {
      overlapStartedAt = at
      evaluate(at)
    },
    onSpeechEnd() {
      // Continuity matters: ending the overlap resets it, so a run of short
      // backchannels never accumulates into an interruption.
      overlapStartedAt = undefined
      cancelTimer()
    },
    evaluate,
    dispose: cancelTimer,
  }
}

/**
 * Subscribes a controller to a playback manager's terminal events and points
 * its `stopSpeaking` at that manager.
 *
 * Mirrors `bindSpeakingStateToPlaybackManager`: the manager is the source of
 * truth for whether the character is audible.
 */
export function bindBargeInToPlaybackManager<TAudio>(
  manager: BargeInPlaybackManager<TAudio>,
  controller: BargeInController,
): void {
  manager.onStart(() => controller.onPlaybackStart())
  manager.onEnd(() => controller.onPlaybackStopped())
  manager.onInterrupt(() => controller.onPlaybackStopped())
  manager.onReject(() => controller.onPlaybackStopped())
}
