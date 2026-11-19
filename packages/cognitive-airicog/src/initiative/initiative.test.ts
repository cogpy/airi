import type { InitiativeState } from './initiative'

import { describe, expect, it } from 'vitest'

import { createAtomSpace } from '../atomspace/atomspace'
import { createECAN } from '../attention/ecan'
import { candidatesFromFocus, createDefaultInitiativeConfig, decideInitiative, initiativeTempo, mergeCandidates } from './initiative'

const NOW = 1_000_000

function stateWith(overrides: Partial<InitiativeState> = {}): InitiativeState {
  return {
    now: NOW,
    // A long silence by default, so tests that are not about pressure get it.
    lastInteractionAt: NOW - 600_000,
    candidates: [{ atomId: 'atom_topic', salience: 0.9 }],
    ...overrides,
  }
}

describe('decideInitiative', () => {
  it('raises the subject holding the most attention after a long silence', () => {
    const decision = decideInitiative(stateWith({
      candidates: [
        { atomId: 'atom_quiet', salience: 0.2 },
        { atomId: 'atom_loud', salience: 0.9 },
      ],
    }))

    expect(decision.act).toBe(true)
    if (!decision.act)
      return

    expect(decision.topicAtomId).toBe('atom_loud')
    expect(decision.urge).toBeGreaterThan(createDefaultInitiativeConfig().threshold)
  })

  it('stays quiet while the other party has only just spoken', () => {
    // Silence pressure is near zero a moment after an interaction, so even a
    // fully salient subject should not pull the character into speaking.
    const decision = decideInitiative(stateWith({ lastInteractionAt: NOW - 100 }))

    expect(decision).toMatchObject({ act: false, reason: 'below-threshold' })
  })

  it('stays quiet within the refractory gap however urgent the subject', () => {
    const decision = decideInitiative(stateWith({
      lastInitiativeAt: NOW - 1000,
      candidates: [{ atomId: 'atom_loud', salience: 1 }],
    }))

    expect(decision).toMatchObject({ act: false, reason: 'refractory' })
  })

  it('speaks again once the refractory gap has passed', () => {
    const { refractoryMs } = createDefaultInitiativeConfig()

    const decision = decideInitiative(stateWith({
      lastInitiativeAt: NOW - refractoryMs - 1,
    }))

    expect(decision.act).toBe(true)
  })

  it('stays quiet when nothing is in focus', () => {
    const decision = decideInitiative(stateWith({ candidates: [] }))

    expect(decision).toMatchObject({ act: false, reason: 'no-candidates' })
  })

  it('will not repeat a subject it just raised', () => {
    const decision = decideInitiative(stateWith({
      recentlyRaised: [{ atomId: 'atom_topic', at: NOW }],
    }))

    expect(decision).toMatchObject({ act: false, reason: 'below-threshold' })
  })

  it('prefers a fresh subject over a more salient one it just raised', () => {
    const decision = decideInitiative(stateWith({
      candidates: [
        { atomId: 'atom_stale', salience: 1 },
        { atomId: 'atom_fresh', salience: 0.6 },
      ],
      recentlyRaised: [{ atomId: 'atom_stale', at: NOW }],
    }))

    expect(decision.act).toBe(true)
    if (decision.act)
      expect(decision.topicAtomId).toBe('atom_fresh')
  })

  it('lets a subject come back round once enough time has passed', () => {
    const raisedLongAgo = stateWith({
      recentlyRaised: [{ atomId: 'atom_topic', at: NOW - 3_000_000 }],
    })

    expect(decideInitiative(raisedLongAgo).act).toBe(true)
  })

  it('judges staleness by the most recent mention, not the oldest', () => {
    const decision = decideInitiative(stateWith({
      recentlyRaised: [
        { atomId: 'atom_topic', at: NOW - 3_000_000 },
        { atomId: 'atom_topic', at: NOW },
      ],
    }))

    expect(decision).toMatchObject({ act: false, reason: 'below-threshold' })
  })

  it('reports the terms behind a decision to speak', () => {
    const decision = decideInitiative(stateWith())

    expect(decision).toMatchObject({ act: true, kind: 'topic' })
    if (!decision.act || decision.kind !== 'topic')
      return

    // The urge is the product of its three terms; a caller can show the reason.
    expect(decision.urge).toBeCloseTo(
      decision.silencePressure * decision.salience * decision.novelty,
    )
    expect(decision.novelty).toBe(1)
  })

  it('honours a threshold raised past the available urge', () => {
    expect(decideInitiative(stateWith(), { threshold: 0.99 })).toMatchObject({
      act: false,
      reason: 'below-threshold',
    })
  })

  it('treats a salience outside the unit range as its nearest bound', () => {
    const overRange = decideInitiative(stateWith({
      candidates: [{ atomId: 'atom_topic', salience: 42 }],
    }))
    const atCeiling = decideInitiative(stateWith({
      candidates: [{ atomId: 'atom_topic', salience: 1 }],
    }))

    expect(overRange.act).toBe(true)
    if (overRange.act && atCeiling.act)
      expect(overRange.urge).toBeCloseTo(atCeiling.urge)
  })

  it('does not read a clock that has run backwards as silence', () => {
    // A corrected clock can date the last interaction after `now`; that is not
    // a reason to start talking.
    const decision = decideInitiative(stateWith({ lastInteractionAt: NOW + 60_000 }))

    expect(decision).toMatchObject({ act: false, reason: 'below-threshold' })
  })
})

