import type { AtomSpace } from '../atomspace/atomspace'
import type { ECAN } from './ecan'

import { beforeEach, describe, expect, it } from 'vitest'

import { createAtomSpace } from '../atomspace/atomspace'
import { createECAN, createRelevanceRealization } from './ecan'

/**
 * Importance currently allocated to atoms, i.e. everything the bank has issued
 * and not yet reclaimed.
 *
 * @example allocated(as) // => 0.5 for a single default node
 */
function allocated(as: AtomSpace): number {
  return as.getTotalSti()
}

/**
 * The full conserved quantity of an attention economy: banked plus allocated.
 * Compared against `getAttentionFunds()` with exact equality, because the
 * attention lattice makes the invariant bit-exact rather than approximate.
 *
 * @example ledger(ecan, as) // => 1000 for a freshly reconciled default economy
 */
function ledger(ecan: ECAN, as: AtomSpace): number {
  return ecan.getAttentionBank() + allocated(as)
}

describe('eCAN', () => {
  let as: AtomSpace
  let ecan: ECAN

  beforeEach(() => {
    as = createAtomSpace({ name: 'ecan-test' })
    ecan = createECAN(as)
  })

  it('creates an ECAN instance', () => {
    expect(ecan).toBeDefined()
  })

  describe('stimulate', () => {
    it('increases atom STI when stimulated', () => {
      const node = as.addNode('ConceptNode', 'Focus', {}, { sti: 0.0 })
      ecan.stimulate(node.id, 0.3)
      const updated = as.getAtom(node.id)
      expect(updated!.attentionValue.sti).toBeGreaterThan(0)
    })

    it('does nothing for a non-existent atom', () => {
      expect(() => ecan.stimulate('ghost', 0.1)).not.toThrow()
    })
  })

  describe('inhibit', () => {
    it('decreases atom STI when inhibited', () => {
      const node = as.addNode('ConceptNode', 'Blur', {}, { sti: 0.8 })
      ecan.inhibit(node.id, 0.3)
      const updated = as.getAtom(node.id)
      expect(updated!.attentionValue.sti).toBeLessThan(0.8)
    })

    it('does not let STI go below 0', () => {
      const node = as.addNode('ConceptNode', 'Zero', {}, { sti: 0.1 })
      ecan.inhibit(node.id, 1.0)
      const updated = as.getAtom(node.id)
      expect(updated!.attentionValue.sti).toBeGreaterThanOrEqual(0)
    })
  })

  describe('isInFocus', () => {
    it('returns true for high-STI atoms', () => {
      const node = as.addNode('ConceptNode', 'Hot', {}, { sti: 0.9 })
      expect(ecan.isInFocus(node.id)).toBe(true)
    })

    it('returns false for low-STI atoms', () => {
      const node = as.addNode('ConceptNode', 'Cold', {}, { sti: 0.1 })
      expect(ecan.isInFocus(node.id)).toBe(false)
    })
  })

  describe('getAttentionalFocus', () => {
    it('returns atoms sorted by STI', () => {
      as.addNode('ConceptNode', 'A', {}, { sti: 0.3 })
      as.addNode('ConceptNode', 'B', {}, { sti: 0.9 })
      as.addNode('ConceptNode', 'C', {}, { sti: 0.6 })
      const focus = ecan.getAttentionalFocus()
      expect(focus[0].attentionValue.sti).toBeGreaterThanOrEqual(
        focus[1].attentionValue.sti,
      )
    })
  })

  describe('getStats', () => {
    it('returns stats object with expected shape', () => {
      as.addNode('ConceptNode', 'S', {}, { sti: 0.7 })
      const stats = ecan.getStats()
      expect(typeof stats.totalAttention).toBe('number')
      expect(typeof stats.focusSize).toBe('number')
      expect(typeof stats.entropy).toBe('number')
    })
  })

  describe('deposit / getAttentionBank', () => {
    it('increases the attention bank after deposit', () => {
      const before = ecan.getAttentionBank()
      ecan.deposit(100)
      expect(ecan.getAttentionBank()).toBe(before + 100)
    })
  })

  describe('step', () => {
    it('runs one attention step without throwing', () => {
      as.addNode('ConceptNode', 'Step', {}, { sti: 0.8 })
      expect(() => ecan.step()).not.toThrow()
    })
  })

  describe('dispose', () => {
    it('stops auto-update and disposes cleanly', () => {
      const ecanAuto = createECAN(as, { autoUpdate: false })
      expect(() => ecanAuto.dispose()).not.toThrow()
    })
  })
})

