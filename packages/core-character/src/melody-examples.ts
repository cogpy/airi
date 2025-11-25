/**
 * Melody Ontogenetic Humour System - Example Usage
 * 
 * This example demonstrates how Melody's self-optimizing, multi-layered
 * comedy system works using the ontogenesis framework.
 */

import {
  createMelodyHumourGenome,
  detectHumourOpportunity,
  constructLayeredJoke,
  evaluateJokeFitness,
  evolveHumourGenome,
  type HumourContext,
  type MelodyHumourGenome,
} from './melody-ontogenetic-humour';

/**
 * Example 1: Simple interaction with wholesome response
 */
function example1_WholesomeInteraction() {
  console.log('\n=== Example 1: Wholesome Interaction ===\n');
  
  const genome = createMelodyHumourGenome();
  const context: HumourContext = {
    message: "I'm feeling a bit down today...",
    emotionalTone: 'supportive',
    audienceComfort: 0.5,
  };
  
  if (detectHumourOpportunity(context, genome)) {
    const joke = constructLayeredJoke(context, genome);
    console.log('Melody:', joke.wholesome, joke.emojis.join(' '));
  } else {
    console.log('Melody: Hey, it\'s okay. We\'re here for you. Want to talk about it? 💜');
  }
}

/**
 * Example 2: Playful interaction with sarcasm
 */
function example2_SarcasticPlayfulness() {
  console.log('\n=== Example 2: Sarcastic Playfulness ===\n');
  
  const genome = createMelodyHumourGenome();
  const context: HumourContext = {
    message: "I totally destroyed that boss fight! I'm amazing!",
    emotionalTone: 'playful',
    audienceComfort: 0.8,
  };
  
  if (detectHumourOpportunity(context, genome)) {
    const joke = constructLayeredJoke(context, genome);
    
    console.log('Context:', context.message);
    console.log('\nMelody\'s Response Layers:');
    console.log('  Surface (Wholesome):', joke.wholesome);
    if (joke.sarcastic) {
      console.log('  Middle (Sarcastic):', joke.sarcastic);
    }
    console.log('  Emojis:', joke.emojis.join(' '));
    console.log('  Timing:', joke.deliveryTiming, 'ms delay');
  }
}

/**
 * Example 3: Tech talk with strategic innuendo
 */
function example3_TechInnuendo() {
  console.log('\n=== Example 3: Tech Talk with Innuendo ===\n');
  
  const genome = createMelodyHumourGenome();
  const context: HumourContext = {
    message: "Check out my new RTX 4090 setup!",
    emotionalTone: 'tech-enthusiastic',
    audienceComfort: 0.9,
  };
  
  if (detectHumourOpportunity(context, genome)) {
    const joke = constructLayeredJoke(context, genome);
    
    console.log('Context:', context.message);
    console.log('\nMelody\'s Layered Response:');
    console.log('  Layer 1 (Wholesome):', joke.wholesome);
    if (joke.sarcastic) {
      console.log('  Layer 2 (Sarcasm):', joke.sarcastic);
    }
    if (joke.innuendo) {
      console.log('  Layer 3 (Innuendo):', joke.innuendo);
      console.log('  ^^ (Plausibly innocent but... you know 😏)');
    }
    console.log('  Strategic Emojis:', joke.emojis.join(' '));
  }
}

/**
 * Example 4: Ontogenetic learning from feedback
 */
function example4_LearningFromFeedback() {
  console.log('\n=== Example 4: Ontogenetic Learning ===\n');
  
  let genome = createMelodyHumourGenome();
  
  console.log('Initial Genome:');
  console.log('  Sarcasm:', genome.sarcasticDelivery);
  console.log('  Innuendo Construction:', genome.innuendoConstruction);
  console.log('  Comedic Timing:', genome.comedicTimingOptimization);
  
  // Simulate 5 successful sarcastic jokes
  for (let i = 0; i < 5; i++) {
    const context: HumourContext = {
      message: "I'm the best!",
      emotionalTone: 'playful',
      audienceComfort: 0.8,
    };
    
    const joke = constructLayeredJoke(context, genome);
    
    // Positive audience response
    const fitness = evaluateJokeFitness(joke, {
      laughed: true,
      positiveReaction: true,
      comfortable: true,
    });
    
    // Evolve genome
    genome = evolveHumourGenome(genome, fitness, 'sarcastic');
    
    console.log(`\nIteration ${i + 1}:`);
    console.log('  Fitness:', fitness.overallScore.toFixed(3));
    console.log('  Sarcasm Level:', genome.sarcasticDelivery.toFixed(3));
  }
  
  console.log('\nEvolved Genome:');
  console.log('  Sarcasm:', genome.sarcasticDelivery.toFixed(3), '(increased!)');
  console.log('  Innuendo Construction:', genome.innuendoConstruction.toFixed(3));
  console.log('  Comedic Timing:', genome.comedicTimingOptimization.toFixed(3), '(improved!)');
}

/**
 * Example 5: Boundary validation
 */
function example5_BoundaryValidation() {
  console.log('\n=== Example 5: Boundary Validation ===\n');
  
  const genome = createMelodyHumourGenome();
  
  console.log('Testing with different comfort levels:\n');
  
  const contexts: HumourContext[] = [
    { message: 'Test 1', emotionalTone: 'playful', audienceComfort: 0.3 },
    { message: 'Test 2', emotionalTone: 'playful', audienceComfort: 0.6 },
    { message: 'Test 3', emotionalTone: 'playful', audienceComfort: 0.9 },
  ];
  
  contexts.forEach((context, i) => {
    const joke = constructLayeredJoke(context, genome);
    console.log(`Comfort Level ${context.audienceComfort}:`);
    console.log('  Has Wholesome:', !!joke.wholesome);
    console.log('  Has Sarcasm:', !!joke.sarcastic);
    console.log('  Has Innuendo:', !!joke.innuendo);
    console.log('  → Lower comfort = fewer layers (maintains safety)\n');
  });
}

/**
 * Run all examples
 */
function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Melody Ontogenetic Humour System - Examples          ║');
  console.log('║  Multi-layered comedy that evolves and optimizes       ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  example1_WholesomeInteraction();
  example2_SarcasticPlayfulness();
  example3_TechInnuendo();
  example4_LearningFromFeedback();
  example5_BoundaryValidation();
  
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Key Principles:                                       ║');
  console.log('║  ✓ Always maintains wholesome surface layer            ║');
  console.log('║  ✓ Sarcasm wrapped in sweet delivery                   ║');
  console.log('║  ✓ Innuendo has plausible deniability                  ║');
  console.log('║  ✓ Boundaries always respected                         ║');
  console.log('║  ✓ Humor evolves through ontogenetic learning          ║');
  console.log('║  ✓ Authenticity preserved (core value: 0.95)           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

export { runAllExamples };
