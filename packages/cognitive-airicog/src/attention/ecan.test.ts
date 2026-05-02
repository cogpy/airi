import { describe, it, expect, beforeEach } from 'vitest';
import { createAtomSpace } from '../atomspace/atomspace';
import { createECAN, ECAN, createRelevanceRealization } from './ecan';
import type { AtomSpace } from '../atomspace/atomspace';

describe('ECAN', () => {
  let as: AtomSpace;
  let ecan: ECAN;

  beforeEach(() => {
    as = createAtomSpace({ name: 'ecan-test' });
    ecan = createECAN(as);
  });

  it('creates an ECAN instance', () => {
    expect(ecan).toBeDefined();
  });

  describe('stimulate', () => {
    it('increases atom STI when stimulated', () => {
      const node = as.addNode('ConceptNode', 'Focus', {}, { sti: 0.0 });
      ecan.stimulate(node.id, 0.3);
      const updated = as.getAtom(node.id);
      expect(updated!.attentionValue.sti).toBeGreaterThan(0);
    });

    it('does nothing for a non-existent atom', () => {
      expect(() => ecan.stimulate('ghost', 0.1)).not.toThrow();
    });
  });

  describe('inhibit', () => {
    it('decreases atom STI when inhibited', () => {
      const node = as.addNode('ConceptNode', 'Blur', {}, { sti: 0.8 });
      ecan.inhibit(node.id, 0.3);
      const updated = as.getAtom(node.id);
      expect(updated!.attentionValue.sti).toBeLessThan(0.8);
    });

    it('does not let STI go below 0', () => {
      const node = as.addNode('ConceptNode', 'Zero', {}, { sti: 0.1 });
      ecan.inhibit(node.id, 1.0);
      const updated = as.getAtom(node.id);
      expect(updated!.attentionValue.sti).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isInFocus', () => {
    it('returns true for high-STI atoms', () => {
      const node = as.addNode('ConceptNode', 'Hot', {}, { sti: 0.9 });
      expect(ecan.isInFocus(node.id)).toBe(true);
    });

    it('returns false for low-STI atoms', () => {
      const node = as.addNode('ConceptNode', 'Cold', {}, { sti: 0.1 });
      expect(ecan.isInFocus(node.id)).toBe(false);
    });
  });

  describe('getAttentionalFocus', () => {
    it('returns atoms sorted by STI', () => {
      as.addNode('ConceptNode', 'A', {}, { sti: 0.3 });
      as.addNode('ConceptNode', 'B', {}, { sti: 0.9 });
      as.addNode('ConceptNode', 'C', {}, { sti: 0.6 });
      const focus = ecan.getAttentionalFocus();
      expect(focus[0].attentionValue.sti).toBeGreaterThanOrEqual(
        focus[1].attentionValue.sti,
      );
    });
  });

  describe('getStats', () => {
    it('returns stats object with expected shape', () => {
      as.addNode('ConceptNode', 'S', {}, { sti: 0.7 });
      const stats = ecan.getStats();
      expect(typeof stats.totalAttention).toBe('number');
      expect(typeof stats.focusSize).toBe('number');
      expect(typeof stats.entropy).toBe('number');
    });
  });

  describe('deposit / getAttentionBank', () => {
    it('increases the attention bank after deposit', () => {
      const before = ecan.getAttentionBank();
      ecan.deposit(100);
      expect(ecan.getAttentionBank()).toBe(before + 100);
    });
  });

  describe('step', () => {
    it('runs one attention step without throwing', () => {
      as.addNode('ConceptNode', 'Step', {}, { sti: 0.8 });
      expect(() => ecan.step()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('stops auto-update and disposes cleanly', () => {
      const ecanAuto = createECAN(as, { autoUpdate: false });
      expect(() => ecanAuto.dispose()).not.toThrow();
    });
  });
});

describe('RelevanceRealization', () => {
  it('returns a relevance map for context atoms', () => {
    const as = createAtomSpace();
    const ecan = createECAN(as);
    const rr = createRelevanceRealization(ecan, as);

    const a = as.addNode('ConceptNode', 'ContextA');
    const b = as.addNode('ConceptNode', 'Related');
    as.addLink('AssociativeLink', [a.id, b.id]);

    const scores = rr.realizeRelevance([a.id]);
    expect(scores.has(a.id)).toBe(true);
  });

  it('getMostRelevant returns up to limit atoms', () => {
    const as = createAtomSpace();
    const ecan = createECAN(as);
    const rr = createRelevanceRealization(ecan, as);

    const a = as.addNode('ConceptNode', 'Anchor');
    for (let i = 0; i < 5; i++) {
      const x = as.addNode('ConceptNode', `Node${i}`);
      as.addLink('AssociativeLink', [a.id, x.id]);
    }

    const top = rr.getMostRelevant([a.id], 3);
    expect(top.length).toBeLessThanOrEqual(3);
  });
});
