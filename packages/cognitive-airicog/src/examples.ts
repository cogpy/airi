/**
 * AiriCog Examples
 *
 * Demonstrates usage of the AiriCog cognitive architecture.
 */

import { createAtomSpace } from './atomspace/atomspace';
import { createECAN, createRelevanceRealization } from './attention/ecan';
import { createPLN } from './reasoning/pln';
import { createOrchestrator } from './orchestration/orchestrator';
import {
  initializeKernel,
  selfGenerate,
  selfOptimize,
  reproduce,
  evaluateFitness,
  runOntogenesis,
  getExpressedGenes,
} from './ontogenesis/kernel';

/**
 * Example 1: Basic AtomSpace usage
 */
export function exampleAtomSpace() {
  console.log('=== Example 1: AtomSpace ===\n');

  // Create an AtomSpace
  const atomSpace = createAtomSpace({ name: 'example' });

  // Add concepts
  const melody = atomSpace.addNode('ConceptNode', 'Melody', { strength: 1.0, confidence: 0.95 });
  const virtualTuber = atomSpace.addNode('ConceptNode', 'VirtualTuber', { strength: 0.9, confidence: 0.9 });
  const aiCharacter = atomSpace.addNode('ConceptNode', 'AICharacter', { strength: 0.85, confidence: 0.85 });

  console.log('Created nodes:');
  console.log(`  ${melody.name} (${melody.type})`);
  console.log(`  ${virtualTuber.name} (${virtualTuber.type})`);
  console.log(`  ${aiCharacter.name} (${aiCharacter.type})`);

  // Create inheritance relationships
  const inheritVTuber = atomSpace.addLink('InheritanceLink', [melody.id, virtualTuber.id]);
  const inheritAI = atomSpace.addLink('InheritanceLink', [melody.id, aiCharacter.id]);

  console.log('\nCreated links:');
  console.log(`  Melody -> VirtualTuber (Inheritance)`);
  console.log(`  Melody -> AICharacter (Inheritance)`);

  // Query the atomspace
  const conceptNodes = atomSpace.query({ nodeType: 'ConceptNode' });
  console.log(`\nFound ${conceptNodes.length} ConceptNodes`);

  // Get statistics
  const stats = atomSpace.getStats();
  console.log('\nAtomSpace stats:');
  console.log(`  Total atoms: ${stats.totalAtoms}`);
  console.log(`  Nodes: ${stats.nodeCount}`);
  console.log(`  Links: ${stats.linkCount}`);

  atomSpace.dispose();
}

/**
 * Example 2: Attention allocation with ECAN
 */
export function exampleECAN() {
  console.log('\n=== Example 2: Economic Attention Networks ===\n');

  const atomSpace = createAtomSpace({ name: 'ecan-example' });
  const ecan = createECAN(atomSpace, { attentionalFocusSize: 10 });

  // Add some knowledge
  const chat = atomSpace.addNode('ConceptNode', 'Chat', { strength: 0.8, confidence: 0.9 });
  const humor = atomSpace.addNode('ConceptNode', 'Humor', { strength: 0.9, confidence: 0.85 });
  const empathy = atomSpace.addNode('ConceptNode', 'Empathy', { strength: 0.95, confidence: 0.9 });

  console.log('Initial attention values:');
  console.log(`  Chat STI: ${chat.attentionValue.sti.toFixed(3)}`);
  console.log(`  Humor STI: ${humor.attentionValue.sti.toFixed(3)}`);
  console.log(`  Empathy STI: ${empathy.attentionValue.sti.toFixed(3)}`);

  // Stimulate the humor concept
  ecan.stimulate(humor.id, 0.3);

  console.log('\nAfter stimulating Humor:');
  console.log(`  Humor STI: ${humor.attentionValue.sti.toFixed(3)}`);

  // Spread importance
  ecan.spreadImportance({
    sourceId: humor.id,
    amount: 0.2,
    maxHops: 2,
  });

  // Get attentional focus
  const focus = ecan.getAttentionalFocus();
  console.log(`\nAttentional focus (${focus.length} atoms):`);
  for (const atom of focus.slice(0, 5)) {
    if (atom.kind === 'node') {
      console.log(`  ${atom.name}: STI=${atom.attentionValue.sti.toFixed(3)}`);
    }
  }

  // Get stats
  const stats = ecan.getStats();
  console.log('\nECAN stats:');
  console.log(`  Total attention: ${stats.totalAttention.toFixed(3)}`);
  console.log(`  Focus size: ${stats.focusSize}`);
  console.log(`  Entropy: ${stats.entropy.toFixed(3)}`);

  ecan.dispose();
  atomSpace.dispose();
}

/**
 * Example 3: Probabilistic reasoning with PLN
 */
