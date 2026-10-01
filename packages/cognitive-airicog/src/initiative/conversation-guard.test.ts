import { describe, expect, it } from 'vitest'

import { createDefaultConversationGuardConfig, decideAgentReply } from './conversation-guard'

const { turnBudget, windowMs, cooldownMs } = createDefaultConversationGuardConfig()

/** Replies spaced well apart, so tests that are not about the cooldown get past it. */
function repliesBefore(now: number, count: number, spacingMs = 10_000): number[] {
  return Array.from({ length: count }, (_, index) => now - spacingMs * (count - index))
}

describe('decideAgentReply', () => {
  it('replies to the first agent turn', () => {
    expect(decideAgentReply({ now: 1_000_000, repliedAt: [] }))
      .toEqual({ reply: true, turnsInWindow: 0, remaining: turnBudget - 1 })
  })

  it('replies while the budget has room', () => {
    const now = 1_000_000
    expect(decideAgentReply({ now, repliedAt: repliesBefore(now, turnBudget - 1) }))
      .toEqual({ reply: true, turnsInWindow: turnBudget - 1, remaining: 0 })
  })

  it('falls quiet once the budget is spent within the window', () => {
    const now = 1_000_000
    const decision = decideAgentReply({ now, repliedAt: repliesBefore(now, turnBudget) })

    expect(decision).toMatchObject({ reply: false, reason: 'over-budget', turnsInWindow: turnBudget })
  })

  it('says when the oldest reply leaves the window', () => {
    const now = 1_000_000
    // The oldest reply is 60 s old, so it leaves a 120 s window in 60 s.
    const decision = decideAgentReply({ now, repliedAt: repliesBefore(now, turnBudget) })

    expect(decision).toMatchObject({ retryInMs: windowMs - turnBudget * 10_000 })
  })

  it('replies again once old replies leave the window', () => {
    const now = 1_000_000
    const stale = repliesBefore(now - windowMs, turnBudget)

    expect(decideAgentReply({ now, repliedAt: stale }))
      .toMatchObject({ reply: true, turnsInWindow: 0 })
  })

  it('gives a burst of agent turns one reply', () => {
    const now = 1_000_000
    expect(decideAgentReply({ now, repliedAt: [now - cooldownMs + 500] }))
      .toEqual({ reply: false, reason: 'cooldown', turnsInWindow: 1, retryInMs: 500 })
  })

  it('reports the budget before the cooldown', () => {
    // A spent budget is the longer wait, so it is the useful reason.
    const now = 1_000_000
    const repliedAt = [...repliesBefore(now, turnBudget - 1), now - 100]

    expect(decideAgentReply({ now, repliedAt }))
      .toMatchObject({ reply: false, reason: 'over-budget' })
  })

  it('never replies with a budget of zero', () => {
    expect(decideAgentReply({ now: 1_000_000, repliedAt: [] }, { turnBudget: 0 }))
      .toEqual({ reply: false, reason: 'over-budget', turnsInWindow: 0, retryInMs: windowMs })
  })

  it('takes a card budget over the default', () => {
    const now = 1_000_000
    expect(decideAgentReply({ now, repliedAt: repliesBefore(now, 2) }, { turnBudget: 2 }))
      .toMatchObject({ reply: false, reason: 'over-budget' })
  })

  it('rounds a fractional budget down', () => {
    const now = 1_000_000
    expect(decideAgentReply({ now, repliedAt: repliesBefore(now, 2) }, { turnBudget: 2.9 }))
      .toMatchObject({ reply: false, reason: 'over-budget' })
  })

  it('falls back to defaults for non-finite config', () => {
    expect(decideAgentReply({ now: 1_000_000, repliedAt: [] }, { turnBudget: Number.NaN, windowMs: Number.POSITIVE_INFINITY }))
      .toEqual({ reply: true, turnsInWindow: 0, remaining: turnBudget - 1 })
  })

  it('ignores non-finite timestamps', () => {
    expect(decideAgentReply({ now: 1_000_000, repliedAt: [Number.NaN, Number.POSITIVE_INFINITY] }))
      .toMatchObject({ reply: true, turnsInWindow: 0 })
  })

  it('treats a reply from the future as one that just happened', () => {
    // A clock that ran backwards is not elapsed time: it must not let the
    // character answer sooner than the cooldown allows.
    const now = 1_000_000
    expect(decideAgentReply({ now, repliedAt: [now + 60_000] }))
      .toEqual({ reply: false, reason: 'cooldown', turnsInWindow: 1, retryInMs: cooldownMs })
  })
})
