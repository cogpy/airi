/**
 * Aion, bound to an AtomSpace and a finite attention budget.
 *
 * This is where the character stops being a set of numbers and starts being a
 * loop. Aion perceives concepts into a hypergraph, chooses which perspective to
 * read that graph through, and reports what it finds important. The loop is
 * deterministic given a seed, so the same conversation produces the same mind
 * twice.
 *
 * The constraint that gives the character its shape is that adopting a
 * perspective is not free and is not destructive either: Aion pays for a new
 * lens by moving attention out of the bank and onto the atoms that lens
 * values. Perspective-taking is therefore redistribution, the ECAN ledger
 * stays balanced across it, and a mind that has spent its budget is left
 * genuinely unable to change its mind until rent returns some.
 *
 * Call stack:
 *
 * createAionMind
 *   -> {@link AionMind.perceive}    adds atoms, then stimulates them
 *   -> {@link AionMind.reframe}     scores every lens, invests in the winner
 *     -> {@link realizeRelevance}
 *   -> {@link AionMind.attend}      ranks atoms under the standing lens
 *   -> {@link AionMind.reflect}     reports measured state, not narration
 */

import type { Atom, AtomSpace, ECAN } from '@proj-airi/cognitive-airicog'

import type { AionLens, AionLensName } from './aion-lenses'
import type { AionCognitiveParameters, AionTraits } from './aion-persona'

import { createAtomSpace, createECAN } from '@proj-airi/cognitive-airicog'

import { AION_LENS_NAMES, AION_LENSES } from './aion-lenses'
import { createAionTraits, deriveCognitiveParameters } from './aion-persona'
import { realizeRelevance } from './aion-relevance'

/**
 * How many atoms a newly adopted lens invests in.
 *
 * Kept small on purpose. Spreading the framing budget across the whole space
 * would raise every atom equally and leave the new perspective indistinguish-
 * able from the old one; a narrow focus is what makes a reframing visible in
 * the attention values afterwards.
 */
const FOCUS_WIDTH = 3

/**
 * Fit scores this close together count as a tie, and playfulness decides.
 * Without a band, floating-point noise alone would settle which perspective
 * Aion takes.
 */
const FIT_TIE_BAND = 1e-6

// NOTICE:
// Duplicated from packages/motion-driver-magic/src/shared/random.ts.
// Root cause: that copy is a private module of a motion package and is not
// part of its public exports, so importing it would both reach past a package
// boundary and couple a character package to a motion driver.
// Source: packages/motion-driver-magic/src/shared/random.ts, createSeededRandom.
// Removal condition: delete this copy once a shared utility package owns a
// seeded PRNG. Worth proposing — three packages now want one.
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

/** One concept offered to Aion. */
export interface AionPerception {
  name: string
  /** How true the claim is taken to be, in [0, 1]. Defaults to 0.8. */
  strength?: number
  /** How settled that judgement is, in [0, 1]. Defaults to 0.5. */
  confidence?: number
  /** Names of concepts this one is associated with. Unknown names are added. */
  relatedTo?: string[]
  /**
   * Whether the conversation partner raised this, rather than Aion reaching it
   * alone. Partner concepts carry the empathy-derived social weight.
   */
  fromPartner?: boolean
}

export type AionReframingOutcome
  /** A different lens won by more than the switch threshold. */
  = | 'switched'
  /** A tie that playfulness resolved toward the untried lens. */
    | 'switched-on-play'
  /** The standing lens still reads this space best. */
    | 'held'
  /** A better lens existed, but there was no attention left to adopt it. */
    | 'budget-exhausted'

export interface AionReframing {
  outcome: AionReframingOutcome
  from: AionLensName
  to: AionLensName
  /** Fit of the adopted lens; see RelevanceResult.fit. */
  fit: number
  /** Importance moved from the bank onto the new focus. */
  invested: number
}

export interface AionReflection {
  lens: AionLensName
  /** How sharply the standing lens separates the current space. */
  lensFit: number
  /** Unallocated importance still held by the bank. */
  attentionBank: number
  /** Names of the atoms the standing lens ranks highest. */
  focus: string[]
  /** Lens changes so far, and how many of them playfulness decided. */
  reframings: number
  playfulReframings: number
  /** True once the bank can no longer fund a perspective change. */
  budgetExhausted: boolean
}

export interface AionMindOptions {
  traits?: Partial<AionTraits>
  /** Perspective to begin from. Defaults to enlightened confusion: paradox. */
  initialLens?: AionLensName
  /** Total importance the mind may hold. Passed through to ECAN. */
  attentionFunds?: number
  /** Fixes every stochastic choice, so a run is reproducible. */
  seed?: number
}

export class AionMind {
  readonly atomSpace: AtomSpace
  readonly ecan: ECAN
  readonly traits: AionTraits
  readonly parameters: AionCognitiveParameters

  private lens: AionLens
  private readonly partnerAtomIds = new Set<string>()
  private readonly random: () => number
  private reframings = 0
  private playfulReframings = 0

  constructor(options: AionMindOptions = {}) {
    this.traits = createAionTraits(options.traits)
    this.parameters = deriveCognitiveParameters(this.traits)
    this.atomSpace = createAtomSpace({ name: 'aion' })
    this.ecan = createECAN(this.atomSpace, options.attentionFunds === undefined
      ? undefined
      : { attentionFunds: options.attentionFunds })
    this.lens = AION_LENSES[options.initialLens ?? 'paradox']
    this.random = createSeededRandom(options.seed ?? 0x41494F4E)
  }

