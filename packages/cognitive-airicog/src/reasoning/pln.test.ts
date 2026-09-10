import type { AtomSpace } from '../atomspace/atomspace'
import type { PLN } from './pln'

import { beforeEach, describe, expect, it } from 'vitest'

import { createAtomSpace } from '../atomspace/atomspace'
import { createPLN, TVFormulas } from './pln'

describe('tVFormulas', () => {
  describe('negation', () => {
    it('flips the strength and preserves confidence', () => {
      const tv = TVFormulas.negation({ strength: 0.7, confidence: 0.8 })
      expect(tv.strength).toBeCloseTo(0.3)
      expect(tv.confidence).toBe(0.8)
    })
  })

  describe('conjunction', () => {
    it('multiplies strengths and takes min confidence', () => {
      const tv = TVFormulas.conjunction(
        { strength: 0.9, confidence: 0.8 },
        { strength: 0.8, confidence: 0.6 },
      )
      expect(tv.strength).toBeCloseTo(0.72)
      expect(tv.confidence).toBe(0.6)
    })
  })

  describe('disjunction', () => {
    it('applies inclusive-OR formula', () => {
      // P(A OR B) = 0.5 + 0.5 - 0.5*0.5 = 0.75
      const tv = TVFormulas.disjunction(
        { strength: 0.5, confidence: 0.9 },
        { strength: 0.5, confidence: 0.9 },
      )
      expect(tv.strength).toBeCloseTo(0.75)
    })
  })

  describe('implication', () => {
    it('returns a bounded strength', () => {
      const tv = TVFormulas.implication(
        { strength: 0.8, confidence: 0.9 },
        { strength: 0.6, confidence: 0.7 },
      )
      expect(tv.strength).toBeGreaterThanOrEqual(0)
      expect(tv.strength).toBeLessThanOrEqual(1)
      expect(tv.confidence).toBeGreaterThan(0)
    })
  })
})

describe('pLN', () => {
  let as: AtomSpace
  let pln: PLN

  beforeEach(() => {
    as = createAtomSpace({ name: 'pln-test' })
    pln = createPLN(as)
  })

  describe('deduction', () => {
    it('infers A->C from A->B and B->C', () => {
      const dog = as.addNode('ConceptNode', 'Dog')
      const mammal = as.addNode('ConceptNode', 'Mammal')
      const animal = as.addNode('ConceptNode', 'Animal')

      const dogMammal = as.addLink('InheritanceLink', [dog.id, mammal.id], {
        strength: 0.95,
        confidence: 0.9,
      })
      const mammalAnimal = as.addLink('InheritanceLink', [mammal.id, animal.id], {
        strength: 0.98,
        confidence: 0.95,
      })

      const result = pln.deduction(dogMammal.id, mammalAnimal.id)
      expect(result).not.toBeNull()
      expect(result!.rule).toBe('deduction')
      expect(result!.conclusion.truthValue.strength).toBeGreaterThan(0)
    })

    it('returns null when a premise is missing', () => {
      expect(pln.deduction('missing1', 'missing2')).toBeNull()
    })

    it('returns null when B endpoints do not match', () => {
      const a = as.addNode('ConceptNode', 'A')
      const b = as.addNode('ConceptNode', 'B')
      const c = as.addNode('ConceptNode', 'C')
      const d = as.addNode('ConceptNode', 'D')
      const l1 = as.addLink('InheritanceLink', [a.id, b.id])
      // c->d does not chain from a->b (different B)
      const l2 = as.addLink('InheritanceLink', [c.id, d.id])
      expect(pln.deduction(l1.id, l2.id)).toBeNull()
    })
  })

  describe('modusPonens', () => {
    it('applies A, A->B => B', () => {
      const a = as.addNode('ConceptNode', 'DogMP', { strength: 1.0, confidence: 0.9 })
      const b = as.addNode('ConceptNode', 'HasLegs')
      const link = as.addLink('InheritanceLink', [a.id, b.id], {
        strength: 0.9,
        confidence: 0.85,
      })
      const result = pln.modusPonens(a.id, link.id)
      expect(result).not.toBeNull()
      expect(result!.rule).toBe('modus_ponens')
    })

    it('returns null when the atom is not the source of the link', () => {
      const a = as.addNode('ConceptNode', 'Src')
      const b = as.addNode('ConceptNode', 'Tgt')
      const link = as.addLink('InheritanceLink', [a.id, b.id])
      // b is not the source of link (a is)
      expect(pln.modusPonens(b.id, link.id)).toBeNull()
    })
  })

  describe('induction', () => {
    it('returns null when A endpoints do not match', () => {
      const a = as.addNode('ConceptNode', 'A')
      const b = as.addNode('ConceptNode', 'B')
      const c = as.addNode('ConceptNode', 'C')
      const d = as.addNode('ConceptNode', 'D')
      const l1 = as.addLink('InheritanceLink', [a.id, b.id])
      const l2 = as.addLink('InheritanceLink', [c.id, d.id])
      expect(pln.induction(l1.id, l2.id)).toBeNull()
    })
  })

  describe('forwardChain', () => {
    it('runs without error and returns an array', () => {
      const dog = as.addNode('ConceptNode', 'Dog3')
      const mammal = as.addNode('ConceptNode', 'Mammal3')
      const animal = as.addNode('ConceptNode', 'Animal3')
      as.addLink('InheritanceLink', [dog.id, mammal.id], { strength: 0.95, confidence: 0.9 })
      as.addLink('InheritanceLink', [mammal.id, animal.id], { strength: 0.98, confidence: 0.95 })
      const results = pln.forwardChain(dog.id, 2)
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('backwardChain', () => {
    it('runs without error and returns an array', () => {
      const a = as.addNode('ConceptNode', 'A')
      const b = as.addNode('ConceptNode', 'B')
      const c = as.addNode('ConceptNode', 'C')
      as.addLink('InheritanceLink', [a.id, b.id], { strength: 0.9, confidence: 0.8 })
      as.addLink('InheritanceLink', [b.id, c.id], { strength: 0.85, confidence: 0.75 })
      const goal = as.addLink('InheritanceLink', [a.id, c.id])
      const results = pln.backwardChain(goal.id, 2)
      expect(Array.isArray(results)).toBe(true)
    })
  })
})
