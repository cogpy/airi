/**
 * AiriCog Economic Attention Networks (ECAN)
 *
 * Implements attention allocation inspired by OpenCog's ECAN system.
 * Manages cognitive resources by distributing attention across the AtomSpace.
 */

import type { AtomSpace } from '../atomspace/atomspace'
import type { Atom, Link, LinkType } from '../atomspace/types'

import { quantizeAttention } from './quanta'

/**
 * ECAN Configuration
 */
export interface ECANConfig {
  /** Total importance the economy may hold, split between the bank and atoms */
  attentionFunds: number
  /** Rate at which attention is taxed from all atoms */
  taxRate: number
  /** Minimum STI for an atom to be in the attentional focus */
  attentionalFocusThreshold: number
  /** Maximum size of the attentional focus */
  attentionalFocusSize: number
  /** Rate of spreading activation */
  spreadingRate: number
  /** Decay factor for spreading */
  spreadingDecay: number
  /** Importance diffusion amount per step */
  diffusionAmount: number
  /** Wage paid to atoms for being accessed */
  accessWage: number
  /** Enable automatic attention updates */
  autoUpdate: boolean
  /** Update interval in milliseconds */
  updateInterval: number
}

/**
 * ECAN Statistics
 */
export interface ECANStats {
  /** Total attention allocated to atoms (the banked remainder is separate) */
  totalAttention: number
  /** Unallocated attention still held by the bank */
  attentionBank: number
  /** Number of atoms in attentional focus */
  focusSize: number
  /** Average STI in the focus */
  avgFocusSti: number
  /** Average STI outside focus */
  avgNonFocusSti: number
  /** Attention distribution entropy */
  entropy: number
}

/**
 * Importance spreading specification
 */
export interface ImportanceSpreadSpec {
  /** Source atom ID */
  sourceId: string
  /** Amount to spread */
  amount: number
  /** Link types to follow */
  linkTypes?: LinkType[]
  /** Maximum hops */
  maxHops?: number
}

/**
 * Economic Attention Network Manager
 *
 * ECAN is a closed economy over a fixed quantity of importance. Its ledger
 * invariant is:
 *
 *     attentionBank + sum(atom.attentionValue.sti) === attentionFunds
 *
 * Every operation on this class is a *transfer*: whatever leaves the bank
 * arrives on an atom, and whatever leaves an atom arrives in the bank or on
 * another atom. Nothing is created and nothing is destroyed. All transfers are
 * quantised onto the attention lattice (see `./quanta`) so the invariant holds
 * bit-exactly instead of drifting.
 *
 * Importance can still enter or leave through the AtomSpace directly — a new
 * atom is born with a default STI, `spreadActivation` boosts atoms, decay
 * shrinks them. Those movements have no banking counterpart, so
 * {@link ECAN.reconcile} re-derives the bank from the atoms and reports the
 * drift it absorbed. Over-allocation drives the bank negative, which throttles
 * further issuance rather than silently inflating the economy.
 */
export class ECAN {
  private atomSpace: AtomSpace
  private config: ECANConfig
  private updateTimer?: ReturnType<typeof setInterval>
  private attentionBank: number

  constructor(atomSpace: AtomSpace, config?: Partial<ECANConfig>) {
    this.atomSpace = atomSpace
    this.config = {
      attentionFunds: config?.attentionFunds ?? 1000,
      taxRate: config?.taxRate ?? 0.01,
      attentionalFocusThreshold: config?.attentionalFocusThreshold ?? 0.5,
      attentionalFocusSize: config?.attentionalFocusSize ?? 100,
      spreadingRate: config?.spreadingRate ?? 0.1,
      spreadingDecay: config?.spreadingDecay ?? 0.6,
      diffusionAmount: config?.diffusionAmount ?? 0.05,
      accessWage: config?.accessWage ?? 0.02,
      autoUpdate: config?.autoUpdate ?? false,
      updateInterval: config?.updateInterval ?? 100,
    }
    // The whole economy lives on the attention lattice, starting with the funds
    // themselves — an off-lattice total would make the invariant unstatable.
    this.config.attentionFunds = quantizeAttention(this.config.attentionFunds)
    this.attentionBank = this.config.attentionFunds

    if (this.config.autoUpdate) {
      this.startAutoUpdate()
    }
  }

