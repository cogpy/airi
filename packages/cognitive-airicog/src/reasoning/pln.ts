/**
 * AiriCog Probabilistic Logic Networks (PLN)
 *
 * Implements uncertain reasoning inspired by OpenCog's PLN.
 * Provides inference rules for combining and deriving truth values.
 */

import type { AtomSpace } from '../atomspace/atomspace';
import type { Atom, Link, LinkType, Node, TruthValue } from '../atomspace/types';
import { reviseTruthValues } from '../atomspace/types';

/**
 * Inference rule types supported by PLN
 */
export type InferenceRuleType =
  | 'deduction'      // A->B, B->C => A->C
  | 'induction'      // A->B, A->C => B->C (with low confidence)
  | 'abduction'      // A->B, C->B => A->C (with low confidence)
  | 'revision'       // Combine multiple truth values
  | 'modus_ponens'   // A, A->B => B
  | 'inheritance'    // Derive properties from parent concepts
  | 'similarity'     // Bidirectional similarity reasoning
  | 'analogy';       // A~B, A->C => B->C

/**
 * Inference result
 */
export interface InferenceResult {
  /** Type of inference rule applied */
  rule: InferenceRuleType;
  /** Premises used in the inference */
  premises: string[]; // Atom IDs
  /** Conclusion atom */
  conclusion: Atom;
  /** Trail of reasoning steps */
  trail: InferenceStep[];
}

/**
 * Single inference step
 */
export interface InferenceStep {
  rule: InferenceRuleType;
  inputs: string[];
  output: string;
  truthValue: TruthValue;
}

/**
 * PLN inference configuration
 */
export interface PLNConfig {
  /** Maximum inference depth */
  maxDepth: number;
  /** Minimum confidence to continue inference */
  minConfidence: number;
  /** Minimum strength to continue inference */
  minStrength: number;
  /** Enable caching of intermediate results */
  enableCache: boolean;
}

/**
 * Probabilistic Logic Networks inference engine
 */
export class PLN {
  private atomSpace: AtomSpace;
  private config: PLNConfig;
  private inferenceCache: Map<string, InferenceResult[]> = new Map();

  constructor(atomSpace: AtomSpace, config?: Partial<PLNConfig>) {
    this.atomSpace = atomSpace;
    this.config = {
      maxDepth: config?.maxDepth ?? 5,
      minConfidence: config?.minConfidence ?? 0.1,
      minStrength: config?.minStrength ?? 0.1,
      enableCache: config?.enableCache ?? true,
    };
  }

  /**
   * Perform deductive inference: A->B, B->C => A->C
   */
  deduction(
    abLinkId: string,
    bcLinkId: string
  ): InferenceResult | null {
    const abLink = this.atomSpace.getAtom(abLinkId) as Link;
    const bcLink = this.atomSpace.getAtom(bcLinkId) as Link;

    if (!abLink || !bcLink) return null;
    if (abLink.kind !== 'link' || bcLink.kind !== 'link') return null;
    if (abLink.outgoing.length < 2 || bcLink.outgoing.length < 2) return null;

    // Check if B matches
    const b1 = abLink.outgoing[1];
    const b2 = bcLink.outgoing[0];
    if (b1 !== b2) return null;

    const a = abLink.outgoing[0];
    const c = bcLink.outgoing[1];

    // Calculate deduction truth value
    // P(A->C) = P(A->B) * P(B->C)
    const tvAB = abLink.truthValue;
    const tvBC = bcLink.truthValue;

    const strength = tvAB.strength * tvBC.strength;
    const confidence = tvAB.confidence * tvBC.confidence * 0.9; // Slightly reduce confidence

    if (strength < this.config.minStrength || confidence < this.config.minConfidence) {
      return null;
    }

    // Create the conclusion link
    const conclusion = this.atomSpace.addLink(
      abLink.type,
      [a, c],
      { strength, confidence }
    );

    return {
      rule: 'deduction',
      premises: [abLinkId, bcLinkId],
      conclusion,
      trail: [{
        rule: 'deduction',
        inputs: [abLinkId, bcLinkId],
        output: conclusion.id,
        truthValue: { strength, confidence },
      }],
    };
  }