describe('relevanceRealization', () => {
  it('returns a relevance map for context atoms', () => {
    const as = createAtomSpace()
    const ecan = createECAN(as)
    const rr = createRelevanceRealization(ecan, as)

    const a = as.addNode('ConceptNode', 'ContextA')
    const b = as.addNode('ConceptNode', 'Related')
    as.addLink('AssociativeLink', [a.id, b.id])

    const scores = rr.realizeRelevance([a.id])
    expect(scores.has(a.id)).toBe(true)
  })

  it('getMostRelevant returns up to limit atoms', () => {
    const as = createAtomSpace()
    const ecan = createECAN(as)
    const rr = createRelevanceRealization(ecan, as)

    const a = as.addNode('ConceptNode', 'Anchor')
    for (let i = 0; i < 5; i++) {
      const x = as.addNode('ConceptNode', `Node${i}`)
      as.addLink('AssociativeLink', [a.id, x.id])
    }

    const top = rr.getMostRelevant([a.id], 3)
    expect(top.length).toBeLessThanOrEqual(3)
  })
})

describe('eCAN attention ledger', () => {
  let as: AtomSpace
  let ecan: ECAN

  beforeEach(() => {
    as = createAtomSpace({ name: 'ledger-test' })
    ecan = createECAN(as)
  })

  it('balances the ledger exactly once reconciled', () => {
    for (let i = 0; i < 8; i++) as.addNode('ConceptNode', `L${i}`, {}, { sti: 0.3 })
    ecan.reconcile()
    expect(ledger(ecan, as)).toBe(ecan.getAttentionFunds())
  })

  it('reports the drift absorbed from atoms born outside the economy', () => {
    // Atoms are created with a default STI that the bank never issued, so the
    // first reconcile must charge that importance to the bank.
    as.addNode('ConceptNode', 'Unbanked', {}, { sti: 0.25 })
    const drift = ecan.reconcile()
    expect(drift).toBe(-0.25)
    expect(ledger(ecan, as)).toBe(ecan.getAttentionFunds())
  })

  it('credits an atom exactly what it debits from the bank, at saturation', () => {
    // ROOT CAUSE:
    //
    // stimulate() withdrew the full requested amount from the bank but credited
    // Math.min(1, sti + amount) to the atom, so any part of the request that
    // did not fit under the STI ceiling was destroyed rather than left banked.
    // A 0.5 stimulation of an atom at sti 0.95 debited 0.5 and credited 0.05,
    // annihilating 0.45 of a supposedly conserved currency.
    //
    //   this.attentionBank -= actualAmount;
    //   atom.attentionValue.sti = Math.min(1, atom.attentionValue.sti + actualAmount);
    //
    // Fixed by capping the withdrawal at the atom's remaining headroom, so the
    // debit and the credit are the same quantised value and the unfillable
    // remainder simply stays in the bank.
    const node = as.addNode('ConceptNode', 'Saturated', {}, { sti: 0.95 })
    ecan.reconcile()

    const bankBefore = ecan.getAttentionBank()
    const stiBefore = node.attentionValue.sti

    const granted = ecan.stimulate(node.id, 0.5)
    const debited = bankBefore - ecan.getAttentionBank()
    const credited = node.attentionValue.sti - stiBefore

    expect(granted).toBe(debited)
    expect(granted).toBe(credited)
    expect(ledger(ecan, as)).toBe(ecan.getAttentionFunds())
  })

  it('grants nothing when the atom has no headroom left', () => {
    const node = as.addNode('ConceptNode', 'Full', {}, { sti: 1 })
    ecan.reconcile()
    const bankBefore = ecan.getAttentionBank()

    expect(ecan.stimulate(node.id, 0.4)).toBe(0)
    expect(ecan.getAttentionBank()).toBe(bankBefore)
  })

  it('returns to the bank exactly what inhibition takes from the atom', () => {
    const node = as.addNode('ConceptNode', 'Fading', {}, { sti: 0.5 })
    ecan.reconcile()

    const bankBefore = ecan.getAttentionBank()
    const stiBefore = node.attentionValue.sti

    const reclaimed = ecan.inhibit(node.id, 0.2)

    expect(reclaimed).toBe(ecan.getAttentionBank() - bankBefore)
    expect(reclaimed).toBe(stiBefore - node.attentionValue.sti)
    expect(ledger(ecan, as)).toBe(ecan.getAttentionFunds())
  })

  it('preserves the ledger exactly across repeated allocation steps', () => {
    const a = as.addNode('ConceptNode', 'A', {}, { sti: 0.8 })
    const b = as.addNode('ConceptNode', 'B', {}, { sti: 0.7 })
    as.addLink('AssociativeLink', [a.id, b.id], {}, { sti: 0.9 })
    ecan.reconcile()

    const funds = ecan.getAttentionFunds()
    for (let i = 0; i < 25; i++) {
      ecan.step()
      expect(ledger(ecan, as)).toBe(funds)
    }
  })

  it('charges the bank for importance that spreading mints', () => {
    // ROOT CAUSE:
    //
    // spreadImportance() delegated to AtomSpace.spreadActivation, which raises
    // STI through boostAttention without consulting the bank. Importance was
    // therefore created from nothing on every spread, inflating the economy
    // without bound while getAttentionBank() reported no change at all.
    //
    // Fixed by measuring the allocation delta across the spread and debiting
    // it from the bank, so spreading is funded like any other issuance.
    const a = as.addNode('ConceptNode', 'Source', {}, { sti: 0.1 })
    const b = as.addNode('ConceptNode', 'Neighbour', {}, { sti: 0.1 })
    as.addLink('AssociativeLink', [a.id, b.id], {}, { sti: 0.1 })
    ecan.reconcile()

    const bankBefore = ecan.getAttentionBank()
    const allocatedBefore = allocated(as)

    ecan.spreadImportance({ sourceId: a.id, amount: 0.5 })

    const minted = allocated(as) - allocatedBefore
    expect(minted).toBeGreaterThan(0)
    expect(bankBefore - ecan.getAttentionBank()).toBe(minted)
    expect(ledger(ecan, as)).toBe(ecan.getAttentionFunds())
  })

  it('leaves importance with the link when diffusion targets are saturated', () => {
    // ROOT CAUSE:
    //
    // diffuseImportance() credited each target with Math.min(1, sti + share)
    // and then unconditionally subtracted the whole diffusion budget from the
    // link, so importance a saturated target could not accept was destroyed
    // instead of being retained.
    // Rent and wages are disabled so the only force acting on the link is
    // diffusion, and any movement in its STI is attributable to this bug.
    const isolated = createECAN(as, { taxRate: 0, accessWage: 0 })
    const target = as.addNode('ConceptNode', 'Saturated', {}, { sti: 1 })
    const link = as.addLink('AssociativeLink', [target.id], {}, { sti: 0.9 })
    isolated.reconcile()

    const funds = isolated.getAttentionFunds()
    const linkStiBefore = link.attentionValue.sti

    isolated.step()

    expect(target.attentionValue.sti).toBe(1)
    expect(link.attentionValue.sti).toBe(linkStiBefore)
    expect(ledger(isolated, as)).toBe(funds)
  })

  it('does not annihilate importance held by a link with no targets', () => {
    // ROOT CAUSE:
    //
    // A link with an empty outgoing array made sharePerAtom a division by
    // zero. The loop over `outgoing` never ran, so nothing was credited, yet
    // the link was still debited the full diffusion budget.
    const isolated = createECAN(as, { taxRate: 0, accessWage: 0 })
    const empty = as.addLink('ListLink', [], {}, { sti: 0.9 })
    isolated.reconcile()

    const funds = isolated.getAttentionFunds()
    const stiBefore = empty.attentionValue.sti

    isolated.step()

    expect(Number.isFinite(empty.attentionValue.sti)).toBe(true)
    expect(empty.attentionValue.sti).toBe(stiBefore)
    expect(ledger(isolated, as)).toBe(funds)
  })

  it('blocks issuance while the bank is overdrawn', () => {
    const small = createECAN(as, { attentionFunds: 0.5 })
    as.addNode('ConceptNode', 'Greedy', {}, { sti: 0.9 })
    const target = as.addNode('ConceptNode', 'Wanting', {}, { sti: 0 })
    small.reconcile()

    expect(small.getAttentionBank()).toBeLessThan(0)
    expect(small.stimulate(target.id, 0.2)).toBe(0)
  })

  it('grows funds and bank together on deposit so the ledger still balances', () => {
    as.addNode('ConceptNode', 'Held', {}, { sti: 0.5 })
    ecan.reconcile()

    const bankBefore = ecan.getAttentionBank()
    const fundsBefore = ecan.getAttentionFunds()

    ecan.deposit(100)

    expect(ecan.getAttentionBank()).toBe(bankBefore + 100)
    expect(ecan.getAttentionFunds()).toBe(fundsBefore + 100)
    expect(ledger(ecan, as)).toBe(ecan.getAttentionFunds())
  })
})