  /**
   * Get the attentional focus.
   *
   * The focus is defined by *both* configured bounds at once: an atom is in
   * focus when its STI reaches `attentionalFocusThreshold` and it is among the
   * `attentionalFocusSize` most important atoms. This is the single definition
   * of focus in the system — {@link ECAN.isInFocus} and {@link ECAN.getStats}
   * are derived from it, so a member's STI can never exceed the focus average.
   *
   * Ordered by descending STI. Does not record an access, so inspecting the
   * focus does not itself earn the focus wages.
   */
  getAttentionalFocus(): Atom[] {
    return this.atomSpace
      .getAttentionalFocus(this.config.attentionalFocusSize)
      .filter(atom => atom.attentionValue.sti >= this.config.attentionalFocusThreshold)
  }

  /**
   * Check if an atom is in the attentional focus.
   *
   * Unknown ids are simply not in focus. Costs a whole focus computation, so
   * prefer {@link ECAN.getAttentionalFocus} when testing more than one atom.
   */
  isInFocus(atomId: string): boolean {
    return this.getAttentionalFocus().some(atom => atom.id === atomId)
  }

  /**
   * Stimulate an atom, moving importance from the bank onto it.
   *
   * The grant is capped by the bank balance and by the atom's remaining
   * headroom, so a request is only partially filled when either runs out.
   * Unknown ids and non-positive amounts are no-ops.
   *
   * Returns the importance actually transferred, which is exactly what left
   * the bank — the caller cannot assume it got what it asked for.
   */
  stimulate(atomId: string, amount: number = 0.1): number {
    const atom = this.atomSpace.getAtom(atomId)
    if (!atom)
      return 0

    const granted = this.withdraw(atom, amount)
    if (granted <= 0)
      return 0

    // Repeated stimulation is what makes an atom persistently, rather than
    // momentarily, important. LTI is a memory of that history, not currency,
    // so it is not part of the conserved sum.
    atom.attentionValue.lti = quantizeAttention(
      Math.min(1, atom.attentionValue.lti + granted * 0.1),
    )

    return granted
  }

  /**
   * Inhibit an atom, returning importance from it to the bank.
   *
   * An atom cannot repay more than it holds, so STI never goes negative and
   * the return value is exactly what reached the bank. Unknown ids and
   * non-positive amounts are no-ops.
   */
  inhibit(atomId: string, amount: number = 0.1): number {
    const atom = this.atomSpace.getAtom(atomId)
    if (!atom)
      return 0

    const reclaimed = quantizeAttention(
      Math.min(Math.max(0, amount), atom.attentionValue.sti),
    )
    if (reclaimed <= 0)
      return 0

    atom.attentionValue.sti = quantizeAttention(atom.attentionValue.sti - reclaimed)
    this.attentionBank = quantizeAttention(this.attentionBank + reclaimed)

    return reclaimed
  }

  /**
   * Spread importance from a source atom to connected atoms.
   *
   * Spreading is performed by the AtomSpace, which boosts atoms without
   * consulting the bank and off the attention lattice, so the result is
   * reconciled afterwards: the boosted atoms are projected back onto the
   * lattice and the importance they gained is charged to the bank. Inspect
   * {@link ECAN.getAttentionBank} to see what the spread cost.
   */
  spreadImportance(spec: ImportanceSpreadSpec): void {
    const { sourceId, amount, linkTypes, maxHops = 3 } = spec

    this.atomSpace.spreadActivation(sourceId, {
      intensity: amount,
      decay: this.config.spreadingDecay,
      maxHops,
      followLinks: linkTypes,
      minSti: 0.01,
    })

    // NOTICE:
    // Reconciled rather than billed for a measured delta.
    // Root cause: boostAttention writes arbitrary floats, so the minted amount
    // is off-lattice; debiting a quantised approximation of it would leave
    // behind the very sub-quantum drift the lattice exists to eliminate.
    // Reconciliation projects the atoms first, then derives the bank from
    // them, so the charge is exact by construction.
    // Removal condition: delete when AtomSpace boosts on the lattice itself.
    this.reconcile()
  }

