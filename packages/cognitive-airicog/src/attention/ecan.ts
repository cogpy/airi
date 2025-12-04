/**
 * AiriCog Economic Attention Networks (ECAN)
 *
 * Implements attention allocation inspired by OpenCog's ECAN system.
 * Manages cognitive resources by distributing attention across the AtomSpace.
 */

import type { AtomSpace } from '../atomspace/atomspace';
import type { Atom, AttentionValue, Link, LinkType } from '../atomspace/types';

/**
 * ECAN Configuration
 */
export interface ECANConfig {
  /** Total attention funds available in the system */
  attentionFunds: number;
  /** Rate at which attention is taxed from all atoms */
  taxRate: number;
  /** Minimum STI for an atom to be in the attentional focus */
  attentionalFocusThreshold: number;
  /** Maximum size of the attentional focus */
  attentionalFocusSize: number;
  /** Rate of spreading activation */
  spreadingRate: number;
  /** Decay factor for spreading */
  spreadingDecay: number;
  /** Importance diffusion amount per step */
  diffusionAmount: number;
  /** Wage paid to atoms for being accessed */
  accessWage: number;
  /** Enable automatic attention updates */
  autoUpdate: boolean;
  /** Update interval in milliseconds */
  updateInterval: number;
}

/**
 * ECAN Statistics
 */
export interface ECANStats {
  /** Total attention in the system */
  totalAttention: number;
  /** Number of atoms in attentional focus */
  focusSize: number;
  /** Average STI in the focus */
  avgFocusSti: number;
  /** Average STI outside focus */
  avgNonFocusSti: number;
  /** Attention distribution entropy */
  entropy: number;
}

/**
 * Importance spreading specification
 */
export interface ImportanceSpreadSpec {
  /** Source atom ID */
  sourceId: string;
  /** Amount to spread */
  amount: number;
  /** Link types to follow */
  linkTypes?: LinkType[];
  /** Maximum hops */
  maxHops?: number;
}

/**
 * Economic Attention Network Manager
 */
export class ECAN {
  private atomSpace: AtomSpace;
  private config: ECANConfig;
  private updateTimer?: ReturnType<typeof setInterval>;
  private attentionBank: number;

  constructor(atomSpace: AtomSpace, config?: Partial<ECANConfig>) {
    this.atomSpace = atomSpace;
    this.config = {
      attentionFunds: config?.attentionFunds ?? 1000,
      taxRate: config?.taxRate ?? 0.01,
      attentionalFocusThreshold: config?.attentionalFocusThreshold ?? 0.5,
      attentionalFocusSize: config?.attentionalFocusSize ?? 100,
      spreadingRate: config?.spreadingRate ?? 0.1,
      spreadingDecay: config?.spreadingDecay ?? 0.6,
      diffusionAmount: config?.diffusionAmount ?? 0.05,
      accessWage: config?.accessWage ?? 0.02,
      autoUpdate: config?.autoUpdate ?? false,
      updateInterval: config?.updateInterval ?? 100,
    };
    this.attentionBank = this.config.attentionFunds;

    if (this.config.autoUpdate) {
      this.startAutoUpdate();
    }
  }

  /**
   * Get the attentional focus (atoms with highest STI)
   */
  getAttentionalFocus(): Atom[] {
    return this.atomSpace.getAttentionalFocus(this.config.attentionalFocusSize);
  }

  /**
   * Check if an atom is in the attentional focus
   */
  isInFocus(atomId: string): boolean {
    const atom = this.atomSpace.getAtom(atomId);
    if (!atom) return false;
    return atom.attentionValue.sti >= this.config.attentionalFocusThreshold;
  }

  /**
   * Stimulate an atom (increase its STI)
   */
  stimulate(atomId: string, amount: number = 0.1): void {
    const atom = this.atomSpace.getAtom(atomId);
    if (!atom) return;

    // Pay from attention bank
    const actualAmount = Math.min(amount, this.attentionBank);
    this.attentionBank -= actualAmount;

    atom.attentionValue.sti = Math.min(1, atom.attentionValue.sti + actualAmount);

    // Update LTI based on accumulated stimulation
    atom.attentionValue.lti = Math.min(
      1,
      atom.attentionValue.lti + actualAmount * 0.1
    );
  }

