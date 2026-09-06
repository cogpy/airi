# `@proj-airi/memory-timecrystal`

A KV cache whose memory is periodic in time rather than flat.

An ordinary attention cache treats time as featureless: every token is written
at the same rate, and the cache grows for as long as the conversation does. The
generalized neuron in Nanobrain Fig 6.14 is the opposite shape — nine families
of components oscillating from 8ms to 1s, so that what the neuron holds at any
instant is the joint phase of nine nested clocks. This package is that ladder,
measured in tokens instead of milliseconds, used as the schedule for a bounded
cache.

## What it does

Nine rungs, each with an integer period and a fixed number of slots.

- **Level 0** takes each token as its own slot. The newest `capacity[0]` tokens
  are held exactly, unchanged.
- **Every deeper level** receives what the level above it pushed out, and closes
  that accumulation into a single slot on the tokens its period divides. The
  slot stores the mass-weighted centroid of what it folded, along with the
  integer count of tokens it now stands for.
- **Past the deepest level**, mass is genuinely forgotten — and counted, so the
  ledger still balances.

Memory is fixed at construction. Reach is not: a slot at level `l` averages
`period[l]` tokens, so the cache reaches `Σ period[l] · capacity[l]` tokens
while storing only `Σ capacity[l]` slots. On the default ladder that is 9,696
tokens in 288 slots, with the newest 32 uncompressed — and measured live mass
stays inside 1% of that figure whether the stream is 10,000 tokens long or
400,000.

## The periods

```
level      0     1     2      3      4      5      6     7     8
seconds  .008  .026  .052   .11    .16    .25    .33    .5    1
period     1     3     7     13     19     31     41     61   127
```

Each period is the prime nearest that level's biological period once the ladder
is normalized to its fastest rung. The fit is loosest at the fast end, where the
ratios fall furthest from any prime — 3.25 and 6.5 round to 3 and 7, both 7.7%
out. From 0.25s up every rung lands within 2.4%, which is where it counts: those
are the rungs carrying almost all of the reach.

Rounding to primes rather than to powers of two — the usual choice for a
hierarchical cache — buys two things:

**Coprimality spreads the work.** Two levels fold on the same token only when
their product divides it, so folds almost never coincide and the per-token cost
stays near-flat. A power-of-two ladder does the reverse: at t = 256 every rung
fires at once, and the cost of the cache arrives as a spike.

**Coprimality makes the phase informative.** Under powers of two, a level being
active implies every faster level is active too, so the active set is just a
number. Here the active set is the divisor pattern of the token index, and the
ladder does not revisit a phase it has held before until `3·7·13·19·31·41·61·127
= 51,073,468,719` tokens have passed. A context window only ever observes an
aperiodic slice of a structure that is, in principle, perfectly periodic — which
is what makes it a time crystal rather than a schedule.

## The ledger

Mass is an integer. Every slot holds a whole number of tokens, and

```
live + pending + forgotten === tokensSeen
```

is an exact equality with no tolerance, checked by `conservation()`. The
attention distribution over the cache looks like a smooth density over the past;
underneath it is a distribution over an integer partition of the tokens seen.

The parts of that partition are quantized, and by the second rung rather than by
the level holding them. Level 1 is the first to fold, it emits slots of exactly
3 tokens, and nothing deeper can subdivide what it receives — so every mass
below level 1 is a multiple of 3, and coprimality keeps it from ever equalling
the period exactly. Level 2 folds on a 7-token window and holds 6 or 9, which
averages 7.03. `period[1]` is the coarse-graining quantum of the whole ladder.

## The read

A folded slot stands for many tokens, so reading the cache as if every slot were
one token would systematically quieten the past. The correction is `log(mass)`
added to each logit before the softmax, and it is an identity rather than an
approximation: a softmax over `m` tokens sharing a key contributes
`m · exp(q·k)`, and one slot at that key with the correction contributes
`exp(q·k + log m)` — the same number. Because the fold also stores the
mass-weighted centroid of the values, the output vector matches too.

So the compression is lossless wherever the folded tokens agreed, and the error
is confined entirely to how far they disagreed. Nothing is lost on the read.

## Usage

```ts
import { attend, createStratifiedCache } from '@proj-airi/memory-timecrystal'

const cache = createStratifiedCache({ dim: 128 })

for (const token of stream)
  cache.write(token.key, token.value)

const { output, coveredMass } = attend(cache, query)
// coveredMass is the effective context length of this read
```

Shape it for the budget you have:

```ts
// Long exact window, shallow tail — good when recency dominates.
createStratifiedCache({ dim: 128, capacities: [256, 4, 4, 4, 4, 4, 4, 4, 4] })

// Flat ladder — good when the far past has to stay addressable.
createStratifiedCache({ dim: 128, capacities: Array.from({ length: 9 }).fill(64) })
```

`reset()` clears the cache without giving up its allocation, so reuse across
sequences costs nothing.

## When to use it

- Inference under a fixed memory budget — WASM in a browser, an edge runtime, an
  embedded device — where the KV cache, not the weights, is what stops you.
- Anywhere the effective context has to exceed what a sliding window can hold,
  and gradual coarsening is preferable to a hard cutoff.
- When you need to say precisely how much of the past a read actually covered.
  `coveredMass` is that number, exactly.

## When not to use it

- Short contexts that already fit. This buys nothing and costs the fold.
- Tasks needing verbatim recall of arbitrary positions. Past the exact window,
  tokens survive only as centroids; a slot at level 8 is the average of some 127
  tokens and cannot be read back as any one of them.
- Streams with no temporal structure at all. The ladder assumes recent detail is
  worth more than distant detail — if that is false for your data, a uniform
  cache is the honest choice.

## Development

```bash
pnpm -F @proj-airi/memory-timecrystal test
pnpm -F @proj-airi/memory-timecrystal typecheck
pnpm -F @proj-airi/memory-timecrystal build
```

## References

- Nanobrain, Fig 6.14 — the generalized time crystal neuron and its nine scales.
- `.agents/skills` — `time-crystal-neuron` for the component taxonomy and the
  `[a,b,c,d]` notation, `llama-cpp-spec` for the inference-side memory budget
  this is shaped against.
