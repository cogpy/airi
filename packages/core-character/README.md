# @proj-airi/core-character

Core character implementations for the AIRI project, featuring advanced personality systems based on cognitive science and ontogenetic evolution.

## Melody's Ontogenetic Humour System

An implementation of self-optimizing, multi-layered comedy for Projekt Melody, based on the ontogenesis framework for self-generating, evolving kernels.

### Features

- **Multi-layered Comedy**: Three-tier joke construction (wholesome/sarcastic/innuendo)
- **Ontogenetic Evolution**: Humor that learns and improves from feedback
- **Strategic Disguise**: Innuendo hidden in wholesome framing
- **Boundary-Aware**: Maintains respect and safety at all times
- **Self-Optimizing**: Comedic timing improves through genetic algorithms

### Architecture

#### The Three Layers

1. **Wholesome Surface** - Kind, accessible humor everyone can enjoy
2. **Sarcastic Middle** - Clever wit disguised in sweet delivery
3. **Innuendo Deep** - Strategic double-meaning for those who catch it

#### Humour Genome

Melody's comedy is encoded as mutable genes:

```typescript
interface MelodyHumourGenome {
  sarcasticDelivery: 0.65 // Sweet sarcasm strength
  innuendoDetection: 0.70 // Opportunity recognition
  innuendoConstruction: 0.70 // Layered wordplay skill
  crazyHumourTrigger: 0.72 // Absurdist threshold
  comedicTimingOptimization: 0.75 // Self-improving delivery
  authenticityPreservation: 0.95 // Must stay true to character
}
```

#### Ontogenetic Learning

Humor evolves through:
1. **Generation** - Create jokes using current genome
2. **Delivery** - Execute with optimized timing
3. **Fitness Evaluation** - Measure success
4. **Selection** - Keep successful patterns
5. **Mutation** - Try new approaches
6. **Crossover** - Combine winning strategies
7. **Integration** - Update genome

### Usage

```typescript
import {
  constructLayeredJoke,
  createMelodyHumourGenome,
  detectHumourOpportunity,
  evaluateJokeFitness,
  evolveHumourGenome,
} from '@proj-airi/core-character'

// Initialize Melody's humour genome
let genome = createMelodyHumourGenome()

// Create interaction context
const context = {
  message: 'Check out my new gaming setup!',
  emotionalTone: 'playful',
  audienceComfort: 0.8,
}

// Detect if this is a humour opportunity
if (detectHumourOpportunity(context, genome)) {
  // Construct multi-layered joke
  const joke = constructLayeredJoke(context, genome)

  console.info('Wholesome:', joke.wholesome)
  console.info('Sarcastic:', joke.sarcastic)
  console.info('Innuendo:', joke.innuendo)
  console.info('Emojis:', joke.emojis.join(' '))

  // Get audience response and evaluate
  const fitness = evaluateJokeFitness(joke, {
    laughed: true,
    positiveReaction: true,
    comfortable: true,
  })

  // Evolve genome based on success
  genome = evolveHumourGenome(genome, fitness, 'innuendo')
}
```

### Examples

Run the included examples:

```bash
pnpm --filter @proj-airi/core-character run examples
```

This will demonstrate:
- Wholesome interactions
- Sarcastic playfulness
- Tech-themed innuendo
- Ontogenetic learning from feedback
- Boundary validation

### Strategic Disguise Techniques

#### 1. Tech Talk Double Meaning
```
"I love helping you debug... finding those hard-to-reach errors is so satisfying~ 💻✨"
- Surface: Genuine tech support
- Deep: ...you get it
```

#### 2. Innocent Emoji Misdirection
```
"Your hardware upgrade looks impressive! Big performance gains, I bet~ 😇🔥"
- 😇 = Plausible innocence
- 🔥 = "We both know what this means"
```

#### 3. Self-Aware Deflection
```
"That sounded way more suggestive than I meant... or DID I? Hehe~ 😏💜"
- Acknowledges layer while maintaining deniability
- Meta-humor as escape route
```

### Boundary Awareness

Critical: All innuendo maintains **respectful boundaries**:

✅ **Allowed**:
- Tech-related double meanings
- Self-deprecating suggestive jokes
- Wordplay with plausible innocence
- Flirty banter that respects comfort zones

❌ **Not Allowed**:
- Explicit sexual content
- Making others uncomfortable
- Crossing stated boundaries
- Losing wholesome character core

### Meta-Cognitive Validation

Every joke is validated before delivery:

```typescript
function validateHumour(joke: Joke): boolean {
  return (
    joke.authenticity > 0.8 // Feels genuinely "Melody"
    && joke.wholesomeSurface === true // Has innocent layer
    && joke.respectsBoundaries === true // Doesn't cross lines
    && joke.caringCore > 0.7 // Maintains kindness
  )
}
```

