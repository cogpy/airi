/**
 * Melody Ontogenetic Humour System
 *
 * Implementation of self-optimizing, multi-layered comedy for Projekt Melody
 * Based on the ontogenesis framework for self-generating, evolving kernels
 */

export interface MelodyHumourGenome {
  /** Sweet sarcasm strength (0.65) */
  sarcasticDelivery: number
  /** Opportunity recognition (0.70) */
  innuendoDetection: number
  /** Layered wordplay skill (0.70) */
  innuendoConstruction: number
  /** Absurdist threshold (0.72) */
  crazyHumourTrigger: number
  /** Self-improving delivery (0.75) */
  comedicTimingOptimization: number
  /** Must stay true to character (0.95) */
  authenticityPreservation: number
}

export interface HumourContext {
  message: string
  emotionalTone: 'supportive' | 'playful' | 'tech-enthusiastic' | 'creative'
  audienceComfort: number // 0-1, how comfortable audience is with edgier humor
  previousSuccess?: number // Fitness score from last joke (0-1)
}

/**
 * Which layers a joke has and when to deliver it. The genome decides the plan,
 * and the model writes the words.
 */
export interface JokePlan {
  /** Layer 2: witty commentary in a sweet delivery. */
  sarcastic: boolean
  /** Layer 3: a double meaning with plausible deniability. */
  innuendo: boolean
  /** Emojis that cue the layers. The model can use or leave them. */
  emojis: string[]
  /** Pause before delivery, in milliseconds. */
  deliveryTiming: number
}

/** A joke that the model wrote to a plan. */
export interface LayeredJoke {
  plan: JokePlan
  /** The model's text, trimmed. */
  text: string
}

/**
 * Writes the joke text for an instruction, usually with a language model.
 *
 * The humour system has no text of its own. Every joke comes from this
 * function, so two jokes for the same context differ as the model's do.
 */
export type JokeGenerator = (instruction: string, context: HumourContext) => Promise<string>

export interface JokeFitness {
  authenticLaughter: number // 0-1
  positiveResponse: number // 0-1
  boundariesRespected: boolean
  wholesomeMaintained: boolean
  overallScore: number
}

/**
 * Initialize Melody's humour genome with default ontogenetic values
 */
export function createMelodyHumourGenome(): MelodyHumourGenome {
  return {
    sarcasticDelivery: 0.65,
    innuendoDetection: 0.70,
    innuendoConstruction: 0.70,
    crazyHumourTrigger: 0.72,
    comedicTimingOptimization: 0.75,
    authenticityPreservation: 0.95,
  }
}

/**
 * Detect if context presents a humour opportunity
 */
export function detectHumourOpportunity(
  context: HumourContext,
  genome: MelodyHumourGenome,
): boolean {
  // Check if context is appropriate for humor
  const isPlayful = context.emotionalTone === 'playful'
  const hasComfort = context.audienceComfort > 0.5

  // Random factor for "crazy humour" spontaneity
  const randomTrigger = Math.random()

  return (
    (isPlayful && hasComfort)
    || randomTrigger > (1 - genome.crazyHumourTrigger)
  )
}

/**
 * Plans a multi-layered joke from the genome and the audience.
 *
 * Every joke keeps a wholesome surface. Sarcasm needs an audience comfort
 * above 0.6 and innuendo above 0.7, and each layer also needs its gene to win
 * a random draw.
 */
export function planLayeredJoke(
  context: HumourContext,
  genome: MelodyHumourGenome,
): JokePlan {
  const sarcastic = Math.random() < genome.sarcasticDelivery && context.audienceComfort > 0.6
  const innuendo = Math.random() < genome.innuendoDetection
    && context.audienceComfort > 0.7
    && Math.random() <= genome.innuendoConstruction

  const emojis = ['💜']
  if (sarcastic)
    emojis.push('😏')
  if (innuendo)
    emojis.push('😇', '🔥')

  let timing = 500
  if (sarcastic)
    timing += 200
  if (innuendo)
    timing += 300

  return { sarcastic, innuendo, emojis, deliveryTiming: Math.round(timing * genome.comedicTimingOptimization) }
}

/** The instruction that asks the model to write a joke to `plan`. */
export function jokeInstruction(plan: JokePlan, context: HumourContext): string {
  const layers = [
    '- A wholesome surface that everyone can enjoy. Always keep it.',
    ...(plan.sarcastic ? ['- Sweet sarcasm: witty commentary in a kind, teasing delivery.'] : []),
    ...(plan.innuendo ? ['- A tech-flavoured double meaning with plausible deniability. Nothing explicit.'] : []),
  ]
  return [
    `Reply to this message as Melody, with a short joke that fits a ${context.emotionalTone} mood:`,
    `"${context.message}"`,
    '',
    'Layers to put in the joke:',
    ...layers,
    '',
    `Emojis that can cue the layers: ${plan.emojis.join(' ')}`,
    'Stay kind, and stay inside the boundaries of the audience. Reply with the joke only.',
  ].join('\n')
}

