# @proj-airi/cognitive-airicog

AiriCog — an OpenCog-inspired cognitive architecture for the AIRI project.

## What it does

AiriCog provides a suite of building blocks for symbolic, probabilistic, and attentional AI:

| Module | Description |
|---|---|
| **Affect** | Mood that carries between turns and settles back to temperament |
| **AtomSpace** | Hypergraph-based knowledge representation (Nodes + Links) |
| **Co-play** | Turn-based games with a partner: rules contract, turn-enforcing session, fallback move, tic-tac-toe |
| **ECAN** | Economic Attention Networks for cognitive resource allocation |
| **PLN** | Probabilistic Logic Networks for uncertain reasoning |
| **Initiative** | Turn-taking: when to take the floor during a lull, when to give it back, and when to stop answering another agent |
| **Memory** | What an experience was worth, how firmly it is still held, what resurfaces, and the insights drawn from it (reflection) |
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

### Conversation guard (talking with another agent)

Two characters that each answer the other never stop on their own. The guard
is the brake: she replies to at most `turnBudget` agent turns in any
`windowMs`, and never to two agent turns closer than `cooldownMs`.

```ts
import { decideAgentReply } from '@proj-airi/cognitive-airicog/initiative'

const repliedAt: number[] = []

function onAgentTurn(now: number) {
  const decision = decideAgentReply({ now, repliedAt }, { turnBudget: 6 })
  if (!decision.reply)
    return // decision.reason is 'over-budget' or 'cooldown'

  repliedAt.push(now)
  reply()
}
```

Only turns she replied to spend budget. When the budget is spent she falls
quiet, the other agent has nothing to answer, and the conversation stops on
both sides. Once the oldest replies leave the window she answers again.

| Setting | Default | Raising it |
|---|---|---|
| `turnBudget` | 6 | lets the conversation run longer |
| `windowMs` | 120000 | makes the pause after a spent budget longer |
| `cooldownMs` | 2000 | slows the exchange; a burst gets one reply |

### Co-play (playing a game with someone)

A game is a shared environment, not a participant. `GameRules` is the whole
contract a game implements: its seats, the starting state, whose turn it is,
the legal moves, what a move does, the result, a text description a model can
read, and how a move is written and read as text. Everything else is written
against it, so chess or another game plugs in without changing the session.

```ts
import { chooseFallbackMove, createGameSession, ticTacToe } from '@proj-airi/cognitive-airicog/coplay'

const session = createGameSession(ticTacToe, [
  { seat: 'X', participantId: 'stage:airi', kind: 'self' },
  { seat: 'O', participantId: 'device:microphone', kind: 'other' },
])

session.submitText('device:microphone', 'b2')
// => { status: 'rejected', reason: 'not-your-turn', currentSeat: 'X' }

const result = session.submitText('stage:airi', 'I take b2')
if (result.status === 'accepted')
  console.info(result.record.text, result.outcome) // 'b2', { status: 'in-progress' }

console.info(ticTacToe.describe(session.state(), 'O')) // board, sides, legal moves

// When the model names no legal move, keep the game going
const move = chooseFallbackMove(ticTacToe, session.state())
```

The session owns the state and the history and changes only through an
accepted move. It refuses a move, and changes nothing, for the first reason
that applies: `unknown-player`, `game-over`, `not-your-turn`,
`unreadable-move`, `illegal-move`. It has no clock and does no IO: the caller
asks the character, reads the user's input, or receives a peer's event, then
submits the move.

`chooseFallbackMove` wins at once if it can, otherwise avoids any move that
lets the opponent win at once, otherwise plays the first legal move. It knows
nothing about the game beyond `GameRules`, and the same state always gives the
same move.

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

#### Reflection

Episodes say what happened, never what it meant. Reflection turns a run of
experiences into a few insights the character keeps. Ported from the
`character-echo` package in the cogpy/moeru-ai fork, where reflections were
stored and never read: here each insight is an `Episode` of kind `reflection`,
so it decays, is recalled, and can be raised in a lull like any other memory.

```ts
import {
  decideReflection,
  parseReflection,
  reflectionEpisodes,
  reflectionPrompt,
} from '@proj-airi/cognitive-airicog/memory'

const decision = decideReflection({ now, episodes, lastReflectionAt })
if (decision.reflect) {
  const prompt = reflectionPrompt(decision.sources, episode => episode.atomId, { characterName: 'Vexa' })
  const reply = await askModel(prompt) // the caller owns the model call
  episodes.push(...reflectionEpisodes(parseReflection(reply), decision.sources, now))
  lastReflectionAt = now
}
```

A reflection is due when the new experiences since the last one are strong
enough in sum (`importanceThreshold`, about five ordinary remarks) or numerous
enough (`maxPending`, Echo's interval of ten), and never sooner than
`minIntervalMs` after the last, because each one is a model call. Only
experiences count, so an insight never feeds the next reflection. Insights
encode at `insightSalience`, above an ordinary remark, so they outlast what
they were drawn from.

### Affect (mood between turns)

`Emotion` is a display label picked per message, and an episode's `valence` is
affect attached to one memory. Neither persists, so nothing carries an
affective state *between* turns — a rough exchange does not colour the next one.

```ts
import { applyEvent, createMood, decayMood, moodDescriptor } from '@proj-airi/cognitive-airicog/affect'

let mood = createMood(Date.now()) // starts at temperament, not at zero
mood = applyEvent(mood, { valence: -0.9 }, Date.now()) // someone was rude

moodDescriptor(mood) // => 'distressed'
moodDescriptor(decayMood(mood, Date.now() + 60_000)) // => 'bored'
moodDescriptor(decayMood(mood, Date.now() + 3_600_000)) // => 'neutral'
```

Valence and arousal are separate axes rather than a list of named feelings,
because mood has to be blended and decayed: "slightly less angry than a minute
ago" is arithmetic on an axis, not a step between labels. Mood returns to a
configured baseline rather than to zero — the baseline is temperament, which is
what separates a cheerful character from a gloomy one given the same day.

Arousal settles faster than valence on purpose: being startled wears off long
before being upset does, which is why the example above passes through `bored`
on its way back to `neutral`. `applyEvent` decays to the current instant before
applying, so events arriving minutes apart do not compound as if simultaneous.

`moodDescriptor` names the circumplex quadrant, with a dead zone around the
centre — most of the time the honest answer is that nothing shows, and a display
layer that switches expression on every small drift looks twitchy.

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
  coplay/       GameRules, game session, fallback move, tic-tac-toe
  reasoning/    PLN + TVFormulas
  orchestration/  CognitiveOrchestrator
  ontogenesis/  OntogeneticKernel + evolution
  index.ts      Public API + createAiriCog()
  examples.ts   Runnable usage examples
```
