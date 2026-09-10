/**
 * A KV cache stratified across the period ladder.
 *
 * The ordinary cache keeps every token at full resolution and grows without
 * bound; the usual fix is a sliding window, which keeps recent tokens exactly
 * and drops the rest. This keeps recent tokens exactly and *coarsens* the rest,
 * one rung at a time, so that memory is fixed at construction while reach grows
 * with the sum of the periods rather than with the number of slots.
 *
 * The cascade is the whole mechanism. Level 0 takes each token as its own slot.
 * When a level's ring is full, its oldest slot is not discarded but poured into
 * the next level's accumulator, and that accumulator becomes a slot only on the
 * tokens that level's period divides. So mass moves downward through the ladder
 * and is never created; a slot at level `l` is the mass-weighted centroid of
 * the tokens it came to stand for, `period[l]` of them on average.
 *
 * Those masses are quantized, and by the second rung rather than by the level
 * itself: level 1 is the first to fold, it emits slots of exactly 3 tokens, and
 * no deeper level can subdivide what it receives. So every mass below level 1
 * is a multiple of 3, and coprimality keeps it from ever being the period
 * exactly — level 2 folds on a 7-token window and holds 6 or 9. The coarse-
 * graining quantum of the whole ladder is set by `period[1]`.
 *
 * What makes this auditable rather than merely plausible is that mass is an
 * integer. Every slot's mass is a whole number of tokens, the masses partition
 * the token count exactly, and {@link StratifiedCache.conservation} is a bit-exact
 * equality rather than a tolerance. The attention distribution over the cache
 * looks like a smooth density over the past; underneath it is a distribution
 * over an integer partition of the tokens seen.
 *
 * Call stack:
 *
 * createStratifiedCache
 *   -> {@link StratifiedCache.write}      one token in
 *     -> push level 0, cascading on overflow
 *     -> fold each level whose period divides the token index
 *   -> {@link StratifiedCache.forEachOccupied}   read side; see ./attend
 *   -> {@link StratifiedCache.conservation}      the ledger
 */

import { isPeriodActive, TIME_CRYSTAL_PERIODS } from './ladder'

/** One slot's contents, copied out for inspection. */
export interface StratumSlot {
  level: number
  /** Mass-weighted centroid of the keys this slot stands for. */
  key: Float32Array
  /** Mass-weighted centroid of the corresponding values. */
  value: Float32Array
  /**
   * How many original tokens this slot represents. Always a positive integer,
   * and below level 1 always a multiple of `period[1]`.
   */
  mass: number
  /** Token index of the earliest token folded into this slot. */
  firstToken: number
  /** Token index of the latest. Equal to firstToken at level 0. */
  lastToken: number
}

/**
 * The ledger. Masses are integers, so these four numbers satisfy
 * `live + pending + forgotten === tokensSeen` exactly, with no tolerance.
 */
export interface StratifiedConservation {
  /** Mass held in closed slots, across every level. */
  live: number
  /** Mass sitting in level accumulators, not yet closed into a slot. */
  pending: number
  /** Mass evicted past the deepest level. Genuinely lost, and counted as such. */
  forgotten: number
  /** Tokens written since construction or the last reset. */
  tokensSeen: number
  /** True when the three parts account for every token. */
  balanced: boolean
}

export interface StratifiedCacheOptions {
  /** Width of the key and value vectors. */
  dim: number
  /** Slots per level. Defaults to 32 on every rung of the standard ladder. */
  capacities?: readonly number[]
  /** Token periods per level. Defaults to {@link TIME_CRYSTAL_PERIODS}. */
  periods?: readonly number[]
}

/** Slots per level when the caller does not say. */
const DEFAULT_CAPACITY_PER_LEVEL = 32

export class StratifiedCache {
  readonly dim: number
  readonly periods: readonly number[]
  readonly capacities: readonly number[]
  /** Global index of level `l`'s first slot. Length is levels + 1; last entry is the total. */
  readonly offsets: readonly number[]
  readonly totalSlots: number

