# @proj-airi/cognitive-airicog

AiriCog — an OpenCog-inspired cognitive architecture for the AIRI project.

## What it does

AiriCog provides a suite of building blocks for symbolic, probabilistic, and attentional AI:

| Module | Description |
|---|---|
| **AtomSpace** | Hypergraph-based knowledge representation (Nodes + Links) |
| **ECAN** | Economic Attention Networks for cognitive resource allocation |
| **PLN** | Probabilistic Logic Networks for uncertain reasoning |
| **Initiative** | Turn-taking: when to take the floor during a lull, and when to give it back |
| **Memory** | What an experience was worth, how firmly it is still held, what resurfaces |
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

#### Pattern matching with variables

`patternMatch` works like `query`, except entries in `outgoing` written as `$name` are
variables: each one binds to whatever atom sits at that position, and the result carries
those bindings.

```ts
const results = as.patternMatch({
  kind: 'link',
  linkType: 'InheritanceLink',
  outgoing: [cat.id, '$parent'],
})

for (const { bindings } of results)
  console.info(bindings.get('parent')) // animal.id
```

Repeating a variable constrains the match: `outgoing: ['$x', '$x']` only matches links
whose two positions hold the same atom.

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

### Initiative (speaking unprompted)

Every other entry point answers "given this input, what follows?". Initiative
answers the one nothing else does: with no input at all, is now the moment to
speak, and about what?

```ts
import { createAtomSpace } from '@proj-airi/cognitive-airicog/atomspace'
import { createECAN } from '@proj-airi/cognitive-airicog/attention'
import { candidatesFromFocus, decideInitiative } from '@proj-airi/cognitive-airicog/initiative'

const as = createAtomSpace()
const ecan = createECAN(as)

const topic = as.addNode('ConceptNode', 'Minecraft')
ecan.stimulate(topic.id, 0.5)

const decision = decideInitiative({
  now: Date.now(),
  lastInteractionAt: Date.now() - 600_000, // ten minutes of silence
  candidates: candidatesFromFocus(ecan),
  recentlyRaised: [], // subjects already brought up, to keep it off a loop
})

if (decision.act)
  console.info('raise', decision.topicAtomId, 'urge', decision.urge)
```

The urge behind a subject is the product of three quantities on `[0, 1]`: how
long the silence has run, how much attention the subject holds, and how fresh
it is. A product rather than a sum because each is a veto — a subject just
discussed, one nothing is attending to, or a silence that has barely started
should each on its own keep the character quiet. A refractory gap is checked
before any of that, so a lull cannot become a monologue.

The decision is pure: it reads the clock and the attention economy through its
arguments, never directly, so the same state always yields the same decision.
`candidatesFromFocus` is the only part that touches a live `ECAN`.

### Yielding (giving the floor back)

Turn-taking has two halves. `decideInitiative` takes the floor; `decideYield`
gives it up when the other party starts talking over the character.

```ts
import { decideYield } from '@proj-airi/cognitive-airicog/initiative'

// Sampled by the audio layer: is the character speaking, how far into its
// utterance, and how long has the other party been speaking over it?
const decision = decideYield({ speaking: true, utteranceElapsedMs: 2000, overlapMs: 600 })

if (decision.yieldFloor)
  stopSpeaking() // decision.reason is 'interrupted' or 'insisted'
```

Stopping the moment any sound arrives is what makes voice assistants feel
twitchy — a laugh or an "mhm" cuts the character off mid-word. So an
interruption has to be sustained to count, and overlap in the first moments of
an utterance is treated as the other party finishing their own turn rather than
contesting this one. The exception is insistence: someone who keeps talking is
interrupting whatever else is true, and that overrides every reason to hold on.

| Situation | Overlap | Outcome |
|---|---|---|
| Nobody talking over it | 0ms | holds — `no-overlap` |
| "mhm", a laugh | 150ms | holds — `backchannel` |
| Overlap as it just began | 500ms at 100ms in | holds — `opening-grace` |
| They start a sentence | 600ms | yields — `interrupted` |
| They keep going | 1500ms | yields — `insisted` |

Continuity of `overlapMs` is the audio layer's to track: a pause that ends the
overlap resets it, so a run of short backchannels never accumulates into an
interruption.

### Memory (episodic)

The policy layer for remembering: not storage, and not similarity search —
`memory-pgvector` owns the store and the embedding lookup, `memory-timecrystal`
owns the token-level working cache. What neither answers is which experiences
are worth keeping and how they fade, which is what decides whether a character
seems to have a past.

```ts
import {
  asInitiativeCandidates,
  memoryStrength,
  recall,
  rehearse,
  shouldRetain,
} from '@proj-airi/cognitive-airicog/memory'

const episode = {
  id: 'ep_1',
  atomId: topic.id, // ties the memory to its subject in the AtomSpace
  at: Date.now(),
  salience: 0.8, // attention on it at the time
  valence: 0.6, // how it felt; only the magnitude is read
}

memoryStrength(episode, Date.now()) // ~1.0 — just happened
shouldRetain(episode, Date.now() + 30 * 86_400_000) // false — a month untouched

// Recall both restores a memory and lengthens its next fade
const revisited = rehearse(episode, Date.now() + 86_400_000)

recall([revisited], Date.now()) // held memories, strongest first
```

An experience encodes at a strength set by the attention and feeling it carried,
decays from the last time it was touched, and every recall resets that clock and
lengthens the interval before the next fade. So a memory returned to a few times
outlives a vivid one never thought of again, and anything never revisited is
eventually let go.

Feeding memory into initiative is what closes the loop — the character brings up
what it still remembers, not only what is in front of it:

```ts
const decision = decideInitiative({
  now,
  lastInteractionAt,
  candidates: asInitiativeCandidates(episodes, now),
})
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
} from '@proj-airi/cognitive-airicog/ontogenesis'

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
