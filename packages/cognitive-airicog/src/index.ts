/**
 * AiriCog - OpenCog-inspired Cognitive Architecture for AIRI
 *
 * AiriCog provides a comprehensive cognitive architecture featuring:
 * - AtomSpace: Hypergraph-based knowledge representation
 * - ECAN: Economic Attention Networks for cognitive resource allocation
 * - PLN: Probabilistic Logic Networks for uncertain reasoning
 * - Orchestration: Multi-agent cognitive coordination
 * - Ontogenesis: Self-generating, evolving cognitive kernels
 *
 * Inspired by OpenCog (https://opencog.org) and adapted for the AIRI project.
 *
 * @packageDocumentation
 */

// AtomSpace - Knowledge Representation
export {
  AtomSpace,
  createAtomSpace,
} from './atomspace/atomspace';

export {
  // Types
  type Atom,
  type AtomBase,
  type AtomPattern,
  type AtomSpaceConfig,
  type AtomSpaceStats,
  type AttentionValue,
  type Link,
  type LinkType,
  type Node,
  type NodeType,
  type SpreadActivationOptions,
  type TruthValue,
  // Functions
  boostAttention,
  createDefaultAttentionValue,
  createDefaultTruthValue,
  decayAttention,
  inheritanceTruthValue,
  reviseTruthValues,
} from './atomspace/types';

// Attention - Economic Attention Networks
export {
  ECAN,
  createECAN,
  createRelevanceRealization,
  RelevanceRealization,
  type ECANConfig,
  type ECANStats,
  type ImportanceSpreadSpec,
} from './attention/ecan';

// Reasoning - Probabilistic Logic Networks
export {
  PLN,
  createPLN,
  TVFormulas,
  type InferenceResult,
  type InferenceRuleType,
  type InferenceStep,
  type PLNConfig,
} from './reasoning/pln';

// Orchestration - Multi-Agent Coordination
export {
  CognitiveOrchestrator,
  createOrchestrator,
  type AgentState,
  type KnowledgeShareRequest,
  type OrchestratorConfig,
  type OrchestratorEvent,
  type OrchestratorEventListener,
  type OrchestratorEventType,
} from './orchestration/orchestrator';

// Ontogenesis - Self-Generating Kernels
export {
  // Types
  type CognitiveGene,
  type CognitiveGenome,
  type DevelopmentEvent,
  type DevelopmentStage,
  type GenerationStats,
  type KernelCapability,
  type KernelMetrics,
  type OntogeneticKernel,
  type OntogeneticState,
  type OntogenesisConfig,
  // Functions
  createDefaultGenes,
  evaluateFitness,
  getExpressedGenes,
  getGeneValue,
  initializeKernel,
  isGeneExpressed,
  reproduce,
  runOntogenesis,
  selfGenerate,
  selfOptimize,
} from './ontogenesis/kernel';

/**
 * Create a complete AiriCog cognitive system
 */
export function createAiriCog(config?: {
  name?: string;
  enableAttentionDecay?: boolean;
  enableAutoUpdate?: boolean;
  maxAgents?: number;
}) {
  const { createAtomSpace } = require('./atomspace/atomspace');
  const { createECAN, createRelevanceRealization } = require('./attention/ecan');
  const { createPLN } = require('./reasoning/pln');
  const { createOrchestrator } = require('./orchestration/orchestrator');

  const atomSpace = createAtomSpace({
    name: config?.name ?? 'airicog',
    enableAttentionDecay: config?.enableAttentionDecay ?? false,
  });

  const ecan = createECAN(atomSpace, {
    autoUpdate: config?.enableAutoUpdate ?? false,
  });

  const pln = createPLN(atomSpace);

  const relevance = createRelevanceRealization(ecan, atomSpace);

  const orchestrator = createOrchestrator({
    maxAgents: config?.maxAgents ?? 100,
    enableSharedKB: true,
  });

  return {
    atomSpace,
    ecan,
    pln,
    relevance,
    orchestrator,

    /**
     * Dispose all resources
     */
    dispose() {
      ecan.dispose();
      atomSpace.dispose();
      orchestrator.dispose();
    },
  };
}

/**
 * AiriCog version
 */
export const AIRICOG_VERSION = '0.8.0-alpha.4';

/**
 * Package information
 */
export const AIRICOG_INFO = {
  name: 'AiriCog',
  description: 'OpenCog-inspired cognitive architecture for AIRI',
  version: AIRICOG_VERSION,
  repository: 'https://github.com/moeru-ai/airi',
  license: 'MIT',
  inspired_by: 'OpenCog (https://opencog.org)',
};