  // Slot storage. Keys and values are float32 because the cache exists to fit
  // in a memory budget; masses and token indices are float64 so that integers
  // up to 2^53 stay exact, which is what makes the ledger an equality.
  private readonly keys: Float32Array
  private readonly values: Float32Array
  private readonly masses: Float64Array
  private readonly firstTokens: Float64Array
  private readonly lastTokens: Float64Array

  // Ring state per level: `head` is where the next slot lands, `count` is
  // occupancy. Once count reaches capacity, head also points at the oldest slot.
  private readonly heads: Int32Array
  private readonly counts: Int32Array

  // Accumulators. A level's incoming mass is summed here as Σ m·k rather than
  // held as a list of slots, so the pending state is O(dim) per level however
  // long the period is. Float64 throughout: this is where the fold's arithmetic
  // happens, and it is the one lossy step in the design.
  private readonly pendingKeys: Float64Array
  private readonly pendingValues: Float64Array
  private readonly pendingMasses: Float64Array
  private readonly pendingFirst: Float64Array
  private readonly pendingLast: Float64Array

  // Scratch for the divide step in foldPending. Safe to share across levels
  // because push copies out of it before anything else can write to it.
  private readonly foldKey: Float64Array
  private readonly foldValue: Float64Array

  private tokensSeen = 0
  private forgotten = 0

  constructor(options: StratifiedCacheOptions) {
    const periods = options.periods ?? TIME_CRYSTAL_PERIODS
    const capacities = options.capacities
      ?? periods.map(() => DEFAULT_CAPACITY_PER_LEVEL)

    if (options.dim <= 0 || !Number.isInteger(options.dim))
      throw new Error(`dim must be a positive integer, received ${options.dim}`)
    if (capacities.length !== periods.length)
      throw new Error(`expected ${periods.length} capacities to match the periods, received ${capacities.length}`)
    if (capacities.some(capacity => capacity <= 0 || !Number.isInteger(capacity)))
      throw new Error(`every capacity must be a positive integer, received [${capacities.join(', ')}]`)
    if (periods.some(period => period <= 0 || !Number.isInteger(period)))
      throw new Error(`every period must be a positive integer, received [${periods.join(', ')}]`)
    // Level 0 ingests unconditionally — it is the exact window, not a folding
    // rung — so a period other than 1 there would be silently ignored rather
    // than honoured, and would also break the reach formula.
    if (periods[0] !== 1)
      throw new Error(`the fastest period must be 1, received ${periods[0]}`)

    this.dim = options.dim
    this.periods = [...periods]
    this.capacities = [...capacities]

    const offsets: number[] = [0]
    for (const capacity of capacities)
      offsets.push(offsets[offsets.length - 1] + capacity)
    this.offsets = offsets
    this.totalSlots = offsets[offsets.length - 1]

    const levels = periods.length
    this.keys = new Float32Array(this.totalSlots * this.dim)
    this.values = new Float32Array(this.totalSlots * this.dim)
    this.masses = new Float64Array(this.totalSlots)
    this.firstTokens = new Float64Array(this.totalSlots)
    this.lastTokens = new Float64Array(this.totalSlots)
    this.heads = new Int32Array(levels)
    this.counts = new Int32Array(levels)
    this.pendingKeys = new Float64Array(levels * this.dim)
    this.pendingValues = new Float64Array(levels * this.dim)
    this.pendingMasses = new Float64Array(levels)
    this.pendingFirst = new Float64Array(levels)
    this.pendingLast = new Float64Array(levels)
    this.foldKey = new Float64Array(this.dim)
    this.foldValue = new Float64Array(this.dim)
  }

  get levels(): number {
    return this.periods.length
  }