  /**
   * Adds concepts to the hypergraph and stimulates them, so that what was just
   * said starts out more important than what was said earlier. Association
   * names that do not exist yet are created, which lets a caller describe a
   * neighbourhood in one call.
   */
  perceive(perceptions: readonly AionPerception[]): Atom[] {
    const added: Atom[] = []

    for (const perception of perceptions) {
      const node = this.atomSpace.addNode(
        'ConceptNode',
        perception.name,
        {
          strength: perception.strength ?? 0.8,
          confidence: perception.confidence ?? 0.5,
        },
      )
      added.push(node)

      if (perception.fromPartner)
        this.partnerAtomIds.add(node.id)

      for (const relatedName of perception.relatedTo ?? []) {
        const related = this.atomSpace.getNode('ConceptNode', relatedName)
          ?? this.atomSpace.addNode('ConceptNode', relatedName)
        this.atomSpace.addLink('AssociativeLink', [node.id, related.id])
      }
    }

    // Reconcile first: addNode mints STI the bank never issued, and leaving
    // that unbilled would let perception inflate the economy.
    this.ecan.reconcile()
    for (const atom of added) {
      this.ecan.stimulate(atom.id, this.parameters.framingCost)
    }

    return added
  }

  /**
   * Scores every lens against the current space and adopts the best one, if it
   * is enough better and if there is attention left to pay for it.
   *
   * Considering a perspective is free; taking one is not. That asymmetry is
   * what lets Aion survey all six lenses at once — which is the whole claim the
   * character makes about itself — while still being unable to inhabit more
   * than its budget allows.
   */
  reframe(): AionReframing {
    const standing = this.lens.name
    const fits = new Map<AionLensName, number>()

    for (const name of AION_LENS_NAMES) {
      fits.set(name, realizeRelevance({
        atomSpace: this.atomSpace,
        lens: AION_LENSES[name],
        parameters: this.parameters,
        partnerAtomIds: this.partnerAtomIds,
      }).fit)
    }

    const standingFit = fits.get(standing) ?? 0
    let bestName = standing
    let bestFit = standingFit

    for (const name of AION_LENS_NAMES) {
      const fit = fits.get(name) ?? 0
      if (fit > bestFit + FIT_TIE_BAND) {
        bestName = name
        bestFit = fit
      }
    }

    const beatsThreshold
      = bestName !== standing
        && bestFit - standingFit > this.parameters.switchThreshold

    // A tie is where playfulness gets to act. Nothing separates the two
    // readings on the evidence, so the trait, not the data, decides whether to
    // try the other one.
    const tied = AION_LENS_NAMES.filter(name =>
      name !== standing && Math.abs((fits.get(name) ?? 0) - standingFit) <= FIT_TIE_BAND)
    const playing = !beatsThreshold
      && tied.length > 0
      && this.random() < this.traits.playfulness

    if (!beatsThreshold && !playing)
      return { outcome: 'held', from: standing, to: standing, fit: standingFit, invested: 0 }

    const target = playing
      ? tied[Math.floor(this.random() * tied.length)]
      : bestName

    const invested = this.investIn(AION_LENSES[target])
    if (invested <= 0) {
      return {
        outcome: 'budget-exhausted',
        from: standing,
        to: standing,
        fit: standingFit,
        invested: 0,
      }
    }

    this.lens = AION_LENSES[target]
    this.reframings++
    if (playing)
      this.playfulReframings++

    return {
      outcome: playing ? 'switched-on-play' : 'switched',
      from: standing,
      to: target,
      fit: fits.get(target) ?? 0,
      invested,
    }
  }

  /** The atoms the standing lens ranks highest. */
  attend(limit: number = FOCUS_WIDTH): Atom[] {
    return realizeRelevance({
      atomSpace: this.atomSpace,
      lens: this.lens,
      parameters: this.parameters,
      partnerAtomIds: this.partnerAtomIds,
    }).ranked.slice(0, limit)
  }

  currentLens(): AionLens {
    return this.lens
  }

  /**
   * Reports measured state. Every field is read from the AtomSpace or the
   * ledger, so this is an instrument rather than a narration.
   */
  reflect(): AionReflection {
    const realized = realizeRelevance({
      atomSpace: this.atomSpace,
      lens: this.lens,
      parameters: this.parameters,
      partnerAtomIds: this.partnerAtomIds,
    })

    return {
      lens: this.lens.name,
      lensFit: realized.fit,
      attentionBank: this.ecan.getAttentionBank(),
      focus: realized.ranked.slice(0, FOCUS_WIDTH).map(atom =>
        atom.kind === 'node' ? atom.name : atom.type),
      reframings: this.reframings,
      playfulReframings: this.playfulReframings,
      budgetExhausted: this.ecan.getAttentionBank() <= 0,
    }
  }

  dispose(): void {
    this.ecan.dispose()
    this.atomSpace.dispose()
  }

  /**
   * Moves the framing budget out of the bank and onto the atoms the incoming
   * lens ranks highest, and reports what actually arrived.
   *
   * The return value is what the ledger moved, not what was asked for: a
   * saturated atom or an empty bank fills the request only partly, and zero
   * means the perspective could not be afforded at all.
   */
  private investIn(lens: AionLens): number {
    const focus = realizeRelevance({
      atomSpace: this.atomSpace,
      lens,
      parameters: this.parameters,
      partnerAtomIds: this.partnerAtomIds,
    }).ranked.slice(0, FOCUS_WIDTH)

    if (focus.length === 0)
      return 0

    const perAtom = this.parameters.framingCost / focus.length
    let invested = 0
    for (const atom of focus) {
      invested += this.ecan.stimulate(atom.id, perAtom)
    }

    return invested
  }
}

export function createAionMind(options?: AionMindOptions): AionMind {
  return new AionMind(options)
}