  /**
   * Run one attention allocation step.
   *
   * Reconciliation comes first so the step budgets against what the AtomSpace
   * actually holds, rather than against a bank balance that atom creation,
   * decay or spreading may have invalidated since the last step.
   */
  step(): void {
    this.reconcile()
    this.collectTax()
    this.diffuseImportance()
    this.updateLTI()
    this.payAccessWages()
  }

  /**
   * Re-derive the bank from the atoms, absorbing importance that entered or
   * left the economy without a banking counterpart.
   *
   * Every atom's STI is projected onto the attention lattice and clamped to
   * [0, 1], after which `bank + sum(sti) === attentionFunds` holds exactly.
   * {@link ECAN.step} does this for you.
   *
   * Returns the signed change to the bank: negative means the AtomSpace minted
   * importance ECAN never issued, positive means importance vanished from
   * atoms without being repaid.
   */
  reconcile(): number {
    let allocated = 0

    for (const atom of this.atomSpace.getAllAtoms()) {
      const sti = quantizeAttention(
        Math.min(1, Math.max(0, atom.attentionValue.sti)),
      )
      atom.attentionValue.sti = sti
      allocated += sti
    }

    const reconciled = quantizeAttention(this.config.attentionFunds - allocated)
    const drift = quantizeAttention(reconciled - this.attentionBank)
    this.attentionBank = reconciled

    return drift
  }

  /**
   * Collect rent from the atoms occupying the attentional focus.
   *
   * Rent is charged to focus members only, which is what makes the focus
   * expensive to hold and therefore self-limiting; atoms outside it are idle
   * and cost nothing.
   */
  private collectTax(): void {
    for (const atom of this.getAttentionalFocus()) {
      const rent = quantizeAttention(atom.attentionValue.sti * this.config.taxRate)
      if (rent <= 0)
        continue

      atom.attentionValue.sti = quantizeAttention(atom.attentionValue.sti - rent)
      this.attentionBank = quantizeAttention(this.attentionBank + rent)
    }
  }

  /**
   * Diffuse importance from links in the focus onto the atoms they connect.
   *
   * This is an atom-to-atom transfer that never touches the bank: a link is
   * debited exactly the total its targets accepted, so targets that are already
   * saturated leave the importance with the link rather than annihilating it.
   */
  private diffuseImportance(): void {
    for (const atom of this.getAttentionalFocus()) {
      if (atom.kind !== 'link')
        continue

      const link = atom as Link
      // NOTICE:
      // A link with no outgoing atoms has nowhere to diffuse to.
      // Root cause: `budget / link.outgoing.length` is a division by zero, and
      // the old code debited the source regardless of whether the loop over
      // `outgoing` ran at all, so an empty link silently destroyed importance.
      // Source: `AtomSpace.addLink` accepts an empty `outgoing` array — its
      // existence check iterates the array and so passes vacuously.
      // Removal condition: delete when empty links are rejected at creation.
      if (link.outgoing.length === 0)
        continue

      const budget = quantizeAttention(
        link.attentionValue.sti * this.config.diffusionAmount,
      )
      if (budget <= 0)
        continue

      const share = quantizeAttention(budget / link.outgoing.length)
      if (share <= 0)
        continue

      let delivered = 0
      for (const targetId of link.outgoing) {
        const target = this.atomSpace.getAtom(targetId)
        if (!target)
          continue

        const accepted = Math.min(share, 1 - target.attentionValue.sti)
        if (accepted <= 0)
          continue

        target.attentionValue.sti = quantizeAttention(
          target.attentionValue.sti + accepted,
        )
        delivered = quantizeAttention(delivered + accepted)
      }

      link.attentionValue.sti = quantizeAttention(
        link.attentionValue.sti - delivered,
      )
    }
  }