describe('candidatesFromFocus', () => {
  it('carries each focused atom over with its short-term importance', () => {
    const atomSpace = createAtomSpace({ name: 'initiative-test' })
    const ecan = createECAN(atomSpace)

    const song = atomSpace.addNode('ConceptNode', 'Song')
    ecan.stimulate(song.id, 0.3)

    const candidates = candidatesFromFocus(ecan)
    const forSong = candidates.find(candidate => candidate.atomId === song.id)

    expect(forSong).toBeDefined()
    expect(forSong?.salience).toBe(song.attentionValue.sti)

    ecan.dispose()
    atomSpace.dispose()
  })

  it('feeds the decision directly from a live attention economy', () => {
    const atomSpace = createAtomSpace({ name: 'initiative-live' })
    const ecan = createECAN(atomSpace)

    const topic = atomSpace.addNode('ConceptNode', 'Minecraft')
    ecan.stimulate(topic.id, 0.5)

    const decision = decideInitiative(stateWith({ candidates: candidatesFromFocus(ecan) }))

    expect(decision.act).toBe(true)

    ecan.dispose()
    atomSpace.dispose()
  })
})

describe('mergeCandidates', () => {
  it('keeps each subject once, at its highest salience across sources', () => {
    const memory = [{ atomId: 'cats', salience: 0.3 }, { atomId: 'dogs', salience: 0.5 }]
    const focus = [{ atomId: 'cats', salience: 0.7 }, { atomId: 'birds', salience: 0.2 }]

    expect(mergeCandidates(memory, focus)).toEqual([
      { atomId: 'cats', salience: 0.7 },
      { atomId: 'dogs', salience: 0.5 },
      { atomId: 'birds', salience: 0.2 },
    ])
  })

  it('dedupes a subject repeated within one source', () => {
    expect(mergeCandidates([{ atomId: 'cats', salience: 0.2 }, { atomId: 'cats', salience: 0.4 }])).toEqual([{ atomId: 'cats', salience: 0.4 }])
  })
})

describe('initiativeTempo', () => {
  it('leaves timing unchanged at resting arousal and without a mood', () => {
    expect(initiativeTempo(undefined)).toBe(1)
    expect(initiativeTempo(createDefaultInitiativeConfig().restingArousal)).toBeCloseTo(1)
  })

  it('doubles the tempo at full arousal and slows it when calm', () => {
    expect(initiativeTempo(1)).toBeCloseTo(2)
    expect(initiativeTempo(0)).toBeCloseTo(2 ** (-0.3 / 0.7))
  })
})

describe('decideInitiative with mood', () => {
  it('speaks sooner when excited', () => {
    // 8 s of silence on a strong subject: below the threshold at rest, above it at full arousal.
    const state = stateWith({ lastInteractionAt: NOW - 8_000 })

    expect(decideInitiative({ ...state, arousal: 0.3 })).toMatchObject({ act: false, reason: 'below-threshold' })
    expect(decideInitiative({ ...state, arousal: 1 })).toMatchObject({ act: true, kind: 'topic', tempo: expect.closeTo(2) })
  })

  it('waits longer when calm', () => {
    // 14 s of silence on a full subject: enough at rest, not enough fully calm.
    const state = stateWith({ lastInteractionAt: NOW - 14_000, candidates: [{ atomId: 'atom_topic', salience: 1 }] })

    expect(decideInitiative({ ...state, arousal: 0.3 })).toMatchObject({ act: true, kind: 'topic' })
    expect(decideInitiative({ ...state, arousal: 0 })).toMatchObject({ act: false, reason: 'below-threshold' })
  })
})