describe('eCAN attentional focus', () => {
  it('keeps avgFocusSti within its documented range when the focus is capped', () => {
    // ROOT CAUSE:
    //
    // getStats() summed STI over every atom that passed the isInFocus()
    // threshold test, but divided by focus.length, which came from the
    // top-N getAttentionalFocus() list. With 150 atoms above threshold and a
    // focus size of 100, avgFocusSti reported 1.35 for a field documented as
    // an average STI in [0, 1].
    //
    // Fixed by resolving focus membership once and deriving both the sum and
    // the count from that single set.
    const as = createAtomSpace()
    const ecan = createECAN(as, { attentionalFocusSize: 100 })
    for (let i = 0; i < 150; i++) as.addNode('ConceptNode', `F${i}`, {}, { sti: 0.9 })

    const stats = ecan.getStats()

    expect(stats.focusSize).toBe(100)
    expect(stats.avgFocusSti).toBeLessThanOrEqual(1)
    expect(stats.avgFocusSti).toBeCloseTo(0.9, 6)
  })

  it('excludes below-threshold atoms even when the focus is not full', () => {
    const as = createAtomSpace()
    const ecan = createECAN(as, { attentionalFocusThreshold: 0.5 })
    const hot = as.addNode('ConceptNode', 'Hot', {}, { sti: 0.9 })
    const cold = as.addNode('ConceptNode', 'Cold', {}, { sti: 0.1 })

    const focusIds = ecan.getAttentionalFocus().map(atom => atom.id)

    expect(focusIds).toContain(hot.id)
    expect(focusIds).not.toContain(cold.id)
  })

  it('agrees with isInFocus for an atom pushed out by the size cap', () => {
    const as = createAtomSpace()
    const ecan = createECAN(as, { attentionalFocusSize: 2, attentionalFocusThreshold: 0.5 })
    as.addNode('ConceptNode', 'Top', {}, { sti: 0.95 })
    as.addNode('ConceptNode', 'Mid', {}, { sti: 0.9 })
    const evicted = as.addNode('ConceptNode', 'Evicted', {}, { sti: 0.85 })

    expect(ecan.getAttentionalFocus()).toHaveLength(2)
    expect(ecan.isInFocus(evicted.id)).toBe(false)
  })

  it('reports the banked remainder alongside the allocated total', () => {
    const as = createAtomSpace()
    const ecan = createECAN(as)
    as.addNode('ConceptNode', 'Counted', {}, { sti: 0.5 })
    ecan.reconcile()

    const stats = ecan.getStats()

    expect(stats.totalAttention).toBe(0.5)
    expect(stats.attentionBank).toBe(ecan.getAttentionBank())
    expect(stats.totalAttention + stats.attentionBank).toBe(ecan.getAttentionFunds())
  })
})