  /**
   * Update Long-Term Importance based on access patterns
   */
  private updateLTI(): void {
    const now = Date.now()
    const focus = this.getAttentionalFocus()

    for (const atom of focus) {
      // Increase LTI for recently accessed atoms
      const timeSinceAccess = now - atom.lastAccessedAt
      if (timeSinceAccess < 1000) {
        // Accessed in last second
        atom.attentionValue.lti = Math.min(
          1,
          atom.attentionValue.lti + 0.01,
        )
      }

      // Gradually increase VLTI for high LTI atoms
      if (atom.attentionValue.lti > 0.8) {
        atom.attentionValue.vlti = Math.min(
          1,
          atom.attentionValue.vlti + 0.001,
        )
      }
    }
  }

  /**
   * Pay wages from the bank to atoms that were used recently.
   *
   * The wage is a bank withdrawal like any other, so an atom near saturation
   * is paid only what it can hold and the remainder stays in the bank.
   */
  private payAccessWages(): void {
    const now = Date.now()

    for (const atom of this.getAttentionalFocus()) {
      if (now - atom.lastAccessedAt >= 100)
        continue
      this.withdraw(atom, this.config.accessWage)
    }
  }

  /**
   * Move importance from the bank onto an atom, in whole attention quanta.
   *
   * The grant is the smallest of what was asked for, what the bank holds, and
   * what the atom can still accept. Debit and credit are the same quantised
   * value, which is what keeps the ledger invariant exact — the old code
   * debited the full request and credited a clamped sum, destroying the
   * difference.
   *
   * Transfers 0 when the bank is empty, the atom is saturated, or the request
   * was not positive.
   */
  private withdraw(atom: Atom, requested: number): number {
    const granted = quantizeAttention(
      Math.min(requested, this.attentionBank, 1 - atom.attentionValue.sti),
    )
    if (granted <= 0)
      return 0

    this.attentionBank = quantizeAttention(this.attentionBank - granted)
    atom.attentionValue.sti = quantizeAttention(atom.attentionValue.sti + granted)

    return granted
  }

  /**
   * Get ECAN statistics.
   *
   * Focus membership is resolved once, from {@link ECAN.getAttentionalFocus},
   * and both the focus sum and the focus count are taken from that same set.
   *
   * ROOT CAUSE (fixed here):
   *
   * The focus sum used to be accumulated over threshold members while the
   * divisor was the size of the top-N set, so with more above-threshold atoms
   * than the focus can hold, `avgFocusSti` exceeded the 1.0 maximum its own
   * type documents.
   */
  getStats(): ECANStats {
    const focus = this.getAttentionalFocus()
    const focusIds = new Set(focus.map(atom => atom.id))
    // Reading statistics is not cognitive activity, so this must not stamp
    // `lastAccessedAt` the way `query` does — that would earn every atom the
    // access wage merely for having been counted.
    const allAtoms = this.atomSpace.getAllAtoms()

    let totalAttention = 0
    let focusStiSum = 0
    let nonFocusStiSum = 0
    let nonFocusCount = 0

    for (const atom of allAtoms) {
      totalAttention += atom.attentionValue.sti

      if (focusIds.has(atom.id)) {
        focusStiSum += atom.attentionValue.sti
      }
      else {
        nonFocusStiSum += atom.attentionValue.sti
        nonFocusCount++
      }
    }

    // Calculate entropy
    let entropy = 0
    if (totalAttention > 0) {
      for (const atom of allAtoms) {
        const p = atom.attentionValue.sti / totalAttention
        if (p > 0) {
          entropy -= p * Math.log2(p)
        }
      }
    }

    return {
      totalAttention,
      attentionBank: this.attentionBank,
      focusSize: focus.length,
      avgFocusSti: focus.length > 0 ? focusStiSum / focus.length : 0,
      avgNonFocusSti: nonFocusCount > 0 ? nonFocusStiSum / nonFocusCount : 0,
      entropy,
    }
  }

