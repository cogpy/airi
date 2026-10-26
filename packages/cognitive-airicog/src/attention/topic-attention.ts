import type { Link } from '../atomspace/types'
import type { InitiativeCandidate } from '../initiative/initiative'

import { AtomSpace } from '../atomspace/atomspace'
import { reviseTruthValues } from '../atomspace/types'
import { TVFormulas } from '../reasoning/pln'
import { ECAN } from './ecan'

export interface TopicAttentionConfig {
  /**
   * Two topics noticed within this time of each other become associated.
   * Raise it to link topics across a slower conversation.
   *
   * @default 120000
   */
  coMentionWindowMs: number
  /**
   * Share of a notice's salience that spreads to associated topics. Raise it
   * so a mention brings related topics to mind more strongly.
   *
   * @default 0.5
   */
  spreadRatio: number
  /**
   * Least short-term importance for a topic to count as on her mind. Lower
   * it to keep topics in focus longer as they decay.
   *
   * @default 0.1
   */
  focusThreshold: number
  /**
   * Most topics held in focus at once.
   *
   * @default 20
   */
  focusSize: number
  /**
   * Share of its importance that a topic in focus pays each step. Raise it
   * so topics leave focus sooner.
   *
   * @default 0.02
   */
  decayRate: number
}

export function createDefaultTopicAttentionConfig(): TopicAttentionConfig {
  return {
    coMentionWindowMs: 120_000,
    spreadRatio: 0.5,
    focusThreshold: 0.1,
    focusSize: 20,
    decayRate: 0.02,
  }
}

/** A topic associated with another, and how firmly. */
export interface TopicAssociation {
  topic: string
  /** Confidence that the two belong together, `0` to `1`. It grows with each co-mention. */
  strength: number
  /** Whether PLN deduction inferred it, without the two ever coming up together. */
  inferred: boolean
}

/** Evidence that one co-mention adds to an association. */
const CO_MENTION_EVIDENCE = { strength: 1, confidence: 0.2 }
/** Least confidence an inferred association needs to be kept. */
const MIN_INFERRED_CONFIDENCE = 0.02

/**
 * What is on the character's mind: the topics of a conversation as concepts
 * in an AtomSpace, with an attention economy (ECAN) over them.
 *
 * A noticed topic is stimulated. Topics that come up close together are
 * linked by an `AssociativeLink`, whose strength grows with each co-mention.
 * Noticing a topic also spreads importance along its links, so it brings
 * associated topics to mind. Each {@link step} charges rent to the topics in
 * focus, so a topic nobody mentions fades out of focus.
 *
 * When two topics become associated, PLN deduction infers weaker associations
 * across them: A~B and B~C give A~C. An inferred association becomes a direct
 * one when the two topics later come up together.
 *
 * Topic names are the identity: candidates carry the topic name as `atomId`,
 * like episodes do, so both sources score the same subject.
 */
export class TopicAttention {
  readonly atomSpace: AtomSpace
  readonly ecan: ECAN
  private readonly config: TopicAttentionConfig
  private lastNotice: { atomId: string, at: number } | undefined

  constructor(config: Partial<TopicAttentionConfig> = {}) {
    this.config = { ...createDefaultTopicAttentionConfig(), ...config }
    this.atomSpace = new AtomSpace({ name: 'topic-attention' })
    this.ecan = new ECAN(this.atomSpace, {
      attentionalFocusThreshold: this.config.focusThreshold,
      attentionalFocusSize: this.config.focusSize,
      taxRate: this.config.decayRate,
      // Links carry no importance here, so there is nothing to diffuse.
      diffusionAmount: 0,
      accessWage: 0,
    })
  }

  /**
   * Notes that `topic` came up at `at` with `salience` (`0` to `1`).
   *
   * Notices must arrive in time order. A notice older than the previous one
   * still stimulates its topic, but links nothing.
   */
  notice(topic: string, salience: number, at: number): void {
    const name = topic.trim()
    if (!name)
      return
    const amount = Number.isFinite(salience) ? Math.min(1, Math.max(0, salience)) : 0

    // New concepts start without importance, so creating one mints none.
    const node = this.atomSpace.getNode('ConceptNode', name)
      ?? this.atomSpace.addNode('ConceptNode', name, undefined, { sti: 0, lti: 0, vlti: 0 })
    this.ecan.stimulate(node.id, amount)
    const noticed = node.attentionValue.sti

    const previous = this.lastNotice
    if (previous && previous.atomId !== node.id && at >= previous.at && at - previous.at <= this.config.coMentionWindowMs)
      this.associate(previous.atomId, node.id)
    if (!previous || at >= previous.at)
      this.lastNotice = { atomId: node.id, at }

    if (amount <= 0)
      return
    this.ecan.spreadImportance({
      sourceId: node.id,
      amount: amount * this.config.spreadRatio,
      linkTypes: ['AssociativeLink'],
      maxHops: 2,
    })
    // Spreading starts by boosting the source itself. The notice already paid
    // for the source, so it keeps only what stimulation granted.
    const excess = node.attentionValue.sti - noticed
    if (excess > 0)
      this.ecan.inhibit(node.id, excess)
  }

