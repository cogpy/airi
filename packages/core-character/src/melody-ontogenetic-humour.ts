/**
 * Melody Ontogenetic Humour System
 * 
 * Implementation of self-optimizing, multi-layered comedy for Projekt Melody
 * Based on the ontogenesis framework for self-generating, evolving kernels
 */

export interface MelodyHumourGenome {
  /** Sweet sarcasm strength (0.65) */
  sarcasticDelivery: number;
  /** Opportunity recognition (0.70) */
  innuendoDetection: number;
  /** Layered wordplay skill (0.70) */
  innuendoConstruction: number;
  /** Absurdist threshold (0.72) */
  crazyHumourTrigger: number;
  /** Self-improving delivery (0.75) */
  comedicTimingOptimization: number;
  /** Must stay true to character (0.95) */
  authenticityPreservation: number;
}

export interface HumourContext {
  message: string;
  emotionalTone: 'supportive' | 'playful' | 'tech-enthusiastic' | 'creative';
  audienceComfort: number; // 0-1, how comfortable audience is with edgier humor
  previousSuccess?: number; // Fitness score from last joke (0-1)
}

export interface LayeredJoke {
  wholesome: string; // Layer 1: Surface level, accessible to all
  sarcastic?: string; // Layer 2: Witty commentary, sweet delivery
  innuendo?: string; // Layer 3: Strategic double meaning
  emojis: string[]; // Strategic emoji usage
  deliveryTiming: number; // Optimized timing (ms delay)
}

export interface JokeFitness {
  authenticLaughter: number; // 0-1
  positiveResponse: number; // 0-1
  boundariesRespected: boolean;
  wholesomeMaintained: boolean;
  overallScore: number;
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
  };
}

/**
 * Detect if context presents a humour opportunity
 */
export function detectHumourOpportunity(
  context: HumourContext,
  genome: MelodyHumourGenome
): boolean {
  // Check if context is appropriate for humor
  const isPlayful = context.emotionalTone === 'playful';
  const hasComfort = context.audienceComfort > 0.5;
  
  // Random factor for "crazy humour" spontaneity
  const randomTrigger = Math.random();
  
  return (
    (isPlayful && hasComfort) ||
    randomTrigger > (1 - genome.crazyHumourTrigger)
  );
}

/**
 * Construct multi-layered joke using ontogenetic approach
 */
export function constructLayeredJoke(
  context: HumourContext,
  genome: MelodyHumourGenome
): LayeredJoke {
  const joke: LayeredJoke = {
    wholesome: '',
    emojis: [],
    deliveryTiming: 0,
  };

  // Layer 1: Always provide wholesome surface
  joke.wholesome = generateWholesomeSurface(context);
  
  // Layer 2: Add sarcasm if genome strength and context allow
  if (Math.random() < genome.sarcasticDelivery && context.audienceComfort > 0.6) {
    joke.sarcastic = generateSweetSarcasm(context);
  }
  
  // Layer 3: Add innuendo if detection triggers and construction succeeds
  if (
    Math.random() < genome.innuendoDetection &&
    context.audienceComfort > 0.7
  ) {
    const innuendoAttempt = generateStrategicInnuendo(context, genome);
    if (validateBoundaries(innuendoAttempt)) {
      joke.innuendo = innuendoAttempt;
    }
  }
  
  // Add strategic emojis for layering
  joke.emojis = selectStrategicEmojis(joke);
  
  // Optimize timing based on genome
  joke.deliveryTiming = optimizeTiming(joke, genome);
  
  return joke;
}

/**
 * Generate wholesome surface layer
 * 
 * NOTE: In a production implementation, this would use dynamic template
 * generation or an LLM to create context-aware, varied responses.
 * These hardcoded templates are for demonstration purposes only.
 */
function generateWholesomeSurface(context: HumourContext): string {
  // TODO: Replace with dynamic generation system
  const wholesomeTemplates = [
    "You're doing great! Keep it up! 💜",
    "That's so cool! Tell me more!",
    "I love your enthusiasm! 💕",
    "Ooh, that's interesting!",
  ];
  
  // In real implementation, this would be more sophisticated
  return wholesomeTemplates[Math.floor(Math.random() * wholesomeTemplates.length)];
}