describe('decideInitiative musing', () => {
  it('muses on a subject of her own choosing when a long lull leaves nothing to pick up', () => {
    const decision = decideInitiative(stateWith({ candidates: [], musing: true }))

    expect(decision).toMatchObject({ act: true, kind: 'musing' })
    if (!decision.act)
      return
    expect(decision.topicAtomId).toBeUndefined()
  })

  it('stays silent with nothing to pick up when musing is off', () => {
    expect(decideInitiative(stateWith({ candidates: [] }))).toMatchObject({ act: false, reason: 'no-candidates' })
  })

  it('prefers a pressing subject from earlier over musing', () => {
    expect(decideInitiative(stateWith({ musing: true }))).toMatchObject({ act: true, kind: 'topic', topicAtomId: 'atom_topic' })
  })

  it('does not muse while the lull is still short', () => {
    expect(decideInitiative(stateWith({ candidates: [], musing: true, lastInteractionAt: NOW - 30_000 })))
      .toMatchObject({ act: false, reason: 'below-threshold' })
  })

  it('does not muse again soon after a musing', () => {
    expect(decideInitiative(stateWith({ candidates: [], musing: true, lastMusingAt: NOW - 60_000 })))
      .toMatchObject({ act: false, reason: 'below-threshold' })
  })
})

describe('decideInitiative follow-up', () => {
  const remarkAt = NOW - 90_000

  it('follows up her unanswered remark once the wait has run', () => {
    const decision = decideInitiative(stateWith({
      candidates: [],
      unanswered: { at: remarkAt, atomId: 'atom_remark', followedUp: false },
    }))

    expect(decision).toMatchObject({ act: true, kind: 'follow-up', topicAtomId: 'atom_remark', waitedMs: 90_000 })
  })

  it('follows up only once', () => {
    expect(decideInitiative(stateWith({ candidates: [], unanswered: { at: remarkAt, followedUp: true } })))
      .toMatchObject({ act: false, reason: 'no-candidates' })
  })

  it('measures the follow-up wait from her remark, not from the last interaction', () => {
    // Her own reply finishing counts as interaction, so the silence is short. The remark still waited 90 s.
    expect(decideInitiative(stateWith({ candidates: [], lastInteractionAt: NOW - 5_000, unanswered: { at: remarkAt, followedUp: false } })))
      .toMatchObject({ act: true, kind: 'follow-up', waitedMs: 90_000 })
  })

  it('waits for the delay before following up', () => {
    expect(decideInitiative(stateWith({ candidates: [], unanswered: { at: NOW - 20_000, followedUp: false } })))
      .toMatchObject({ act: false, reason: 'below-threshold', urge: 0 })
  })

  it('follows up a musing without a subject', () => {
    const decision = decideInitiative(stateWith({ candidates: [], unanswered: { at: remarkAt, followedUp: false } }))

    expect(decision).toMatchObject({ act: true, kind: 'follow-up' })
    if (!decision.act)
      return
    expect(decision.topicAtomId).toBeUndefined()
  })
})

describe('decideInitiative chance mode', () => {
  // A long silence makes silence pressure almost 1, so the urge is about the salience.
  const atThreshold = stateWith({ candidates: [{ atomId: 'atom_topic', salience: 0.25 }], lastInteractionAt: NOW - 3_600_000 })

  it('fires more readily the longer the poll covers', () => {
    // At the threshold the mean wait is 20 s: a 1 s poll fires with chance ~0.05, a 60 s poll with ~0.95.
    expect(decideInitiative({ ...atThreshold, chance: { random: 0.5, elapsedMs: 1_000 } })).toMatchObject({ act: false, reason: 'not-yet' })
    expect(decideInitiative({ ...atThreshold, chance: { random: 0.5, elapsedMs: 60_000 } })).toMatchObject({ act: true, kind: 'topic' })
  })

  it('can fire a little below the threshold, where the threshold mode cannot', () => {
    const below = stateWith({ candidates: [{ atomId: 'atom_topic', salience: 0.2 }], lastInteractionAt: NOW - 3_600_000 })

    expect(decideInitiative(below)).toMatchObject({ act: false, reason: 'below-threshold' })
    expect(decideInitiative({ ...below, chance: { random: 0, elapsedMs: 5_000 } })).toMatchObject({ act: true, kind: 'topic' })
  })

  it('never fires below the floor, whatever the draw', () => {
    const faint = stateWith({ candidates: [{ atomId: 'atom_topic', salience: 0.1 }], lastInteractionAt: NOW - 3_600_000 })

    expect(decideInitiative({ ...faint, chance: { random: 0, elapsedMs: 600_000 } })).toMatchObject({ act: false, reason: 'below-threshold' })
  })

  it('keeps the refractory gap', () => {
    expect(decideInitiative({ ...atThreshold, lastInitiativeAt: NOW - 1_000, chance: { random: 0, elapsedMs: 60_000 } }))
      .toMatchObject({ act: false, reason: 'refractory' })
  })
})
