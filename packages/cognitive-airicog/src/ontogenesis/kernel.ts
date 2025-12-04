/**
 * AiriCog Ontogenesis - Self-Generating Cognitive Kernels
 *
 * Implements self-generating, evolving cognitive kernels inspired by
 * OpenCog's ontogenetic development and the AIRI ontogenesis framework.
 */

import type { AtomSpace } from '../atomspace/atomspace';
import type { TruthValue, AttentionValue } from '../atomspace/types';

/**
 * Cognitive gene representing a trait
 */
export interface CognitiveGene {
  /** Gene identifier */
  id: string;
  /** Gene type */
  type: 'trait' | 'behavior' | 'skill' | 'constraint';
  /** Gene value (0.0 to 1.0) */
  value: number;
  /** Whether this gene can mutate */
  mutable: boolean;
  /** Expression threshold */
  threshold: number;
}

/**
 * Cognitive genome - the "DNA" of a kernel
 */
export interface CognitiveGenome {
  /** Unique genome identifier */
  id: string;
  /** Generation number */
  generation: number;
  /** Parent genome IDs */
  lineage: string[];
  /** Cognitive genes */
  genes: CognitiveGene[];
  /** Overall fitness score */
  fitness: number;
  /** Age in iterations */
  age: number;
}

/**
 * Development stages for ontogenetic kernels
 */
export type DevelopmentStage =
  | 'embryonic'   // Just generated, basic structure
  | 'juvenile'    // Developing, learning
  | 'mature'      // Fully developed, can reproduce
  | 'senescent';  // Declining, ready for replacement

/**
 * Ontogenetic state tracking
 */
export interface OntogeneticState {
  /** Current development stage */
  stage: DevelopmentStage;
  /** Maturity level (0.0 to 1.0) */
  maturity: number;
  /** Development events history */
  events: DevelopmentEvent[];
  /** Cognitive energy available */
  energy: number;
}

/**
 * Development event
 */
export interface DevelopmentEvent {
  /** Event type */
  type: 'birth' | 'mutation' | 'learning' | 'reproduction' | 'death';
  /** Timestamp */
  timestamp: number;
  /** Event data */
  data: Record<string, unknown>;
}

/**
 * Ontogenetic Kernel - self-evolving cognitive unit
 */
export interface OntogeneticKernel {
  /** Kernel identifier */
  id: string;
  /** Cognitive genome */
  genome: CognitiveGenome;
  /** Ontogenetic state */
  state: OntogeneticState;
  /** Associated AtomSpace */
  atomSpace?: AtomSpace;
  /** Kernel capabilities */
  capabilities: KernelCapability[];
  /** Performance metrics */
  metrics: KernelMetrics;
}

/**
 * Kernel capability
 */
export interface KernelCapability {
  name: string;
  level: number;
  enabled: boolean;
}

/**
 * Kernel performance metrics
 */
export interface KernelMetrics {
  /** Total operations performed */
  operations: number;
  /** Successful operations */
  successes: number;
  /** Failed operations */
  failures: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Knowledge atoms created */
  atomsCreated: number;
}

/**
 * Ontogenesis configuration
 */
export interface OntogenesisConfig {
  /** Evolution parameters */
  evolution: {
    populationSize: number;
    mutationRate: number;
    crossoverRate: number;
    elitismRate: number;
    maxGenerations: number;
    fitnessThreshold: number;
    diversityPressure: number;
  };
  /** Development schedule */
  development: {
    embryonicDuration: number;
    juvenileDuration: number;
    matureDuration: number;
    maturityThreshold: number;
  };
  /** Seed kernels */
  seedKernels?: OntogeneticKernel[];
}

/**
 * Generation statistics
 */