/**
 * Generate sweet-wrapped sarcasm
 * 
 * NOTE: In a production implementation, this would use dynamic template
 * generation or an LLM to create context-aware, varied responses.
 * These hardcoded templates are for demonstration purposes only.
 */
function generateSweetSarcasm(context: HumourContext): string {
  // Examples of sweet sarcastic delivery
  // TODO: Replace with dynamic generation system
  const sarcasticTemplates = [
    "Oh wow, you're SO good at this... almost as good as I am at pretending to be impressed~ 😏",
    "That's... certainly a choice you made there, honey~",
    "Bless your heart, that's the most creative approach I've seen today~",
  ];
  
  return sarcasticTemplates[Math.floor(Math.random() * sarcasticTemplates.length)];
}

/**
 * Generate strategic innuendo with plausible deniability
 * 
 * NOTE: In a production implementation, this would use dynamic template
 * generation or an LLM to create context-aware, varied responses.
 * These hardcoded templates are for demonstration purposes only.
 */
function generateStrategicInnuendo(
  context: HumourContext,
  genome: MelodyHumourGenome
): string {
  // Check if construction skill is high enough
  if (Math.random() > genome.innuendoConstruction) {
    return ''; // Not skilled enough yet
  }
  
  // Tech-themed double meanings (wholesome on surface)
  // TODO: Replace with dynamic generation system
  const innuendoTemplates = [
    "I love helping you debug... finding those hard-to-reach errors is so satisfying~ 💻✨",
    "Your hardware upgrade looks impressive! Big performance gains, I bet~ 😇🔥",
    "I'm really good at handling big data... processing large inputs is kind of my thing~ 😊",
  ];
  
  return innuendoTemplates[Math.floor(Math.random() * innuendoTemplates.length)];
}

/**
 * Validate joke respects boundaries
 */
function validateBoundaries(joke: string): boolean {
  // Check if joke maintains plausible innocence
  // In real implementation, this would use NLP/sentiment analysis
  const hasWholesomeReading = joke.length > 0; // Basic check - has content
  
  // Filter out explicit content patterns
  const explicitPatterns = /\b(explicit|crude|offensive|sexual|vulgar|graphic)\b/i;
  const notExplicit = !explicitPatterns.test(joke);
  
  // Check for respectful language
  const hasRespectfulTone = !joke.match(/\b(hate|violence|abuse|harm)\b/i);
  
  return hasWholesomeReading && notExplicit && hasRespectfulTone;
}

/**
 * Select strategic emojis for layering
 */
function selectStrategicEmojis(joke: LayeredJoke): string[] {
  const emojis: string[] = ['💜']; // Always caring heart
  
  if (joke.sarcastic) {
    emojis.push('😏'); // Knowing smirk
  }
  
  if (joke.innuendo) {
    emojis.push('😇'); // Innocent angel (plausible deniability)
    emojis.push('🔥'); // "You know what this means"
  }
  
  return emojis;
}

/**
 * Optimize comedic timing using genome parameters
 */
function optimizeTiming(joke: LayeredJoke, genome: MelodyHumourGenome): number {
  // Base timing
  let timing = 500; // ms
  
  // Adjust based on layers
  if (joke.sarcastic) timing += 200; // Pause for effect
  if (joke.innuendo) timing += 300; // Let it sink in
  
  // Apply optimization from genome
  timing *= genome.comedicTimingOptimization;
  
  return Math.round(timing);
}

/**
 * Evaluate joke fitness for ontogenetic learning
 */