  /**
   * Perform modus ponens: A, A->B => B
   */
  modusPonens(
    aAtomId: string,
    abLinkId: string
  ): InferenceResult | null {
    const aAtom = this.atomSpace.getAtom(aAtomId);
    const abLink = this.atomSpace.getAtom(abLinkId) as Link;

    if (!aAtom || !abLink) return null;
    if (abLink.kind !== 'link') return null;
    if (abLink.outgoing[0] !== aAtomId) return null;

    const bAtomId = abLink.outgoing[1];
    const bAtom = this.atomSpace.getAtom(bAtomId);

    if (!bAtom) return null;

    // Calculate modus ponens truth value
    const tvA = aAtom.truthValue;
    const tvAB = abLink.truthValue;

    const strength = tvA.strength * tvAB.strength;
    const confidence = tvA.confidence * tvAB.confidence;

    if (strength < this.config.minStrength || confidence < this.config.minConfidence) {
      return null;
    }

    // Update B's truth value
    const updatedTV = reviseTruthValues(bAtom.truthValue, { strength, confidence });
    bAtom.truthValue = updatedTV;

    return {
      rule: 'modus_ponens',
      premises: [aAtomId, abLinkId],
      conclusion: bAtom,
      trail: [{
        rule: 'modus_ponens',
        inputs: [aAtomId, abLinkId],
        output: bAtomId,
        truthValue: updatedTV,
      }],
    };
  }

  /**
   * Perform inductive inference: A->B, A->C => B->C (with low confidence)
   */
  induction(
    abLinkId: string,
    acLinkId: string
  ): InferenceResult | null {
    const abLink = this.atomSpace.getAtom(abLinkId) as Link;
    const acLink = this.atomSpace.getAtom(acLinkId) as Link;

    if (!abLink || !acLink) return null;
    if (abLink.kind !== 'link' || acLink.kind !== 'link') return null;

    // Check if A matches
    if (abLink.outgoing[0] !== acLink.outgoing[0]) return null;

    const b = abLink.outgoing[1];
    const c = acLink.outgoing[1];

    // Induction has much lower confidence
    const strength = abLink.truthValue.strength * acLink.truthValue.strength;
    const confidence = abLink.truthValue.confidence * acLink.truthValue.confidence * 0.3;

    if (confidence < this.config.minConfidence) return null;

    const conclusion = this.atomSpace.addLink(
      'SimilarityLink', // Induction produces similarity
      [b, c],
      { strength, confidence }
    );

    return {
      rule: 'induction',
      premises: [abLinkId, acLinkId],
      conclusion,
      trail: [{
        rule: 'induction',
        inputs: [abLinkId, acLinkId],
        output: conclusion.id,
        truthValue: { strength, confidence },
      }],
    };
  }

  /**
   * Perform abductive inference: A->B, C->B => A~C (with low confidence)
   */
  abduction(
    abLinkId: string,
    cbLinkId: string
  ): InferenceResult | null {
    const abLink = this.atomSpace.getAtom(abLinkId) as Link;
    const cbLink = this.atomSpace.getAtom(cbLinkId) as Link;

    if (!abLink || !cbLink) return null;
    if (abLink.kind !== 'link' || cbLink.kind !== 'link') return null;

    // Check if B matches
    if (abLink.outgoing[1] !== cbLink.outgoing[1]) return null;

    const a = abLink.outgoing[0];
    const c = cbLink.outgoing[0];

    // Abduction has low confidence
    const strength = abLink.truthValue.strength * cbLink.truthValue.strength;
    const confidence = abLink.truthValue.confidence * cbLink.truthValue.confidence * 0.2;

    if (confidence < this.config.minConfidence) return null;

    const conclusion = this.atomSpace.addLink(
      'SimilarityLink',
      [a, c],
      { strength, confidence }
    );

    return {
      rule: 'abduction',
      premises: [abLinkId, cbLinkId],
      conclusion,
      trail: [{
        rule: 'abduction',
        inputs: [abLinkId, cbLinkId],
        output: conclusion.id,
        truthValue: { strength, confidence },
      }],
    };
  }

  /**
   * Perform similarity-based analogy: A~B, A->C => B->C
   */
  analogy(
    abSimilarityId: string,
    acLinkId: string
  ): InferenceResult | null {
    const abSimilarity = this.atomSpace.getAtom(abSimilarityId) as Link;
    const acLink = this.atomSpace.getAtom(acLinkId) as Link;

    if (!abSimilarity || !acLink) return null;
    if (abSimilarity.type !== 'SimilarityLink') return null;

    // Find A and B from similarity
    const [x, y] = abSimilarity.outgoing;
    const a = acLink.outgoing[0];
    const c = acLink.outgoing[1];

    // Determine which is B (the other one from similarity)
    let b: string;
    if (x === a) {
      b = y;
    } else if (y === a) {
      b = x;
    } else {
      return null;
    }

    // Analogy formula
    const strength =
      abSimilarity.truthValue.strength * acLink.truthValue.strength;
    const confidence =
      abSimilarity.truthValue.confidence * acLink.truthValue.confidence * 0.6;

    if (strength < this.config.minStrength || confidence < this.config.minConfidence) {
      return null;
    }

    const conclusion = this.atomSpace.addLink(
      acLink.type,
      [b, c],
      { strength, confidence }
    );

    return {
      rule: 'analogy',
      premises: [abSimilarityId, acLinkId],
      conclusion,
      trail: [{
        rule: 'analogy',
        inputs: [abSimilarityId, acLinkId],
        output: conclusion.id,
        truthValue: { strength, confidence },
      }],
    };
  }

