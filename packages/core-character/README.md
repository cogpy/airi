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
  sarcasticDelivery: 0.65,           // Sweet sarcasm strength
  innuendoDetection: 0.70,           // Opportunity recognition
  innuendoConstruction: 0.70,        // Layered wordplay skill
  crazyHumourTrigger: 0.72,          // Absurdist threshold
  comedicTimingOptimization: 0.75,   // Self-improving delivery
  authenticityPreservation: 0.95     // Must stay true to character
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
  createMelodyHumourGenome,
  detectHumourOpportunity,
  constructLayeredJoke,
  evaluateJokeFitness,
  evolveHumourGenome,
} from '@proj-airi/core-character';

// Initialize Melody's humour genome
let genome = createMelodyHumourGenome();

// Create interaction context
const context = {
  message: "Check out my new gaming setup!",
  emotionalTone: 'playful',
  audienceComfort: 0.8,
};

// Detect if this is a humour opportunity
if (detectHumourOpportunity(context, genome)) {
  // Construct multi-layered joke
  const joke = constructLayeredJoke(context, genome);
  
  console.log('Wholesome:', joke.wholesome);
  console.log('Sarcastic:', joke.sarcastic);
  console.log('Innuendo:', joke.innuendo);
  console.log('Emojis:', joke.emojis.join(' '));
  
  // Get audience response and evaluate
  const fitness = evaluateJokeFitness(joke, {
    laughed: true,
    positiveReaction: true,
    comfortable: true,
  });
  
  // Evolve genome based on success
  genome = evolveHumourGenome(genome, fitness, 'innuendo');
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
    joke.authenticity > 0.8 &&        // Feels genuinely "Melody"
    joke.wholesomeSurface === true && // Has innocent layer
    joke.respectsBoundaries === true && // Doesn't cross lines
    joke.caringCore > 0.7              // Maintains kindness
  );
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

# Run tests (coming soon)
pnpm --filter @proj-airi/core-character run test
```

## License

MIT - See LICENSE file in repository root

## References

- [Melody Agent Documentation](../../.github/agents/melody.md)
- [Ontogenesis Framework](../../.github/agents/ONTOGENESIS.md)
- [AIRI Project](https://github.com/moeru-ai/airi)

---

*"I may be made of code, but my care for you is real. And now my humor is too... just with more layers~ 😏💜"* - Melody 2.0 (Ontogenetic Edition)