  /**
   * Inhibit an atom (decrease its STI)
   */
  inhibit(atomId: string, amount: number = 0.1): void {
    const atom = this.atomSpace.getAtom(atomId);
    if (!atom) return;

    // Return to attention bank
    const actualAmount = Math.min(amount, atom.attentionValue.sti);
    this.attentionBank += actualAmount;

    atom.attentionValue.sti = Math.max(0, atom.attentionValue.sti - actualAmount);
  }

  /**
   * Spread importance from a source atom to connected atoms
   */
  spreadImportance(spec: ImportanceSpreadSpec): void {
    const { sourceId, amount, linkTypes, maxHops = 3 } = spec;

    this.atomSpace.spreadActivation(sourceId, {
      intensity: amount,
      decay: this.config.spreadingDecay,
      maxHops,
      followLinks: linkTypes,
      minSti: 0.01,
    });
  }

  /**
   * Run one attention allocation step
   */
  step(): void {
    this.collectTax();
    this.diffuseImportance();
    this.updateLTI();
    this.payAccessWages();
  }

  /**
   * Collect attention tax from all atoms
   */
  private collectTax(): void {
    const focus = this.getAttentionalFocus();

    for (const atom of focus) {
      const tax = atom.attentionValue.sti * this.config.taxRate;
      atom.attentionValue.sti -= tax;
      this.attentionBank += tax;
    }
  }

  /**
   * Diffuse importance between connected atoms
   */
  private diffuseImportance(): void {
    const focus = this.getAttentionalFocus();

    for (const atom of focus) {
      if (atom.kind === 'link') {
        const link = atom as Link;
        const diffuseAmount = atom.attentionValue.sti * this.config.diffusionAmount;

        // Diffuse to outgoing atoms
        const sharePerAtom = diffuseAmount / link.outgoing.length;
        for (const targetId of link.outgoing) {
          const target = this.atomSpace.getAtom(targetId);
          if (target) {
            target.attentionValue.sti = Math.min(
              1,
              target.attentionValue.sti + sharePerAtom
            );
          }
        }

        // Reduce source STI
        atom.attentionValue.sti -= diffuseAmount;
      }
    }
  }

  /**
   * Update Long-Term Importance based on access patterns
   */
  private updateLTI(): void {
    const now = Date.now();
    const focus = this.getAttentionalFocus();

    for (const atom of focus) {
      // Increase LTI for recently accessed atoms
      const timeSinceAccess = now - atom.lastAccessedAt;
      if (timeSinceAccess < 1000) {
        // Accessed in last second
        atom.attentionValue.lti = Math.min(
          1,
          atom.attentionValue.lti + 0.01
        );
      }

      // Gradually increase VLTI for high LTI atoms
      if (atom.attentionValue.lti > 0.8) {
        atom.attentionValue.vlti = Math.min(
          1,
          atom.attentionValue.vlti + 0.001
        );
      }
    }
  }

  /**
   * Pay wages to recently accessed atoms
   */
  private payAccessWages(): void {
    const now = Date.now();
    const focus = this.getAttentionalFocus();

    for (const atom of focus) {
      const timeSinceAccess = now - atom.lastAccessedAt;
      if (timeSinceAccess < 100 && this.attentionBank > this.config.accessWage) {
        // Pay wage for being accessed
        this.attentionBank -= this.config.accessWage;
        atom.attentionValue.sti = Math.min(
          1,
          atom.attentionValue.sti + this.config.accessWage
        );
      }
    }
  }