  /**
   * Forward chain from a given atom, discovering new inferences
   */
  forwardChain(startAtomId: string, depth: number = 3): InferenceResult[] {
    const results: InferenceResult[] = [];
    const visited = new Set<string>();

    this.forwardChainRecursive(startAtomId, depth, visited, results);

    return results;
  }

  private forwardChainRecursive(
    atomId: string,
    remainingDepth: number,
    visited: Set<string>,
    results: InferenceResult[]
  ): void {
    if (remainingDepth <= 0 || visited.has(atomId)) return;
    visited.add(atomId);

    const atom = this.atomSpace.getAtom(atomId);
    if (!atom) return;

    // Find all links containing this atom
    const connectedLinks = this.atomSpace.query({
      kind: 'link',
    }) as Link[];

    for (const link of connectedLinks) {
      if (!link.outgoing.includes(atomId)) continue;

      // Try to apply deduction with other links
      for (const otherLink of connectedLinks) {
        if (otherLink.id === link.id) continue;

        // Try deduction: link -> otherLink
        const deductionResult = this.deduction(link.id, otherLink.id);
        if (deductionResult) {
          results.push(deductionResult);
          this.forwardChainRecursive(
            deductionResult.conclusion.id,
            remainingDepth - 1,
            visited,
            results
          );
        }
      }
    }
  }

  /**
   * Backward chain to find premises that support a conclusion
   */
  backwardChain(goalAtomId: string, depth: number = 3): InferenceResult[] {
    const results: InferenceResult[] = [];
    const visited = new Set<string>();

    this.backwardChainRecursive(goalAtomId, depth, visited, results);

    return results;
  }

  private backwardChainRecursive(
    goalId: string,
    remainingDepth: number,
    visited: Set<string>,
    results: InferenceResult[]
  ): void {
    if (remainingDepth <= 0 || visited.has(goalId)) return;
    visited.add(goalId);

    const goal = this.atomSpace.getAtom(goalId);
    if (!goal) return;

    if (goal.kind === 'link') {
      const goalLink = goal as Link;
      const [a, c] = goalLink.outgoing;

      // Find intermediate links that could support A->C
      const potentialLinks = this.atomSpace.query({
        kind: 'link',
        linkType: goalLink.type,
      }) as Link[];

      for (const abLink of potentialLinks) {
        if (abLink.outgoing[0] !== a) continue;
        const b = abLink.outgoing[1];

        // Look for B->C
        for (const bcLink of potentialLinks) {
          if (bcLink.outgoing[0] !== b || bcLink.outgoing[1] !== c) continue;

          const result = this.deduction(abLink.id, bcLink.id);
          if (result) {
            results.push(result);
          }
        }
      }
    }
  }

  /**
   * Clear the inference cache
   */
  clearCache(): void {
    this.inferenceCache.clear();
  }
}

/**
 * Create a new PLN instance
 */
export function createPLN(atomSpace: AtomSpace, config?: Partial<PLNConfig>): PLN {
  return new PLN(atomSpace, config);
}

/**
 * Truth value formulas for PLN operations
 */
export const TVFormulas = {
  /**
   * Calculate truth value for negation
   */
  negation(tv: TruthValue): TruthValue {
    return {
      strength: 1 - tv.strength,
      confidence: tv.confidence,
    };
  },

  /**
   * Calculate truth value for conjunction (AND)
   */
  conjunction(tv1: TruthValue, tv2: TruthValue): TruthValue {
    return {
      strength: tv1.strength * tv2.strength,
      confidence: Math.min(tv1.confidence, tv2.confidence),
    };
  },

  /**
   * Calculate truth value for disjunction (OR)
   */
  disjunction(tv1: TruthValue, tv2: TruthValue): TruthValue {
    return {
      strength: tv1.strength + tv2.strength - tv1.strength * tv2.strength,
      confidence: Math.min(tv1.confidence, tv2.confidence),
    };
  },

  /**
   * Calculate truth value for implication
   */
  implication(tvPremise: TruthValue, tvConclusion: TruthValue): TruthValue {
    // P(B|A) approximation
    const s = tvConclusion.strength / Math.max(tvPremise.strength, 0.001);
    return {
      strength: Math.min(1, Math.max(0, s)),
      confidence: tvPremise.confidence * tvConclusion.confidence,
    };
  },
};
