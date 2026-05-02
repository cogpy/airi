# @proj-airi/cognitive-airicog

AiriCog — an OpenCog-inspired cognitive architecture for the AIRI project.

## What it does

AiriCog provides a suite of building blocks for symbolic, probabilistic, and attentional AI:

| Module | Description |
|---|---|
| **AtomSpace** | Hypergraph-based knowledge representation (Nodes + Links) |
| **ECAN** | Economic Attention Networks for cognitive resource allocation |
| **PLN** | Probabilistic Logic Networks for uncertain reasoning |
| **Orchestration** | Multi-agent coordination and shared knowledge base |
| **Ontogenesis** | Self-generating, evolving cognitive kernels |

Inspired by [OpenCog](https://opencog.org) and adapted for the AIRI project.

## When to use it

- You need a knowledge graph with probabilistic truth values and attention allocation
- You want to perform multi-hop uncertain inference across a symbolic knowledge base
- You are building a multi-agent system that shares knowledge between agents
- You want self-evolving/adaptive cognitive components driven by a genome model

## When *not* to use it

- You only need a simple key-value or relational store (use a plain `Map` or a database)
- You need strict, deterministic logic without probabilistic uncertainty
- You need a production-grade knowledge graph at scale (AtomSpace is in-memory and single-process)

## Installation

This is a private workspace package. Reference it in your `package.json` as:

```json
{
  "dependencies": {
    "@proj-airi/cognitive-airicog": "workspace:*"
  }
}
```

## Usage

### Quick start — full system

```ts
import { createAiriCog } from '@proj-airi/cognitive-airicog';

const cog = createAiriCog({ name: 'my-cog' });

// Add knowledge
const dog = cog.atomSpace.addNode('ConceptNode', 'Dog');
const mammal = cog.atomSpace.addNode('ConceptNode', 'Mammal');
cog.atomSpace.addLink('InheritanceLink', [dog.id, mammal.id], {
  strength: 0.95,
  confidence: 0.9,
});

// Clean up
cog.dispose();
```

### AtomSpace

```ts
import { createAtomSpace } from '@proj-airi/cognitive-airicog/atomspace';

const as = createAtomSpace({ name: 'example' });

const cat = as.addNode('ConceptNode', 'Cat');
const animal = as.addNode('ConceptNode', 'Animal');
as.addLink('InheritanceLink', [cat.id, animal.id]);

const nodes = as.query({ kind: 'node', nodeType: 'ConceptNode' });
console.log(nodes.length); // 2

as.dispose();
```

### ECAN (attention allocation)

```ts
import { createAtomSpace } from '@proj-airi/cognitive-airicog/atomspace';
import { createECAN } from '@proj-airi/cognitive-airicog/attention';

const as = createAtomSpace();
const ecan = createECAN(as);

const node = as.addNode('ConceptNode', 'Important');
ecan.stimulate(node.id, 0.5);

console.log(node.attentionValue.sti); // increased
ecan.dispose();
as.dispose();
```

### PLN (uncertain reasoning)

```ts
import { createAtomSpace } from '@proj-airi/cognitive-airicog/atomspace';
import { createPLN } from '@proj-airi/cognitive-airicog/reasoning';

const as = createAtomSpace();
const pln = createPLN(as);

const dog = as.addNode('ConceptNode', 'Dog');
const mammal = as.addNode('ConceptNode', 'Mammal');
const animal = as.addNode('ConceptNode', 'Animal');

const l1 = as.addLink('InheritanceLink', [dog.id, mammal.id], { strength: 0.95, confidence: 0.9 });
const l2 = as.addLink('InheritanceLink', [mammal.id, animal.id], { strength: 0.98, confidence: 0.95 });

const result = pln.deduction(l1.id, l2.id);
// result.conclusion is a new InheritanceLink(Dog, Animal)
```

### Multi-agent orchestration

```ts
import { createOrchestrator } from '@proj-airi/cognitive-airicog/orchestration';

const orch = createOrchestrator({ maxAgents: 10 });

const agent1 = orch.createAgent('melody');
const agent2 = orch.createAgent('assistant');

// Each agent has its own AtomSpace, ECAN and PLN
agent1.atomSpace.addNode('ConceptNode', 'Song');
orch.cognitiveStep('melody');

orch.dispose();
```

### Ontogenesis (self-evolving kernels)

```ts
import {
  initializeKernel,
  selfGenerate,
  selfOptimize,
  runOntogenesis,
} from '@proj-airi/cognitive-airicog';

const kernel = initializeKernel();
const offspring = selfGenerate(kernel);
const optimized = selfOptimize(offspring, 10);

// Evolve a population
const generations = runOntogenesis({
  evolution: { populationSize: 20, maxGenerations: 50 },
});
```

## Development

```bash
# Typecheck
pnpm -F @proj-airi/cognitive-airicog typecheck

# Tests
pnpm -F @proj-airi/cognitive-airicog test

# Build
pnpm -F @proj-airi/cognitive-airicog build

# Run examples
pnpm -F @proj-airi/cognitive-airicog examples
```

## Package structure

```
src/
  atomspace/    AtomSpace + type definitions
  attention/    ECAN + RelevanceRealization
  reasoning/    PLN + TVFormulas
  orchestration/  CognitiveOrchestrator
  ontogenesis/  OntogeneticKernel + evolution
  index.ts      Public API + createAiriCog()
  examples.ts   Runnable usage examples
```