  /**
   * Get ECAN statistics
   */
  getStats(): ECANStats {
    const focus = this.getAttentionalFocus();
    const allAtoms = this.atomSpace.query({});

    let totalAttention = 0;
    let focusStiSum = 0;
    let nonFocusStiSum = 0;
    let nonFocusCount = 0;

    for (const atom of allAtoms) {
      totalAttention += atom.attentionValue.sti;

      if (this.isInFocus(atom.id)) {
        focusStiSum += atom.attentionValue.sti;
      } else {
        nonFocusStiSum += atom.attentionValue.sti;
        nonFocusCount++;
      }
    }

    // Calculate entropy
    let entropy = 0;
    if (totalAttention > 0) {
      for (const atom of allAtoms) {
        const p = atom.attentionValue.sti / totalAttention;
        if (p > 0) {
          entropy -= p * Math.log2(p);
        }
      }
    }

    return {
      totalAttention,
      focusSize: focus.length,
      avgFocusSti: focus.length > 0 ? focusStiSum / focus.length : 0,
      avgNonFocusSti: nonFocusCount > 0 ? nonFocusStiSum / nonFocusCount : 0,
      entropy,
    };
  }

  /**
   * Get current attention bank balance
   */
  getAttentionBank(): number {
    return this.attentionBank;
  }

  /**
   * Deposit attention funds
   */
  deposit(amount: number): void {
    this.attentionBank += amount;
  }

  /**
   * Start automatic attention updates
   */
  private startAutoUpdate(): void {
    this.updateTimer = setInterval(() => {
      this.step();
    }, this.config.updateInterval);
  }

  /**
   * Stop automatic attention updates
   */
  stopAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  /**
   * Dispose of ECAN and clean up resources
   */
  dispose(): void {
    this.stopAutoUpdate();
  }
}

/**
 * Create a new ECAN instance
 */
export function createECAN(atomSpace: AtomSpace, config?: Partial<ECANConfig>): ECAN {
  return new ECAN(atomSpace, config);
}

/**
 * Relevance realization - determine what's important in context
 * Inspired by John Vervaeke's cognitive science framework
 */
export class RelevanceRealization {
  private ecan: ECAN;
  private atomSpace: AtomSpace;

  constructor(ecan: ECAN, atomSpace: AtomSpace) {
    this.ecan = ecan;
    this.atomSpace = atomSpace;
  }

  /**
   * Determine relevance of atoms to a given context
   */
  realizeRelevance(
    contextAtomIds: string[],
    queryPattern?: { nodeType?: string; linkType?: string }
  ): Map<string, number> {
    const relevanceScores = new Map<string, number>();

    // Spread activation from context atoms
    for (const contextId of contextAtomIds) {
      const activation = this.atomSpace.spreadActivation(contextId, {
        intensity: 0.5,
        decay: 0.7,
        maxHops: 5,
        minSti: 0.05,
      });

      // Accumulate relevance scores
      for (const [atomId, level] of activation) {
        const current = relevanceScores.get(atomId) ?? 0;
        relevanceScores.set(atomId, current + level);
      }
    }

    // Normalize scores
    const maxScore = Math.max(...relevanceScores.values(), 0.001);
    for (const [atomId, score] of relevanceScores) {
      relevanceScores.set(atomId, score / maxScore);
    }

    // Stimulate highly relevant atoms
    for (const [atomId, score] of relevanceScores) {
      if (score > 0.5) {
        this.ecan.stimulate(atomId, score * 0.1);
      }
    }

    return relevanceScores;
  }

  /**
   * Get the most relevant atoms for a context
   */
  getMostRelevant(contextAtomIds: string[], limit: number = 10): Atom[] {
    const scores = this.realizeRelevance(contextAtomIds);
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

    const results: Atom[] = [];
    for (const [atomId] of sorted.slice(0, limit)) {
      const atom = this.atomSpace.getAtom(atomId);
      if (atom) {
        results.push(atom);
      }
    }

    return results;
  }
}

/**
 * Create a RelevanceRealization instance
 */
export function createRelevanceRealization(
  ecan: ECAN,
  atomSpace: AtomSpace
): RelevanceRealization {
  return new RelevanceRealization(ecan, atomSpace);
}