  /**
   * Get the unallocated importance currently held by the bank.
   *
   * A negative balance is meaningful: it says the AtomSpace holds more
   * importance than the economy issued, and issuance stays blocked until rent
   * or inhibition brings it back above zero.
   */
  getAttentionBank(): number {
    return this.attentionBank
  }

  /**
   * Get the total importance this economy may hold across bank and atoms.
   */
  getAttentionFunds(): number {
    return this.config.attentionFunds
  }

  /**
   * Issue new importance into the economy.
   *
   * The amount is added to both the bank and the total funds, because raising
   * the balance alone would break the ledger invariant. Negative amounts are
   * no-ops.
   */
  deposit(amount: number): void {
    const issued = quantizeAttention(Math.max(0, amount))
    if (issued <= 0)
      return

    this.config.attentionFunds = quantizeAttention(
      this.config.attentionFunds + issued,
    )
    this.attentionBank = quantizeAttention(this.attentionBank + issued)
  }

  /**
   * Start automatic attention updates
   */
  private startAutoUpdate(): void {
    this.updateTimer = setInterval(() => {
      this.step()
    }, this.config.updateInterval)
  }

  /**
   * Stop automatic attention updates
   */
  stopAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = undefined
    }
  }

  /**
   * Dispose of ECAN and clean up resources
   */
  dispose(): void {
    this.stopAutoUpdate()
  }
}

/**
 * Create a new ECAN instance
 */
export function createECAN(atomSpace: AtomSpace, config?: Partial<ECANConfig>): ECAN {
  return new ECAN(atomSpace, config)
}

/**
 * Relevance realization - determine what's important in context
 * Inspired by John Vervaeke's cognitive science framework
 */
export class RelevanceRealization {
  private ecan: ECAN
  private atomSpace: AtomSpace

  constructor(ecan: ECAN, atomSpace: AtomSpace) {
    this.ecan = ecan
    this.atomSpace = atomSpace
  }

  /**
   * Determine relevance of atoms to a given context
   */
  realizeRelevance(
    contextAtomIds: string[],
  ): Map<string, number> {
    const relevanceScores = new Map<string, number>()

    // Spread activation from context atoms
    for (const contextId of contextAtomIds) {
      const activation = this.atomSpace.spreadActivation(contextId, {
        intensity: 0.5,
        decay: 0.7,
        maxHops: 5,
        minSti: 0.05,
      })

      // Accumulate relevance scores
      for (const [atomId, level] of activation) {
        const current = relevanceScores.get(atomId) ?? 0
        relevanceScores.set(atomId, current + level)
      }
    }

    // Normalize scores.
    // NOTICE:
    // Folded rather than spread into `Math.max`.
    // Root cause: `Math.max(...map.values())` passes one argument per activated
    // atom, and a wide activation front exceeds the engine's argument limit
    // with a RangeError instead of returning a maximum.
    // Removal condition: never — the fold is also the cheaper form.
    let maxScore = 0.001
    for (const score of relevanceScores.values()) {
      if (score > maxScore)
        maxScore = score
    }
    for (const [atomId, score] of relevanceScores) {
      relevanceScores.set(atomId, score / maxScore)
    }

    // Stimulate highly relevant atoms
    for (const [atomId, score] of relevanceScores) {
      if (score > 0.5) {
        this.ecan.stimulate(atomId, score * 0.1)
      }
    }

    return relevanceScores
  }

  /**
   * Get the most relevant atoms for a context
   */
  getMostRelevant(contextAtomIds: string[], limit: number = 10): Atom[] {
    const scores = this.realizeRelevance(contextAtomIds)
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])

    const results: Atom[] = []
    for (const [atomId] of sorted.slice(0, limit)) {
      const atom = this.atomSpace.getAtom(atomId)
      if (atom) {
        results.push(atom)
      }
    }

    return results
  }
}

/**
 * Create a RelevanceRealization instance
 */
export function createRelevanceRealization(
  ecan: ECAN,
  atomSpace: AtomSpace,
): RelevanceRealization {
  return new RelevanceRealization(ecan, atomSpace)
}
