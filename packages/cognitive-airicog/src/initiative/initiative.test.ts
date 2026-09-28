import type { InitiativeState } from './initiative'

import { describe, expect, it } from 'vitest'

import { createAtomSpace } from '../atomspace/atomspace'
import { createECAN } from '../attention/ecan'
import { candidatesFromFocus, createDefaultInitiativeConfig, decideInitiative } from './initiative'

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

    expect(decision.act).toBe(true)
    if (!decision.act)
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