  /**
   * Writes one token's key and value, returning the 1-based index it was given.
   *
   * Token indices start at 1 rather than 0 because the ladder's phase test is a
   * divisibility test, and every period divides 0 — a zero-based first token
   * would read as a moment when the entire ladder acts at once.
   */
  write(key: ArrayLike<number>, value: ArrayLike<number>): number {
    if (key.length !== this.dim || value.length !== this.dim)
      throw new Error(`expected key and value of length ${this.dim}, received ${key.length} and ${value.length}`)

    const token = ++this.tokensSeen
    this.push(0, key, value, 1, token, token)

    // Ascending, and that ordering is part of the contract: closing a slot at
    // level l can spill into level l+1's accumulator, and when both levels act
    // on the same token, level l+1 must fold with that spill already included.
    for (let level = 1; level < this.levels; level++) {
      if (isPeriodActive(token, this.periods[level]) && this.pendingMasses[level] > 0)
        this.foldPending(level)
    }

    return token
  }

  /**
   * Visits every occupied slot, oldest first within each level and level 0
   * first overall. The visitor receives a global slot index usable with
   * {@link keyAt}, {@link valueAt}, {@link massAt} and {@link readSlot}.
   */
  forEachOccupied(visit: (slotIndex: number, level: number) => void): void {
    for (let level = 0; level < this.levels; level++) {
      const capacity = this.capacities[level]
      const count = this.counts[level]
      const oldest = (this.heads[level] - count + capacity) % capacity
      for (let position = 0; position < count; position++)
        visit(this.offsets[level] + (oldest + position) % capacity, level)
    }
  }

  /** Occupied slots across every level. */
  occupancy(): number {
    let total = 0
    for (let level = 0; level < this.levels; level++)
      total += this.counts[level]
    return total
  }

  massAt(slotIndex: number): number {
    return this.masses[slotIndex]
  }

  /** A view into the backing store — not a copy. Do not retain it across writes. */
  keyAt(slotIndex: number): Float32Array {
    return this.keys.subarray(slotIndex * this.dim, (slotIndex + 1) * this.dim)
  }

  /** A view into the backing store — not a copy. Do not retain it across writes. */
  valueAt(slotIndex: number): Float32Array {
    return this.values.subarray(slotIndex * this.dim, (slotIndex + 1) * this.dim)
  }

  /** A copied, detached snapshot of one slot. For inspection and tests. */
  readSlot(slotIndex: number): StratumSlot {
    let level = 0
    while (level + 1 < this.levels && slotIndex >= this.offsets[level + 1])
      level++

    return {
      level,
      key: this.keyAt(slotIndex).slice(),
      value: this.valueAt(slotIndex).slice(),
      mass: this.masses[slotIndex],
      firstToken: this.firstTokens[slotIndex],
      lastToken: this.lastTokens[slotIndex],
    }
  }

  /** Every occupied slot, copied. Convenient for tests; allocates. */
  slots(): StratumSlot[] {
    const collected: StratumSlot[] = []
    this.forEachOccupied(slotIndex => collected.push(this.readSlot(slotIndex)))
    return collected
  }

  /**
   * The ledger: where every token written so far currently lives.
   *
   * `balanced` is an exact equality, not a tolerance. It can only go false
   * through a defect in the cascade, so a caller that asserts on it is testing
   * the implementation rather than the numerics.
   */
  conservation(): StratifiedConservation {
    let live = 0
    this.forEachOccupied((slotIndex) => {
      live += this.masses[slotIndex]
    })

    let pending = 0
    for (let level = 0; level < this.levels; level++)
      pending += this.pendingMasses[level]

    return {
      live,
      pending,
      forgotten: this.forgotten,
      tokensSeen: this.tokensSeen,
      balanced: live + pending + this.forgotten === this.tokensSeen,
    }
  }