  /** One attention step: topics in focus pay rent, so unmentioned ones fade. */
  step(): void {
    this.ecan.step()
  }

  /** The topics in focus, most important first, as initiative candidates. */
  candidates(): InitiativeCandidate[] {
    return this.ecan.getAttentionalFocus()
      .filter(atom => atom.kind === 'node')
      .map(atom => ({ atomId: (atom as { name: string }).name, salience: atom.attentionValue.sti }))
  }

  /** Topics associated with `topic`, strongest first. */
  associations(topic: string): TopicAssociation[] {
    const node = this.atomSpace.getNode('ConceptNode', topic.trim())
    if (!node)
      return []

    const associations: TopicAssociation[] = []
    for (const link of this.linksOf(node.id)) {
      const other = this.atomSpace.getAtom(otherEnd(link, node.id))
      if (other?.kind === 'node')
        associations.push({ topic: other.name, strength: link.truthValue.confidence, inferred: link.metadata?.inferred === true })
    }
    return associations.sort((a, b) => b.strength - a.strength)
  }

  /**
   * Removes topics that left focus and are not in `retain`, with their links.
   * Keeps a long session from holding every passing topic.
   */
  prune(retain: ReadonlySet<string> = new Set()): void {
    for (const atom of this.atomSpace.query({ kind: 'node', nodeType: 'ConceptNode' })) {
      if (atom.kind !== 'node' || retain.has(atom.name))
        continue
      if (atom.attentionValue.sti < this.config.focusThreshold)
        this.atomSpace.removeAtom(atom.id)
    }
    if (this.lastNotice && !this.atomSpace.getAtom(this.lastNotice.atomId))
      this.lastNotice = undefined
    this.ecan.reconcile()
  }

  dispose(): void {
    this.ecan.dispose()
    this.atomSpace.dispose()
  }

  private associate(fromId: string, toId: string): void {
    const existing = this.linkBetween(fromId, toId)
    const truthValue = existing ? reviseTruthValues(existing.truthValue, CO_MENTION_EVIDENCE) : CO_MENTION_EVIDENCE
    const link = this.atomSpace.addLink('AssociativeLink', [fromId, toId].sort(), truthValue, { sti: 0, lti: 0, vlti: 0 }, { inferred: false })
    if (!existing || existing.metadata?.inferred === true)
      this.inferAcross(link)
  }

  /**
   * PLN deduction across a new direct association A~B: each other association
   * of B gives A~C, and each other association of A gives C~B. An existing
   * association is left as it is.
   */
  private inferAcross(link: Link): void {
    for (const end of link.outgoing) {
      const middle = otherEnd(link, end)
      for (const next of this.linksOf(middle)) {
        if (next.id === link.id || next.metadata?.inferred === true)
          continue
        const far = otherEnd(next, middle)
        if (far === end || this.linkBetween(end, far))
          continue
        const truthValue = TVFormulas.deduction(link.truthValue, next.truthValue)
        if (truthValue.confidence >= MIN_INFERRED_CONFIDENCE)
          this.atomSpace.addLink('AssociativeLink', [end, far].sort(), truthValue, { sti: 0, lti: 0, vlti: 0 }, { inferred: true })
      }
    }
  }

  private linksOf(atomId: string): Link[] {
    return this.atomSpace.query({ kind: 'link', linkType: 'AssociativeLink' })
      .filter((atom): atom is Link => atom.kind === 'link' && atom.outgoing.includes(atomId))
  }

  private linkBetween(a: string, b: string): Link | undefined {
    return this.linksOf(a).find(link => link.outgoing.includes(b))
  }
}

/** The other atom of a two-atom link. */
function otherEnd(link: Link, atomId: string): string {
  return link.outgoing[0] === atomId ? link.outgoing[1]! : link.outgoing[0]!
}

export function createTopicAttention(config?: Partial<TopicAttentionConfig>): TopicAttention {
  return new TopicAttention(config)
}
