/**
 * AiriCog Conversation Guard
 *
 * Two characters that each answer the other never stop on their own: every
 * reply is a new turn that asks for a reply. A person gets bored or leaves; an
 * agent does not. This guard is the brake. It decides whether the character
 * replies to one more turn from another agent, given the agent turns she has
 * already replied to.
 *
 * It is a budget, not a mood: she replies to at most `turnBudget` agent turns
 * in any `windowMs`, and never to two agent turns closer than `cooldownMs`.
 * When the budget is spent she falls quiet. The other agent then has nothing to
 * answer, so the conversation stops on both sides.
 */

/** What the caller knows at the moment an agent turn arrives. */
export interface AgentReplyState {
  /** Current time, in milliseconds on the same clock as `repliedAt`. */
  now: number
  /**
   * When she replied to earlier agent turns, in milliseconds. Order does not
   * matter. Entries older than `windowMs` are ignored, so the caller may keep
   * a short tail rather than the full history.
   *
   * Only turns she replied to belong here. A turn the guard declined does not
   * spend budget, so the conversation can resume once the window has room.
   */
  repliedAt: readonly number[]
}

export interface ConversationGuardConfig {
  /**
   * Most agent turns she replies to within one `windowMs`. Raising it lets two
   * characters talk longer before one of them falls quiet; `0` means she never
   * answers another agent.
   *
   * @default 6
   */
  turnBudget: number
  /**
   * Length of the sliding window the budget applies to, in milliseconds.
   * Raising it makes the pause after a spent budget longer.
   *
   * @default 120000
   */
  windowMs: number
  /**
   * Shortest gap between two replies to agent turns, in milliseconds. A
   * burst of agent turns, such as one reply that arrived in two parts, gets
   * one reply rather than one per part. Raising it slows the exchange down.
   *
   * @default 2000
   */
  cooldownMs: number
}

/**
 * Why she does not reply.
 *
 * - `over-budget`: she already replied to `turnBudget` agent turns within the
 *   window.
 * - `cooldown`: she replied to another agent turn less than `cooldownMs` ago.
 */
export type AgentReplyHold = 'over-budget' | 'cooldown'

/**
 * The guard's answer.
 *
 * `turnsInWindow` counts earlier replies inside the window, before this one.
 * When she holds, `retryInMs` is the earliest time from now at which the same
 * history would let her reply.
 */
export type AgentReplyDecision
  = | { reply: true, turnsInWindow: number, remaining: number }
    | { reply: false, reason: AgentReplyHold, turnsInWindow: number, retryInMs: number }

export function createDefaultConversationGuardConfig(): ConversationGuardConfig {
  return {
    turnBudget: 6,
    windowMs: 120_000,
    cooldownMs: 2000,
  }
}

function nonNegative(value: number, fallback: number): number {
  if (!Number.isFinite(value))
    return fallback
  return Math.max(0, value)
}

/**
 * Decides whether the character replies to one more turn from another agent.
 *
 * Pure: the caller passes the clock and the reply history, records `now` in
 * `repliedAt` only when the answer is `reply: true`, and owns the consequence.
 * The budget is checked before the cooldown, so a spent budget always reports
 * `over-budget` and the longer wait.
 *
 * Non-finite config values fall back to their defaults; negative ones become
 * `0`, and a fractional budget is rounded down. Non-finite timestamps are
 * ignored. A timestamp after `now` (a clock that ran backwards) counts as a
 * reply that just happened, never as elapsed time.
 *
 * @example
 * decideAgentReply({ now: 10_000, repliedAt: [] })
 * // => { reply: true, turnsInWindow: 0, remaining: 5 }
 *
 * @example
 * decideAgentReply({ now: 10_000, repliedAt: [9_000] })
 * // => { reply: false, reason: 'cooldown', turnsInWindow: 1, retryInMs: 1000 }
 */
export function decideAgentReply(
  state: AgentReplyState,
  config: Partial<ConversationGuardConfig> = {},
): AgentReplyDecision {
  const defaults = createDefaultConversationGuardConfig()
  const turnBudget = Math.floor(nonNegative(config.turnBudget ?? defaults.turnBudget, defaults.turnBudget))
  const windowMs = nonNegative(config.windowMs ?? defaults.windowMs, defaults.windowMs)
  const cooldownMs = nonNegative(config.cooldownMs ?? defaults.cooldownMs, defaults.cooldownMs)
  const now = Number.isFinite(state.now) ? state.now : 0

  // Age of each earlier reply. A future timestamp is clamped to age 0, so a
  // clock that ran backwards keeps the reply inside the window and the cooldown.
  const ages = state.repliedAt
    .filter(at => Number.isFinite(at))
    .map(at => Math.max(0, now - at))
    .filter(age => age < windowMs)
    .sort((a, b) => b - a)
  const turnsInWindow = ages.length

  if (turnsInWindow >= turnBudget) {
    // She may reply once enough of the oldest replies leave the window that
    // fewer than `turnBudget` remain. With a budget of 0 that never happens;
    // the window length is the most useful finite answer.
    const blocking = turnsInWindow - turnBudget
    const retryInMs = turnBudget === 0 ? windowMs : windowMs - ages[blocking]!
    return { reply: false, reason: 'over-budget', turnsInWindow, retryInMs }
  }

  const youngest = ages.at(-1)
  if (youngest !== undefined && youngest < cooldownMs)
    return { reply: false, reason: 'cooldown', turnsInWindow, retryInMs: cooldownMs - youngest }

  return { reply: true, turnsInWindow, remaining: turnBudget - turnsInWindow - 1 }
}
