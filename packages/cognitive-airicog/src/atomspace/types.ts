/**
 * AiriCog Atom Types
 *
 * Core type definitions for the OpenCog-inspired cognitive architecture.
 * Atoms are the fundamental units of knowledge representation in the AtomSpace.
 */

/**
 * Truth Value represents probabilistic truth in the AtomSpace.
 * Based on OpenCog's Probabilistic Logic Networks (PLN).
 */
export interface TruthValue {
  /** Probability/certainty (0.0 to 1.0) */
  strength: number;
  /** Confidence in the strength value (0.0 to 1.0) */
  confidence: number;
}

/**
 * Attention Value implements cognitive attention allocation.
 * Based on OpenCog's Economic Attention Networks (ECAN).
 */
export interface AttentionValue {
  /** Short-Term Importance (0.0 to 1.0) - current focus */
  sti: number;
  /** Long-Term Importance (0.0 to 1.0) - persistent relevance */
  lti: number;
  /** Very Long-Term Importance (0.0 to 1.0) - core knowledge */
  vlti: number;
}

/**
 * Node Types in the AtomSpace hypergraph
 */
export type NodeType =
  | 'ConceptNode'      // General concepts
  | 'PredicateNode'    // Properties and predicates
  | 'NumberNode'       // Numeric values
  | 'VariableNode'     // Variables for pattern matching
  | 'SchemaNode'       // Procedures/functions
  | 'GroundedSchemaNode' // Executable procedures
  | 'TypeNode'         // Type definitions
  | 'AnchorNode'       // Named anchor points
  | 'AgentNode'        // Cognitive agents
  | 'ActionNode'       // Actions/behaviors
  | 'GoalNode'         // Goals and objectives
  | 'EmotionNode'      // Emotional states
  | 'PersonaNode';     // Character personas

/**
 * Link Types in the AtomSpace hypergraph
 */
export type LinkType =
  | 'InheritanceLink'   // Is-a relationships
  | 'SimilarityLink'    // Similarity relationships
  | 'EvaluationLink'    // Evaluations and assessments
  | 'ExecutionLink'     // Execution/action relationships
  | 'StateLink'         // State tracking
  | 'ContextLink'       // Contextual relationships
  | 'MemberLink'        // Set membership
  | 'ListLink'          // Ordered lists
  | 'SetLink'           // Unordered sets
  | 'AndLink'           // Logical AND
  | 'OrLink'            // Logical OR
  | 'NotLink'           // Logical NOT
  | 'ImplicationLink'   // Logical implication
  | 'EquivalenceLink'   // Logical equivalence
  | 'BindLink'          // Pattern binding
  | 'GetLink'           // Query/retrieval
  | 'PutLink'           // Substitution
  | 'AssociativeLink'   // General associations
  | 'CausalLink'        // Causal relationships
  | 'TemporalLink'      // Temporal ordering
  | 'AttentionLink';    // Attention flow

/**
 * Base interface for all Atoms
 */