export interface GenerationStats {
  generation: number;
  bestFitness: number;
  averageFitness: number;
  diversity: number;
  population: OntogeneticKernel[];
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `kernel_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create default cognitive genes
 */
export function createDefaultGenes(): CognitiveGene[] {
  return [
    // Core traits
    { id: 'curiosity', type: 'trait', value: 0.7, mutable: true, threshold: 0.5 },
    { id: 'persistence', type: 'trait', value: 0.6, mutable: true, threshold: 0.4 },
    { id: 'adaptability', type: 'trait', value: 0.65, mutable: true, threshold: 0.5 },
    { id: 'creativity', type: 'trait', value: 0.5, mutable: true, threshold: 0.6 },
    { id: 'empathy', type: 'trait', value: 0.75, mutable: true, threshold: 0.5 },

    // Behaviors
    { id: 'exploration', type: 'behavior', value: 0.6, mutable: true, threshold: 0.4 },
    { id: 'exploitation', type: 'behavior', value: 0.5, mutable: true, threshold: 0.4 },
    { id: 'cooperation', type: 'behavior', value: 0.7, mutable: true, threshold: 0.5 },

    // Skills
    { id: 'reasoning', type: 'skill', value: 0.55, mutable: true, threshold: 0.5 },
    { id: 'learning', type: 'skill', value: 0.6, mutable: true, threshold: 0.4 },
    { id: 'communication', type: 'skill', value: 0.65, mutable: true, threshold: 0.5 },

    // Constraints (immutable)
    { id: 'safety', type: 'constraint', value: 0.95, mutable: false, threshold: 0.9 },
    { id: 'authenticity', type: 'constraint', value: 0.9, mutable: false, threshold: 0.85 },
    { id: 'helpfulness', type: 'constraint', value: 0.85, mutable: false, threshold: 0.8 },
  ];
}

/**
 * Initialize an ontogenetic kernel
 */
export function initializeKernel(
  genes?: CognitiveGene[],
  parentIds?: string[]
): OntogeneticKernel {
  const id = generateId();
  const now = Date.now();

  const genome: CognitiveGenome = {
    id: `genome_${id}`,
    generation: parentIds ? 1 : 0,
    lineage: parentIds ?? [],
    genes: genes ?? createDefaultGenes(),
    fitness: 0,
    age: 0,
  };

  const state: OntogeneticState = {
    stage: 'embryonic',
    maturity: 0,
    events: [{
      type: 'birth',
      timestamp: now,
      data: { parentIds },
    }],
    energy: 1.0,
  };

  return {
    id,
    genome,
    state,
    capabilities: [
      { name: 'basic_reasoning', level: 0.5, enabled: true },
      { name: 'knowledge_storage', level: 0.5, enabled: true },
      { name: 'pattern_recognition', level: 0.3, enabled: true },
    ],
    metrics: {
      operations: 0,
      successes: 0,
      failures: 0,
      avgResponseTime: 0,
      atomsCreated: 0,
    },
  };
}

/**
 * Self-generate a new kernel from an existing one
 */
export function selfGenerate(parent: OntogeneticKernel): OntogeneticKernel {
  // Clone and mutate genes
  const newGenes = parent.genome.genes.map(gene => ({
    ...gene,
    value: gene.mutable
      ? Math.max(0, Math.min(1, gene.value + (Math.random() - 0.5) * 0.1))
      : gene.value,
  }));

  const child = initializeKernel(newGenes, [parent.id]);
  child.genome.generation = parent.genome.generation + 1;

  // Inherit some metrics
  child.metrics.avgResponseTime = parent.metrics.avgResponseTime;

  return child;
}

/**
 * Self-optimize a kernel through iterative improvement
 */
export function selfOptimize(
  kernel: OntogeneticKernel,
  iterations: number = 10
): OntogeneticKernel {
  let optimized = { ...kernel };

  for (let i = 0; i < iterations; i++) {
    // Optimize mutable genes based on fitness
    optimized.genome.genes = optimized.genome.genes.map(gene => {
      if (!gene.mutable) return gene;

      // Gradient-based optimization
      const gradient = (optimized.genome.fitness - 0.5) * 0.05;
      return {
        ...gene,
        value: Math.max(0, Math.min(1, gene.value + gradient)),
      };
    });

    // Update maturity
    optimized.state.maturity = Math.min(1, optimized.state.maturity + 0.1);

    // Record development event
    optimized.state.events.push({
      type: 'learning',
      timestamp: Date.now(),
      data: { iteration: i },
    });
  }

  // Update stage based on maturity
  optimized.state.stage = getStageForMaturity(optimized.state.maturity);

  return optimized;
}

/**
 * Reproduce two kernels to create offspring
 */
export function reproduce(
  parent1: OntogeneticKernel,
  parent2: OntogeneticKernel,
  method: 'crossover' | 'mutation' | 'cloning' = 'crossover'
): OntogeneticKernel {
  let childGenes: CognitiveGene[];

  switch (method) {
    case 'crossover': {
      // Single-point crossover
      const crossoverPoint = Math.floor(parent1.genome.genes.length / 2);
      childGenes = [
        ...parent1.genome.genes.slice(0, crossoverPoint),
        ...parent2.genome.genes.slice(crossoverPoint),
      ];
      break;
    }
    case 'mutation': {
      // Take parent1's genes and mutate heavily
      childGenes = parent1.genome.genes.map(gene => ({
        ...gene,
        value: gene.mutable
          ? Math.max(0, Math.min(1, gene.value + (Math.random() - 0.5) * 0.3))
          : gene.value,
      }));
      break;
    }
    case 'cloning':
    default:
      childGenes = [...parent1.genome.genes];
  }

  const child = initializeKernel(childGenes, [parent1.id, parent2.id]);
  child.genome.generation = Math.max(parent1.genome.generation, parent2.genome.generation) + 1;

  child.state.events.push({
    type: 'reproduction',
    timestamp: Date.now(),
    data: { method, parent1Id: parent1.id, parent2Id: parent2.id },
  });

  return child;
}

/**
 * Evaluate kernel fitness
 */
export function evaluateFitness(kernel: OntogeneticKernel): number {
  const genes = kernel.genome.genes;
  const metrics = kernel.metrics;

  // Gene expression score
  const expressionScore = genes.reduce((sum, gene) => {
    return sum + (gene.value >= gene.threshold ? gene.value : 0);
  }, 0) / genes.length;

  // Performance score
  const successRate = metrics.operations > 0
    ? metrics.successes / metrics.operations
    : 0.5;

  // Maturity bonus
  const maturityBonus = kernel.state.maturity * 0.1;

  // Stage penalty for senescent
  const stagePenalty = kernel.state.stage === 'senescent' ? -0.2 : 0;

  // Combined fitness
  const fitness = Math.max(0, Math.min(1,
    expressionScore * 0.4 +
    successRate * 0.4 +
    maturityBonus +
    stagePenalty
  ));

  kernel.genome.fitness = fitness;
  return fitness;
}

/**
 * Run ontogenetic evolution
 */
export function runOntogenesis(config: OntogenesisConfig): GenerationStats[] {
  const generations: GenerationStats[] = [];
  let population: OntogeneticKernel[] = [];

  // Initialize population
  if (config.seedKernels && config.seedKernels.length > 0) {
    population = [...config.seedKernels];
  }

  while (population.length < config.evolution.populationSize) {
    population.push(initializeKernel());
  }

  // Run evolution
  for (let gen = 0; gen < config.evolution.maxGenerations; gen++) {
    // Evaluate fitness
    for (const kernel of population) {
      evaluateFitness(kernel);
      kernel.genome.age++;
    }

    // Sort by fitness
    population.sort((a, b) => b.genome.fitness - a.genome.fitness);

    // Calculate generation stats
    const bestFitness = population[0].genome.fitness;
    const avgFitness = population.reduce((sum, k) => sum + k.genome.fitness, 0) / population.length;
    const diversity = calculateDiversity(population);

    generations.push({
      generation: gen,
      bestFitness,
      averageFitness: avgFitness,
      diversity,
      population: [...population],
    });

    // Check termination condition
    if (bestFitness >= config.evolution.fitnessThreshold) {
      break;
    }

    // Selection and reproduction
    const eliteCount = Math.floor(population.length * config.evolution.elitismRate);
    const newPopulation: OntogeneticKernel[] = population.slice(0, eliteCount);

    while (newPopulation.length < config.evolution.populationSize) {
      const parent1 = selectParent(population);
      const parent2 = selectParent(population);

      let child: OntogeneticKernel;

      if (Math.random() < config.evolution.crossoverRate) {
        child = reproduce(parent1, parent2, 'crossover');
      } else if (Math.random() < config.evolution.mutationRate) {
        child = selfGenerate(parent1);
      } else {
        child = reproduce(parent1, parent2, 'cloning');
      }

      // Apply diversity pressure
      if (Math.random() < config.evolution.diversityPressure) {
        child = selfOptimize(child, 3);
      }

      newPopulation.push(child);
    }

    // Update development stages
    for (const kernel of newPopulation) {
      updateDevelopmentStage(kernel, config.development);
    }

    population = newPopulation;
  }

  return generations;
}

/**
 * Tournament selection
 */
function selectParent(population: OntogeneticKernel[]): OntogeneticKernel {
  const tournamentSize = 3;
  const candidates: OntogeneticKernel[] = [];

  for (let i = 0; i < tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length);
    candidates.push(population[idx]);
  }

  return candidates.reduce((best, curr) =>
    curr.genome.fitness > best.genome.fitness ? curr : best
  );
}

/**
 * Calculate population diversity
 */
function calculateDiversity(population: OntogeneticKernel[]): number {
  if (population.length < 2) return 0;

  let totalDistance = 0;
  let comparisons = 0;

  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      const genes1 = population[i].genome.genes;
      const genes2 = population[j].genome.genes;

      let distance = 0;
      for (let k = 0; k < genes1.length; k++) {
        distance += Math.abs(genes1[k].value - genes2[k].value);
      }
      distance /= genes1.length;

      totalDistance += distance;
      comparisons++;
    }
  }

  return totalDistance / comparisons;
}

/**
 * Update kernel development stage
 */
function updateDevelopmentStage(
  kernel: OntogeneticKernel,
  schedule: OntogenesisConfig['development']
): void {
  const age = kernel.genome.age;
  const maturity = kernel.state.maturity;

  if (age < schedule.embryonicDuration) {
    kernel.state.stage = 'embryonic';
  } else if (age < schedule.embryonicDuration + schedule.juvenileDuration) {
    kernel.state.stage = 'juvenile';
    kernel.state.maturity = Math.min(1, maturity + 0.1);
  } else if (age < schedule.embryonicDuration + schedule.juvenileDuration + schedule.matureDuration) {
    if (maturity >= schedule.maturityThreshold) {
      kernel.state.stage = 'mature';
    } else {
      kernel.state.stage = 'juvenile';
    }
  } else {
    kernel.state.stage = 'senescent';
    kernel.state.energy = Math.max(0, kernel.state.energy - 0.1);
  }
}

/**
 * Get development stage for maturity level
 */
function getStageForMaturity(maturity: number): DevelopmentStage {
  if (maturity < 0.2) return 'embryonic';
  if (maturity < 0.6) return 'juvenile';
  if (maturity < 0.95) return 'mature';
  return 'senescent';
}

/**
 * Get a specific gene value from a kernel
 */
export function getGeneValue(kernel: OntogeneticKernel, geneId: string): number | undefined {
  const gene = kernel.genome.genes.find(g => g.id === geneId);
  return gene?.value;
}

/**
 * Check if a gene is expressed
 */
export function isGeneExpressed(kernel: OntogeneticKernel, geneId: string): boolean {
  const gene = kernel.genome.genes.find(g => g.id === geneId);
  if (!gene) return false;
  return gene.value >= gene.threshold;
}

/**
 * Get all expressed genes
 */
export function getExpressedGenes(kernel: OntogeneticKernel): CognitiveGene[] {
  return kernel.genome.genes.filter(gene => gene.value >= gene.threshold);
}
