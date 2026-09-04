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
import { createAtomSpace } from './atomspace/atomspace'
import { createECAN, createRelevanceRealization } from './attention/ecan'
import { createOrchestrator } from './orchestration/orchestrator'
import { createPLN } from './reasoning/pln'

export {
  AtomSpace,
  createAtomSpace,
} from './atomspace/atomspace'

export {
  // Types
  type Atom,
  type AtomBase,
  type AtomPattern,
  type AtomSpaceConfig,
  type AtomSpaceStats,
  type AttentionValue,
  // Functions
  boostAttention,
  createDefaultAttentionValue,
  createDefaultTruthValue,
  decayAttention,
  inheritanceTruthValue,
  type Link,
  type LinkType,
  type Node,
  type NodeType,
  reviseTruthValues,
  type SpreadActivationOptions,
  type TruthValue,
} from './atomspace/types'

// Attention - Economic Attention Networks
export {
  createECAN,
  createRelevanceRealization,
  ECAN,
  type ECANConfig,
  type ECANStats,
  type ImportanceSpreadSpec,
  RelevanceRealization,
} from './attention/ecan'

export {
  fromQuanta,
  QUANTA_PER_UNIT,
  quantizeAttention,
  toQuanta,
} from './attention/quanta'

// Ontogenesis - Self-Generating Kernels
export {
  // Types
  type CognitiveGene,
  type CognitiveGenome,
  // Functions
  createDefaultGenes,
  type DevelopmentEvent,
  type DevelopmentStage,
  evaluateFitness,
  type GenerationStats,
  getExpressedGenes,
  getGeneValue,
  initializeKernel,
  isGeneExpressed,
  type KernelCapability,
  type KernelMetrics,
  type OntogenesisConfig,
  type OntogeneticKernel,
  type OntogeneticState,
  reproduce,
  runOntogenesis,
  selfGenerate,
  selfOptimize,
} from './ontogenesis/kernel'

// Orchestration - Multi-Agent Coordination
export {
  type AgentState,
  CognitiveOrchestrator,
  createOrchestrator,
  type KnowledgeShareRequest,
  type OrchestratorConfig,
  type OrchestratorEvent,
  type OrchestratorEventListener,
  type OrchestratorEventType,
} from './orchestration/orchestrator'

// Reasoning - Probabilistic Logic Networks
export {
  createPLN,
  type InferenceResult,
  type InferenceRuleType,
  type InferenceStep,
  PLN,
  type PLNConfig,
  TVFormulas,
} from './reasoning/pln'

/**
 * Create a complete AiriCog cognitive system
 */
export function createAiriCog(config?: {
  name?: string
  enableAttentionDecay?: boolean
  enableAutoUpdate?: boolean
  maxAgents?: number
}) {
  const atomSpace = createAtomSpace({
    name: config?.name ?? 'airicog',
    enableAttentionDecay: config?.enableAttentionDecay ?? false,
  })

  const ecan = createECAN(atomSpace, {
    autoUpdate: config?.enableAutoUpdate ?? false,
  })

  const pln = createPLN(atomSpace)

  const relevance = createRelevanceRealization(ecan, atomSpace)

  const orchestrator = createOrchestrator({
    maxAgents: config?.maxAgents ?? 100,
    enableSharedKB: true,
  })

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
      ecan.dispose()
      atomSpace.dispose()
      orchestrator.dispose()
    },
  }
}

/**
 * AiriCog version
 */
export const AIRICOG_VERSION = '0.8.0-alpha.4'

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
}