  /**
   * Clears every slot and accumulator, keeping the allocation.
   *
   * The point of preallocating the whole cache is that a new sequence costs no
   * allocation, so reuse across sequences goes through here rather than through
   * a fresh instance.
   */
  reset(): void {
    this.keys.fill(0)
    this.values.fill(0)
    this.masses.fill(0)
    this.firstTokens.fill(0)
    this.lastTokens.fill(0)
    this.heads.fill(0)
    this.counts.fill(0)
    this.pendingKeys.fill(0)
    this.pendingValues.fill(0)
    this.pendingMasses.fill(0)
    this.pendingFirst.fill(0)
    this.pendingLast.fill(0)
    this.tokensSeen = 0
    this.forgotten = 0
  }

  /**
   * Places a closed slot at the head of level `level`'s ring, spilling whatever
   * it displaces into the next level's accumulator.
   *
   * The spill is the only path mass takes downward, and at the deepest level it
   * has nowhere to go: that is the single point where mass leaves the system,
   * and it is counted rather than dropped.
   */
  private push(
    level: number,
    key: ArrayLike<number>,
    value: ArrayLike<number>,
    mass: number,
    firstToken: number,
    lastToken: number,
  ): void {
    const capacity = this.capacities[level]
    const slotIndex = this.offsets[level] + this.heads[level]

    if (this.counts[level] === capacity)
      this.spill(level, slotIndex)

    const base = slotIndex * this.dim
    for (let component = 0; component < this.dim; component++) {
      this.keys[base + component] = key[component]
      this.values[base + component] = value[component]
    }
    this.masses[slotIndex] = mass
    this.firstTokens[slotIndex] = firstToken
    this.lastTokens[slotIndex] = lastToken

    this.heads[level] = (this.heads[level] + 1) % capacity
    if (this.counts[level] < capacity)
      this.counts[level]++
  }

  /** Moves the slot at `slotIndex` into level + 1's accumulator, or forgets it. */
  private spill(level: number, slotIndex: number): void {
    const mass = this.masses[slotIndex]
    const target = level + 1

    if (target >= this.levels) {
      this.forgotten += mass
      return
    }

    const slotBase = slotIndex * this.dim
    const pendingBase = target * this.dim
    for (let component = 0; component < this.dim; component++) {
      this.pendingKeys[pendingBase + component] += mass * this.keys[slotBase + component]
      this.pendingValues[pendingBase + component] += mass * this.values[slotBase + component]
    }

    if (this.pendingMasses[target] === 0) {
      this.pendingFirst[target] = this.firstTokens[slotIndex]
      this.pendingLast[target] = this.lastTokens[slotIndex]
    }
    else {
      this.pendingFirst[target] = Math.min(this.pendingFirst[target], this.firstTokens[slotIndex])
      this.pendingLast[target] = Math.max(this.pendingLast[target], this.lastTokens[slotIndex])
    }
    this.pendingMasses[target] += mass
  }

  /**
   * Closes level `level`'s accumulator into one slot and empties it.
   *
   * Dividing the accumulated Σ m·k by Σ m gives the mass-weighted centroid,
   * which is what makes the mass correction in ./attend exact: a group of
   * tokens sharing a key folds to that key, and the folded slot then answers a
   * query exactly as the group would have.
   */
  private foldPending(level: number): void {
    const mass = this.pendingMasses[level]
    const pendingBase = level * this.dim

    for (let component = 0; component < this.dim; component++) {
      this.foldKey[component] = this.pendingKeys[pendingBase + component] / mass
      this.foldValue[component] = this.pendingValues[pendingBase + component] / mass
      this.pendingKeys[pendingBase + component] = 0
      this.pendingValues[pendingBase + component] = 0
    }

    const firstToken = this.pendingFirst[level]
    const lastToken = this.pendingLast[level]
    this.pendingMasses[level] = 0
    this.pendingFirst[level] = 0
    this.pendingLast[level] = 0

    this.push(level, this.foldKey, this.foldValue, mass, firstToken, lastToken)
  }
}

export function createStratifiedCache(options: StratifiedCacheOptions): StratifiedCache {
  return new StratifiedCache(options)
}