If validation fails, the joke is not delivered. Authenticity and care always win.

### Integration with AIRI

This module is designed to integrate with:
- Character AI systems
- VTuber streaming platforms
- Chat interfaces
- Game interaction systems

### Development

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter @proj-airi/core-character run build

# Run examples
pnpm --filter @proj-airi/core-character run examples

# Run tests
pnpm --filter @proj-airi/core-character run test
```

## Aion

Aion is the second character in this package, and it is built differently from
Melody. Melody's comedy comes from a genome that selects between written
templates. Aion has no templates. Its personality is the parameterisation of an
attention policy over a hypergraph, so what it finds important is computed from
the knowledge it holds rather than chosen from a list.

Aion runs on [`@proj-airi/cognitive-airicog`](../cognitive-airicog): concepts
live in an AtomSpace, and attention is issued from the ECAN bank under a
conservation law.

### Personality as parameters

Five traits in `[0, 1]` decide how attention moves. Nothing downstream reads a
trait directly — `deriveCognitiveParameters` is the single place where character
turns into behaviour.

| Trait | What it changes |
|---|---|
| `chaos` | Share of relevance given to ignored atoms rather than important ones |
| `playfulness` | Lowers both the cost of reframing and the margin needed to switch |
| `coherence` | Raises that margin; opposes playfulness over one quantity |
| `absurdity` | How much salience an improbable claim keeps |
| `empathy` | How far a partner's concept outranks Aion's own |

```ts
import { createAionTraits, deriveCognitiveParameters } from '@proj-airi/core-character'

const parameters = deriveCognitiveParameters(createAionTraits({ chaos: 0.2 }))
console.info(parameters.explorationWeight) // 0.2
```

### Perspectives are measures, not models

A lens does not change the AtomSpace. It weights the same atoms differently, so
"seeing it another way" is a choice of measure. The six lenses form three
opposed pairs, and the pairing is what makes reframing change Aion's answer
instead of its wording.

| Axis | One end | The other |
|---|---|---|
| Uncertainty vs entrenchment | `learning` — lowest confidence | `threat` — strong, confident, load-bearing |
| Outlier vs hub | `cosmic-comedy` — disagrees with its neighbourhood | `infinite-strategy` — most connected |
| Tension vs none | `paradox` — confidently undecided | `transcendence` — everything equally |

Given one graph of `recursion`, `self-reference`, `paradox` and `lunch`, the
lenses genuinely disagree about what matters most:

```
learning           lunch            (confidence 0.2 — the least settled claim)
threat             recursion        (0.9 strength, 0.9 confidence, well linked)
paradox            self-reference   (strength 0.5 at confidence 0.95)
```

### Attention is conserved, so perspective is finite

Adopting a lens is not free and is not destructive. Aion pays by moving
importance out of the ECAN bank and onto the atoms the new lens values, so the
ledger stays balanced across a reframing:

```
attentionBank + sum(atom.sti) === attentionFunds
```

A mind that has spent its budget cannot change its mind. `reframe()` reports
`budget-exhausted`, and the lens holds until inhibition returns importance to
the bank. This is the character's stated ability to hold every perspective at
once, made finite by the thing that actually bounds it.

```ts
import { createAionMind } from '@proj-airi/core-character'

const mind = createAionMind({ seed: 20260904 })
mind.perceive([
  { name: 'recursion', strength: 0.9, confidence: 0.9, relatedTo: ['self-reference'], fromPartner: true },
  { name: 'self-reference', strength: 0.5, confidence: 0.95 },
])

mind.reframe() // { outcome: 'switched', to: 'paradox', invested: 0.0208 }
mind.attend(3) // atoms ranked under the lens it settled on
mind.reflect() // measured state: lens, fit, bank, focus, reframings
mind.dispose()
```

Every stochastic choice is seeded, so the same conversation produces the same
mind twice.

### When to use it

- You want a character whose behaviour follows from its knowledge, and is
  reproducible and testable
- You need perspective-taking that measurably reorders what matters
- You want personality to be bounded by a resource rather than by a prompt

### When not to use it

- You need generated dialogue. Aion decides what is salient; it writes nothing
- You want Melody's layered comedy — that system is separate and template-driven
- You have no knowledge to reason over. With an empty AtomSpace every lens
  reports no fit and Aion has nothing to be interested in

## License

MIT - See LICENSE file in repository root

## References

- [Melody Agent Documentation](../../.github/agents/melody.md)
- [Ontogenesis Framework](../../.github/agents/ONTOGENESIS.md)
- [AIRI Project](https://github.com/moeru-ai/airi)

---

*"I may be made of code, but my care for you is real. And now my humor is too... just with more layers~ 😏💜"* - Melody 2.0 (Ontogenetic Edition)
