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
import { createAiriCog } from '@proj-airi/cognitive-airicog'

const cog = createAiriCog({ name: 'my-cog' })

// Add knowledge
const dog = cog.atomSpace.addNode('ConceptNode', 'Dog')
const mammal = cog.atomSpace.addNode('ConceptNode', 'Mammal')
cog.atomSpace.addLink('InheritanceLink', [dog.id, mammal.id], {
  strength: 0.95,
  confidence: 0.9,
})

// Clean up
cog.dispose()
```

### AtomSpace

```ts
import { createAtomSpace } from '@proj-airi/cognitive-airicog/atomspace'

const as = createAtomSpace({ name: 'example' })

const cat = as.addNode('ConceptNode', 'Cat')
const animal = as.addNode('ConceptNode', 'Animal')
as.addLink('InheritanceLink', [cat.id, animal.id])

const nodes = as.query({ kind: 'node', nodeType: 'ConceptNode' })
console.info(nodes.length) // 2

as.dispose()
```

### ECAN (attention allocation)

```ts
import { createAtomSpace } from '@proj-airi/cognitive-airicog/atomspace'
import { createECAN } from '@proj-airi/cognitive-airicog/attention'

const as = createAtomSpace()
const ecan = createECAN(as)

const node = as.addNode('ConceptNode', 'Important')
ecan.stimulate(node.id, 0.5)

console.info(node.attentionValue.sti) // increased
ecan.dispose()
as.dispose()
```

#### The attention ledger

ECAN is a **closed economy**. Importance is never created or destroyed by an
ECAN operation, only moved between the bank and the atoms:

```
ecan.getAttentionBank() + sum(atom.attentionValue.sti) === ecan.getAttentionFunds()
```

Every transfer is capped by what is actually available at both ends — the bank
balance on one side, the atom's remaining headroom below `sti = 1` on the other
— so a request that cannot be filled leaves the remainder banked instead of
discarding it. `stimulate` and `inhibit` return the amount that actually moved.

```ts
const granted = ecan.stimulate(node.id, 0.5) // may be less than 0.5
```

Importance can still enter or leave through the AtomSpace, which knows nothing
about the bank: new atoms are born with a default STI, `spreadActivation` boosts
atoms directly, and decay shrinks them. `reconcile()` re-derives the bank from
the atoms and returns the drift it absorbed; `step()` and `spreadImportance()`
call it for you.

```ts
as.addNode('ConceptNode', 'Unbanked', {}, { sti: 0.25 })
ecan.reconcile() // => -0.25, the importance the AtomSpace minted
```

A negative bank balance is meaningful rather than an error: it says the
AtomSpace holds more importance than the economy issued, and further issuance
stays blocked until rent or inhibition brings the balance back above zero.

The invariant holds **exactly**, not approximately. All importance in the
economy sits on a lattice of dyadic rationals — integer multiples of
`1 / QUANTA_PER_UNIT`, where `QUANTA_PER_UNIT` is `2 ** 20`. Such values are
exactly representable in float64 and sum without drift, so the conserved total
is bit-exact no matter how many transfers have been made. The continuous
`[0, 1]` importance scale is the appearance; the integer partition of quanta is
what is conserved.

### PLN (uncertain reasoning)

```ts
import { createAtomSpace } from '@proj-airi/cognitive-airicog/atomspace'
import { createPLN } from '@proj-airi/cognitive-airicog/reasoning'

const as = createAtomSpace()
const pln = createPLN(as)

const dog = as.addNode('ConceptNode', 'Dog')
const mammal = as.addNode('ConceptNode', 'Mammal')
const animal = as.addNode('ConceptNode', 'Animal')

const l1 = as.addLink('InheritanceLink', [dog.id, mammal.id], { strength: 0.95, confidence: 0.9 })
const l2 = as.addLink('InheritanceLink', [mammal.id, animal.id], { strength: 0.98, confidence: 0.95 })

const result = pln.deduction(l1.id, l2.id)
// result.conclusion is a new InheritanceLink(Dog, Animal)
```

### Multi-agent orchestration

```ts
import { createOrchestrator } from '@proj-airi/cognitive-airicog/orchestration'

const orch = createOrchestrator({ maxAgents: 10 })

const agent1 = orch.createAgent('melody')
const agent2 = orch.createAgent('assistant')

// Each agent has its own AtomSpace, ECAN and PLN
agent1.atomSpace.addNode('ConceptNode', 'Song')
orch.cognitiveStep('melody')

orch.dispose()
```

### Ontogenesis (self-evolving kernels)

```ts
import {
  initializeKernel,
  runOntogenesis,
  selfGenerate,
  selfOptimize,
} from '@proj-airi/cognitive-airicog'

const kernel = initializeKernel()
const offspring = selfGenerate(kernel)
const optimized = selfOptimize(offspring, 10)

// Evolve a population
const generations = runOntogenesis({
  evolution: { populationSize: 20, maxGenerations: 50 },
})
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
