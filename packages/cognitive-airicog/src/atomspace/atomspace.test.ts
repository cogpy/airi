import type { AtomSpace } from './atomspace'

import { beforeEach, describe, expect, it } from 'vitest'

import { createAtomSpace } from './atomspace'

describe('atomSpace', () => {
  let as: AtomSpace

  beforeEach(() => {
    as = createAtomSpace({ name: 'test' })
  })

  it('creates a named AtomSpace', () => {
    expect(as.getName()).toBe('test')
  })

  describe('addNode', () => {
    it('adds a ConceptNode and returns it', () => {
      const node = as.addNode('ConceptNode', 'Cat')
      expect(node.kind).toBe('node')
      expect(node.type).toBe('ConceptNode')
      expect(node.name).toBe('Cat')
    })

    it('returns the same node when adding a duplicate name+type', () => {
      const a = as.addNode('ConceptNode', 'Dog')
      const b = as.addNode('ConceptNode', 'Dog')
      expect(a.id).toBe(b.id)
    })

    it('updates truth value on duplicate node', () => {
      as.addNode('ConceptNode', 'Dog', { strength: 0.5 })
      const updated = as.addNode('ConceptNode', 'Dog', { strength: 0.8 })
      expect(updated.truthValue.strength).toBe(0.8)
    })
  })

  describe('addLink', () => {
    it('adds a link between two nodes', () => {
      const cat = as.addNode('ConceptNode', 'Cat')
      const animal = as.addNode('ConceptNode', 'Animal')
      const link = as.addLink('InheritanceLink', [cat.id, animal.id])
      expect(link.kind).toBe('link')
      expect(link.type).toBe('InheritanceLink')
      expect(link.outgoing).toEqual([cat.id, animal.id])
    })

    it('throws when an outgoing atom does not exist', () => {
      expect(() => as.addLink('InheritanceLink', ['nonexistent'])).toThrow()
    })

    it('returns the same link for identical type+outgoing', () => {
      const a = as.addNode('ConceptNode', 'A')
      const b = as.addNode('ConceptNode', 'B')
      const l1 = as.addLink('InheritanceLink', [a.id, b.id])
      const l2 = as.addLink('InheritanceLink', [a.id, b.id])
      expect(l1.id).toBe(l2.id)
    })
  })

  describe('getAtom / getNode', () => {
    it('retrieves an atom by id', () => {
      const node = as.addNode('ConceptNode', 'Fox')
      expect(as.getAtom(node.id)?.id).toBe(node.id)
    })

    it('retrieves a node by type and name', () => {
      as.addNode('ConceptNode', 'Fox')
      const found = as.getNode('ConceptNode', 'Fox')
      expect(found?.name).toBe('Fox')
    })

    it('returns undefined for a missing atom', () => {
      expect(as.getAtom('missing')).toBeUndefined()
    })
  })

  describe('query', () => {
    it('returns all ConceptNodes', () => {
      as.addNode('ConceptNode', 'X')
      as.addNode('ConceptNode', 'Y')
      as.addNode('PredicateNode', 'P')
      const results = as.query({ kind: 'node', nodeType: 'ConceptNode' })
      expect(results).toHaveLength(2)
    })

    it('filters by name wildcard', () => {
      as.addNode('ConceptNode', 'apple')
      as.addNode('ConceptNode', 'apricot')
      as.addNode('ConceptNode', 'banana')
      const results = as.query({ kind: 'node', name: 'ap*' })
      expect(results).toHaveLength(2)
    })

    it('returns atom by ID when pattern.id is set', () => {
      const node = as.addNode('ConceptNode', 'Z')
      const results = as.query({ id: node.id })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe(node.id)
    })
  })

  describe('removeAtom', () => {
    it('removes a node and returns true', () => {
      const node = as.addNode('ConceptNode', 'ToRemove')
      expect(as.removeAtom(node.id)).toBe(true)
      expect(as.getAtom(node.id)).toBeUndefined()
    })

    it('returns false for a non-existent atom', () => {
      expect(as.removeAtom('ghost')).toBe(false)
    })

    it('removes links that reference the removed node', () => {
      const a = as.addNode('ConceptNode', 'A')
      const b = as.addNode('ConceptNode', 'B')
      const link = as.addLink('InheritanceLink', [a.id, b.id])
      as.removeAtom(a.id)
      expect(as.getAtom(link.id)).toBeUndefined()
    })
  })

  describe('getStats', () => {
    it('reports correct counts', () => {
      const a = as.addNode('ConceptNode', 'A')
      const b = as.addNode('ConceptNode', 'B')
      as.addLink('InheritanceLink', [a.id, b.id])
      const stats = as.getStats()
      expect(stats.nodeCount).toBe(2)
      expect(stats.linkCount).toBe(1)
      expect(stats.totalAtoms).toBe(3)
    })
  })

  describe('export / import', () => {
    it('round-trips atoms through export/import', () => {
      const a = as.addNode('ConceptNode', 'A')
      const b = as.addNode('ConceptNode', 'B')
      as.addLink('InheritanceLink', [a.id, b.id])
      const exported = as.export()

      const as2 = createAtomSpace()
      as2.import(exported)
      const stats = as2.getStats()
      expect(stats.nodeCount).toBe(2)
      expect(stats.linkCount).toBe(1)
    })
  })

  describe('spreadActivation', () => {
    it('reaches connected atoms within maxHops', () => {
      const x = as.addNode('ConceptNode', 'X')
      const y = as.addNode('ConceptNode', 'Y')
      as.addLink('AssociativeLink', [x.id, y.id])
      const visited = as.spreadActivation(x.id, {
        intensity: 1.0,
        decay: 0.5,
        maxHops: 2,
      })
      expect(visited.has(x.id)).toBe(true)
      expect(visited.has(y.id)).toBe(true)
    })
  })

  describe('clear', () => {
    it('removes all atoms', () => {
      as.addNode('ConceptNode', 'ToWipe')
      as.clear()
      expect(as.getStats().totalAtoms).toBe(0)
    })
  })
})