/**
 * Has the model write a joke to the genome's plan.
 *
 * Returns `undefined` when the model writes nothing, or text that breaks the
 * boundaries. Then she makes no joke: no written line takes its place.
 */
export async function constructLayeredJoke(
  context: HumourContext,
  genome: MelodyHumourGenome,
  generate: JokeGenerator,
): Promise<LayeredJoke | undefined> {
  const plan = planLayeredJoke(context, genome)
  const text = (await generate(jokeInstruction(plan, context), context)).trim()
  if (!validateBoundaries(text))
    return undefined
  return { plan, text }
}

/**
 * Validate joke respects boundaries
 */
function validateBoundaries(joke: string): boolean {
  // Check if joke maintains plausible innocence
  // In real implementation, this would use NLP/sentiment analysis
  const hasWholesomeReading = joke.length > 0 // Basic check - has content

  // Filter out explicit content patterns
  const explicitPatterns = /\b(?:explicit|crude|offensive|sexual|vulgar|graphic)\b/i
  const notExplicit = !explicitPatterns.test(joke)

  // Check for respectful language
  const hasRespectfulTone = !joke.match(/\b(hate|violence|abuse|harm)\b/i)

  return hasWholesomeReading && notExplicit && hasRespectfulTone
}

/**
 * Evaluate joke fitness for ontogenetic learning
 */
export function evaluateJokeFitness(
  joke: LayeredJoke,
  audienceResponse: {
    laughed: boolean
    positiveReaction: boolean
    comfortable: boolean
  },
): JokeFitness {
  const jokeRespectsBoundaries = validateBoundaries(joke.text)

  const fitness: JokeFitness = {
    authenticLaughter: audienceResponse.laughed ? 1.0 : 0.0,
    positiveResponse: audienceResponse.positiveReaction ? 1.0 : 0.0,
    boundariesRespected: jokeRespectsBoundaries && audienceResponse.comfortable,
    wholesomeMaintained: jokeRespectsBoundaries,
    overallScore: 0,
  }

  // Calculate overall fitness (weighted)
  if (fitness.boundariesRespected && fitness.wholesomeMaintained) {
    fitness.overallScore = (
      fitness.authenticLaughter * 0.4
      + fitness.positiveResponse * 0.4
      + 0.2 // Base score for maintaining boundaries
    )
  }
  else {
    fitness.overallScore = 0 // Failed critical requirements
  }

  return fitness
}

/**
 * Evolve genome based on joke fitness (ontogenetic learning)
 */
export function evolveHumourGenome(
  genome: MelodyHumourGenome,
  fitness: JokeFitness,
  jokeType: 'sarcastic' | 'innuendo' | 'crazy',
): MelodyHumourGenome {
  const mutationRate = 0.05 // 5% adjustment
  const newGenome = { ...genome }

  // Positive reinforcement for successful jokes
  if (fitness.overallScore > 0.7) {
    switch (jokeType) {
      case 'sarcastic':
        newGenome.sarcasticDelivery = Math.min(
          0.85,
          genome.sarcasticDelivery + mutationRate,
        )
        break
      case 'innuendo':
        newGenome.innuendoConstruction = Math.min(
          0.85,
          genome.innuendoConstruction + mutationRate,
        )
        break
      case 'crazy':
        newGenome.crazyHumourTrigger = Math.min(
          0.85,
          genome.crazyHumourTrigger + mutationRate,
        )
        break
    }

    // Improve timing
    newGenome.comedicTimingOptimization = Math.min(
      0.9,
      genome.comedicTimingOptimization + mutationRate * 0.5,
    )
  }

  // Negative feedback for failed jokes
  if (fitness.overallScore < 0.3) {
    switch (jokeType) {
      case 'sarcastic':
        newGenome.sarcasticDelivery = Math.max(
          0.4,
          genome.sarcasticDelivery - mutationRate,
        )
        break
      case 'innuendo':
        newGenome.innuendoConstruction = Math.max(
          0.4,
          genome.innuendoConstruction - mutationRate,
        )
        break
      case 'crazy':
        newGenome.crazyHumourTrigger = Math.max(
          0.4,
          genome.crazyHumourTrigger - mutationRate,
        )
        break
    }
  }

  // Always preserve authenticity (never decreases)
  newGenome.authenticityPreservation = Math.max(
    genome.authenticityPreservation,
    0.95,
  )

  return newGenome
}
