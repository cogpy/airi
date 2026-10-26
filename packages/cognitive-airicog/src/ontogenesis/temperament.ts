import type { CognitiveGene, OntogeneticKernel } from './kernel'

import { createDefaultGenes, getGeneValue, initializeKernel, selfOptimize } from './kernel'

/** The gene that sets how readily she speaks unprompted. */
export const TALKATIVENESS_GENE = 'curiosity'

export interface TemperamentConfig {
  /**
   * Weight of the newest outcome in the running answer rate, `0` to `1`.
   * Raise it so she adapts faster, and forgets older outcomes faster.
   *
   * @default 0.2
   */
  learningRate: number
  /**
   * How far the threshold factor can move from `1`, `0` to `1`. With `0.5`,
   * the card threshold is scaled between `0.5` and `1.5`.
   *
   * @default 0.5
   */
  range: number
}

export function createDefaultTemperamentConfig(): TemperamentConfig {
  return { learningRate: 0.2, range: 0.5 }
}

/** What a temperament keeps between sessions. */
export interface TemperamentSnapshot {
  genes: CognitiveGene[]
  /** Running rate at which she was answered, `0` to `1`. */
  fitness: number
  maturity: number
}

/** Development events kept on the kernel. Older ones are dropped. */
const MAX_EVENTS = 50

/**
 * How readily the character speaks unprompted, learned from how people
 * respond. An ontogenetic kernel holds it.
 *
 * Each time she speaks up, {@link recordOutcome} records whether someone
 * answered. The kernel's fitness is the running answer rate, and
 * `selfOptimize` moves its mutable genes up when the rate is above one half
 * and down when it is below. The talkativeness gene then scales her initiative
 * threshold: {@link thresholdFactor} is below `1` when people answer her, so
 * she speaks more readily, and above `1` when they ignore her.
 */
export class Temperament {
  private kernel: OntogeneticKernel
  private readonly config: TemperamentConfig
  private readonly baseline: number

  constructor(snapshot?: TemperamentSnapshot, config: Partial<TemperamentConfig> = {}) {
    this.config = { ...createDefaultTemperamentConfig(), ...config }
    const defaults = createDefaultGenes()
    this.baseline = defaults.find(gene => gene.id === TALKATIVENESS_GENE)!.value
    this.kernel = initializeKernel(snapshot?.genes ?? defaults)
    // A new temperament has no evidence either way, so it starts neutral.
    this.kernel.genome.fitness = snapshot?.fitness ?? 0.5
    this.kernel.state.maturity = snapshot?.maturity ?? 0
  }

  /** Records whether someone answered after she spoke up. */
  recordOutcome(answered: boolean): void {
    const { metrics, genome } = this.kernel
    metrics.operations += 1
    if (answered)
      metrics.successes += 1
    else
      metrics.failures += 1

    const rate = this.config.learningRate
    genome.fitness = (1 - rate) * genome.fitness + rate * (answered ? 1 : 0)
    this.kernel = selfOptimize(this.kernel, 1)
    this.kernel.state.events = this.kernel.state.events.slice(-MAX_EVENTS)
  }

  /** Multiplier for the initiative threshold. Below `1` speaks more readily. */
  thresholdFactor(): number {
    const talkativeness = getGeneValue(this.kernel, TALKATIVENESS_GENE) ?? this.baseline
    const { range } = this.config
    return Math.min(1 + range, Math.max(1 - range, 1 + 2 * (this.baseline - talkativeness)))
  }

  /** The running answer rate, `0` to `1`. */
  answerRate(): number {
    return this.kernel.genome.fitness
  }

  snapshot(): TemperamentSnapshot {
    return {
      genes: this.kernel.genome.genes.map(gene => ({ ...gene })),
      fitness: this.kernel.genome.fitness,
      maturity: this.kernel.state.maturity,
    }
  }
}

export function createTemperament(snapshot?: TemperamentSnapshot, config?: Partial<TemperamentConfig>): Temperament {
  return new Temperament(snapshot, config)
}