export interface AtomBase {
  /** Unique identifier */
  id: string;
  /** Truth value for probabilistic reasoning */
  truthValue: TruthValue;
  /** Attention value for cognitive resource allocation */
  attentionValue: AttentionValue;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccessedAt: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Node Atom - represents concepts, values, and entities
 */
export interface Node extends AtomBase {
  kind: 'node';
  /** Type of the node */
  type: NodeType;
  /** Name/value of the node */
  name: string;
}

/**
 * Link Atom - represents relationships between atoms
 */
export interface Link extends AtomBase {
  kind: 'link';
  /** Type of the link */
  type: LinkType;
  /** Outgoing atoms (targets of the link) */
  outgoing: string[]; // Atom IDs
}

/**
 * Union type for all atoms
 */
export type Atom = Node | Link;

/**
 * Pattern for matching atoms in queries
 */
export interface AtomPattern {
  /** Match by atom ID */
  id?: string;
  /** Match by kind (node or link) */
  kind?: 'node' | 'link';
  /** Match by node type */
  nodeType?: NodeType | NodeType[];
  /** Match by link type */
  linkType?: LinkType | LinkType[];
  /** Match by name (supports wildcards with *) */
  name?: string;
  /** Match by truth value range */
  truthValue?: {
    minStrength?: number;
    maxStrength?: number;
    minConfidence?: number;
    maxConfidence?: number;
  };
  /** Match by attention value range */
  attentionValue?: {
    minSti?: number;
    maxSti?: number;
    minLti?: number;
    maxLti?: number;
  };
  /** Match by outgoing atom IDs */
  outgoing?: string[];
  /** Match by metadata properties */
  metadata?: Record<string, unknown>;
}

/**
 * Options for spreading activation through the AtomSpace
 */
export interface SpreadActivationOptions {
  /** Initial activation intensity */
  intensity: number;
  /** Decay factor per hop (0.0 to 1.0) */
  decay: number;
  /** Maximum number of hops */
  maxHops: number;
  /** Link types to follow */
  followLinks?: LinkType[];
  /** Minimum STI to continue spreading */
  minSti?: number;
}

/**
 * Statistics about the AtomSpace
 */
export interface AtomSpaceStats {
  /** Total number of atoms */
  totalAtoms: number;
  /** Number of nodes */
  nodeCount: number;
  /** Number of links */
  linkCount: number;
  /** Breakdown by node type */
  nodesByType: Record<NodeType, number>;
  /** Breakdown by link type */
  linksByType: Record<LinkType, number>;
  /** Average truth value strength */
  avgStrength: number;
  /** Average attention STI */
  avgSti: number;
}

/**
 * Configuration for the AtomSpace
 */
export interface AtomSpaceConfig {
  /** Name/identifier for this AtomSpace */
  name?: string;
  /** Enable attention decay over time */
  enableAttentionDecay?: boolean;
  /** Attention decay rate per second */
  attentionDecayRate?: number;
  /** Maximum number of atoms to keep in active memory */
  maxActiveAtoms?: number;
  /** Forgetting threshold (atoms below this STI may be archived) */
  forgettingThreshold?: number;
}

/**
 * Create default truth value
 */
export function createDefaultTruthValue(): TruthValue {
  return { strength: 1.0, confidence: 0.9 };
}

/**
 * Create default attention value
 */
export function createDefaultAttentionValue(): AttentionValue {
  return { sti: 0.5, lti: 0.3, vlti: 0.1 };
}

/**
 * Combine two truth values using revision rule
 */
export function reviseTruthValues(tv1: TruthValue, tv2: TruthValue): TruthValue {
  // PLN revision formula
  const c1 = tv1.confidence;
  const c2 = tv2.confidence;
  const totalConfidence = c1 + c2 - c1 * c2;

  if (totalConfidence === 0) {
    return { strength: 0.5, confidence: 0 };
  }

  const revisedStrength = (tv1.strength * c1 + tv2.strength * c2 - tv1.strength * tv2.strength * c1 * c2) / totalConfidence;

  return {
    strength: Math.max(0, Math.min(1, revisedStrength)),
    confidence: Math.max(0, Math.min(1, totalConfidence)),
  };
}

/**
 * Calculate truth value for inheritance (A inherits from B)
 */
export function inheritanceTruthValue(parentTV: TruthValue, childTV: TruthValue): TruthValue {
  return {
    strength: parentTV.strength * childTV.strength,
    confidence: parentTV.confidence * childTV.confidence,
  };
}

/**
 * Boost attention value
 */
export function boostAttention(av: AttentionValue, boost: number): AttentionValue {
  return {
    sti: Math.min(1, av.sti + boost),
    lti: Math.min(1, av.lti + boost * 0.5),
    vlti: av.vlti, // VLTI is more stable
  };
}

/**
 * Decay attention value over time
 */
export function decayAttention(av: AttentionValue, decayRate: number): AttentionValue {
  return {
    sti: Math.max(0, av.sti * (1 - decayRate)),
    lti: Math.max(0, av.lti * (1 - decayRate * 0.5)),
    vlti: av.vlti, // VLTI doesn't decay
  };
}