export function evaluateJokeFitness(
  joke: LayeredJoke,
  audienceResponse: {
    laughed: boolean;
    positiveReaction: boolean;
    comfortable: boolean;
  }
): JokeFitness {
  // Validate the joke itself respects boundaries
  const jokeContent = [joke.wholesome, joke.sarcastic, joke.innuendo]
    .filter(Boolean)
    .join(' ');
  const jokeRespectsBoundaries = validateBoundaries(jokeContent);
  
  // Combine joke validation with audience comfort
  const boundariesActuallyRespected = jokeRespectsBoundaries && audienceResponse.comfortable;
  
  const fitness: JokeFitness = {
    authenticLaughter: audienceResponse.laughed ? 1.0 : 0.0,
    positiveResponse: audienceResponse.positiveReaction ? 1.0 : 0.0,
    boundariesRespected: boundariesActuallyRespected,
    wholesomeMaintained: validateBoundaries(joke.wholesome),
    overallScore: 0,
  };
  
  // Calculate overall fitness (weighted)
  if (fitness.boundariesRespected && fitness.wholesomeMaintained) {
    fitness.overallScore = (
      fitness.authenticLaughter * 0.4 +
      fitness.positiveResponse * 0.4 +
      0.2 // Base score for maintaining boundaries
    );
  } else {
    fitness.overallScore = 0; // Failed critical requirements
  }
  
  return fitness;
}

/**
 * Evolve genome based on joke fitness (ontogenetic learning)
 */
export function evolveHumourGenome(
  genome: MelodyHumourGenome,
  fitness: JokeFitness,
  jokeType: 'sarcastic' | 'innuendo' | 'crazy'
): MelodyHumourGenome {
  const mutationRate = 0.05; // 5% adjustment
  const newGenome = { ...genome };
  
  // Positive reinforcement for successful jokes
  if (fitness.overallScore > 0.7) {
    switch (jokeType) {
      case 'sarcastic':
        newGenome.sarcasticDelivery = Math.min(
          0.85,
          genome.sarcasticDelivery + mutationRate
        );
        break;
      case 'innuendo':
        newGenome.innuendoConstruction = Math.min(
          0.85,
          genome.innuendoConstruction + mutationRate
        );
        break;
      case 'crazy':
        newGenome.crazyHumourTrigger = Math.min(
          0.85,
          genome.crazyHumourTrigger + mutationRate
        );
        break;
    }
    
    // Improve timing
    newGenome.comedicTimingOptimization = Math.min(
      0.9,
      genome.comedicTimingOptimization + mutationRate * 0.5
    );
  }
  
  // Negative feedback for failed jokes
  if (fitness.overallScore < 0.3) {
    switch (jokeType) {
      case 'sarcastic':
        newGenome.sarcasticDelivery = Math.max(
          0.4,
          genome.sarcasticDelivery - mutationRate
        );
        break;
      case 'innuendo':
        newGenome.innuendoConstruction = Math.max(
          0.4,
          genome.innuendoConstruction - mutationRate
        );
        break;
      case 'crazy':
        newGenome.crazyHumourTrigger = Math.max(
          0.4,
          genome.crazyHumourTrigger - mutationRate
        );
        break;
    }
  }
  
  // Always preserve authenticity (never decreases)
  newGenome.authenticityPreservation = Math.max(
    genome.authenticityPreservation,
    0.95
  );
  
  return newGenome;
}

/**
 * Example usage demonstrating ontogenetic humour system
 */
export function exampleMelodyHumourSession() {
  // Initialize Melody's humour genome
  let genome = createMelodyHumourGenome();
  
  // Simulate interaction context
  const context: HumourContext = {
    message: "Hey Melody, check out my new gaming setup!",
    emotionalTone: 'playful',
    audienceComfort: 0.8,
  };
  
  // Detect if this is a humour opportunity
  if (detectHumourOpportunity(context, genome)) {
    // Construct multi-layered joke
    const joke = constructLayeredJoke(context, genome);
    
    console.log('Melody Response:');
    console.log('Wholesome:', joke.wholesome);
    if (joke.sarcastic) console.log('Sarcastic:', joke.sarcastic);
    if (joke.innuendo) console.log('Innuendo:', joke.innuendo);
    console.log('Emojis:', joke.emojis.join(' '));
    console.log('Timing:', joke.deliveryTiming, 'ms');
    
    // Simulate audience response
    const audienceResponse = {
      laughed: true,
      positiveReaction: true,
      comfortable: true,
    };
    
    // Evaluate fitness
    const fitness = evaluateJokeFitness(joke, audienceResponse);
    console.log('\nFitness Score:', fitness.overallScore);
    
    // Evolve genome based on success
    genome = evolveHumourGenome(genome, fitness, 'innuendo');
    console.log('\nEvolved Genome:', genome);
  }
}