export function examplePLN() {
  console.log('\n=== Example 3: Probabilistic Logic Networks ===\n');

  const atomSpace = createAtomSpace({ name: 'pln-example' });
  const pln = createPLN(atomSpace, { maxDepth: 3 });

  // Create knowledge structure
  const dog = atomSpace.addNode('ConceptNode', 'Dog');
  const mammal = atomSpace.addNode('ConceptNode', 'Mammal');
  const animal = atomSpace.addNode('ConceptNode', 'Animal');

  // Dog -> Mammal -> Animal
  const dogMammal = atomSpace.addLink(
    'InheritanceLink',
    [dog.id, mammal.id],
    { strength: 0.95, confidence: 0.9 }
  );

  const mammalAnimal = atomSpace.addLink(
    'InheritanceLink',
    [mammal.id, animal.id],
    { strength: 0.98, confidence: 0.95 }
  );

  console.log('Knowledge:');
  console.log('  Dog -> Mammal (strength: 0.95, confidence: 0.9)');
  console.log('  Mammal -> Animal (strength: 0.98, confidence: 0.95)');

  // Perform deduction: Dog -> Animal
  const result = pln.deduction(dogMammal.id, mammalAnimal.id);

  if (result) {
    console.log('\nDeduction result:');
    console.log(`  Dog -> Animal`);
    console.log(`  Strength: ${result.conclusion.truthValue.strength.toFixed(3)}`);
    console.log(`  Confidence: ${result.conclusion.truthValue.confidence.toFixed(3)}`);
  }

  // Forward chaining from dog
  const chainResults = pln.forwardChain(dog.id, 2);
  console.log(`\nForward chaining found ${chainResults.length} new inferences`);

  atomSpace.dispose();
}

/**
 * Example 4: Multi-agent orchestration
 */
export function exampleOrchestration() {
  console.log('\n=== Example 4: Cognitive Orchestration ===\n');

  const orchestrator = createOrchestrator({
    maxAgents: 10,
    enableSharedKB: true,
  });

  // Create agents
  const agent1 = orchestrator.createAgent('melody');
  const agent2 = orchestrator.createAgent('assistant');

  console.log('Created agents:');
  console.log(`  ${agent1.id} (status: ${agent1.status})`);
  console.log(`  ${agent2.id} (status: ${agent2.status})`);

  // Add knowledge to agent1
  const emotion = agent1.atomSpace.addNode('ConceptNode', 'Happy', { strength: 0.8, confidence: 0.9 });
  const topic = agent1.atomSpace.addNode('ConceptNode', 'Gaming', { strength: 0.9, confidence: 0.85 });

  // Share knowledge with agent2
  orchestrator.shareKnowledge({
    sourceAgentId: agent1.id,
    targetAgentId: agent2.id,
    atomIds: [emotion.id, topic.id],
    trustLevel: 0.8,
  });

  console.log('\nShared knowledge from melody to assistant');

  // Run cognitive steps
  for (let i = 0; i < 5; i++) {
    orchestrator.cognitiveStep(agent1.id);
    orchestrator.cognitiveStep(agent2.id);
  }

  console.log(`\nAfter 5 cognitive steps:`);
  console.log(`  melody iterations: ${agent1.iterations}`);
  console.log(`  assistant iterations: ${agent2.iterations}`);

  // Get stats
  const stats = orchestrator.getStats();
  console.log('\nOrchestrator stats:');
  console.log(`  Total agents: ${stats.agentCount}`);
  console.log(`  Active agents: ${stats.activeAgents}`);
  console.log(`  Total iterations: ${stats.totalIterations}`);
  console.log(`  Shared KB size: ${stats.sharedKBSize}`);

  orchestrator.dispose();
}

/**
 * Example 5: Ontogenetic evolution
 */
export function exampleOntogenesis() {
  console.log('\n=== Example 5: Ontogenetic Evolution ===\n');

  // Initialize a kernel
  const kernel = initializeKernel();

  console.log('Initialized kernel:');
  console.log(`  ID: ${kernel.id}`);
  console.log(`  Stage: ${kernel.state.stage}`);
  console.log(`  Generation: ${kernel.genome.generation}`);
  console.log(`  Genes: ${kernel.genome.genes.length}`);

  // Self-generate offspring
  const offspring = selfGenerate(kernel);
  console.log(`\nSelf-generated offspring:`);
  console.log(`  ID: ${offspring.id}`);
  console.log(`  Generation: ${offspring.genome.generation}`);

  // Self-optimize
  const optimized = selfOptimize(offspring, 5);
  console.log(`\nAfter 5 optimization iterations:`);
  console.log(`  Maturity: ${optimized.state.maturity.toFixed(2)}`);
  console.log(`  Stage: ${optimized.state.stage}`);

  // Get expressed genes
  const expressed = getExpressedGenes(optimized);
  console.log(`\nExpressed genes (${expressed.length}):`);
  for (const gene of expressed.slice(0, 5)) {
    console.log(`  ${gene.id}: ${gene.value.toFixed(3)} (threshold: ${gene.threshold})`);
  }

  // Run evolution
  console.log('\nRunning ontogenetic evolution...');
  const generations = runOntogenesis({
    evolution: {
      populationSize: 10,
      mutationRate: 0.15,
      crossoverRate: 0.7,
      elitismRate: 0.2,
      maxGenerations: 10,
      fitnessThreshold: 0.9,
      diversityPressure: 0.1,
    },
    development: {
      embryonicDuration: 2,
      juvenileDuration: 5,
      matureDuration: 10,
      maturityThreshold: 0.8,
    },
  });

  console.log(`\nEvolution complete (${generations.length} generations):`);
  const lastGen = generations[generations.length - 1];
  console.log(`  Best fitness: ${lastGen.bestFitness.toFixed(3)}`);
  console.log(`  Average fitness: ${lastGen.averageFitness.toFixed(3)}`);
  console.log(`  Diversity: ${lastGen.diversity.toFixed(3)}`);
}

/**
 * Run all examples
 */
export function runAllExamples() {
  console.log('AiriCog Examples');
  console.log('================\n');

  exampleAtomSpace();
  exampleECAN();
  examplePLN();
  exampleOrchestration();
  exampleOntogenesis();

  console.log('\n================');
  console.log('All examples completed!');
}

// Run if called directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllExamples();
}
