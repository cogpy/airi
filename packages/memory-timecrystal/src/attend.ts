/**
 * Attention over a stratified cache.
 *
 * A folded slot stands for many tokens, so reading the cache as if every slot
 * were one token would systematically under-weight the past: the further back a
 * region is, the more tokens one slot speaks for, and the quieter it would get.
 * The correction is to add `log(mass)` to each logit before the softmax, which
 * restores exactly the weight the folded tokens would have carried.
 *
 * That is an identity, not an approximation. Softmax over `m` tokens sharing a
 * key contributes `m · exp(q·k)`; one slot at that key with the correction
 * contributes `exp(q·k + log m)`, the same number. Because the fold stores the
 * mass-weighted centroid of the values too, the output vector matches as well.
 * So when a fold groups tokens that agree, mass-corrected attention over the
 * compressed cache equals full attention over the uncompressed one — the loss
 * is entirely in how far the folded tokens disagreed, and nowhere else.
 */

import type { StratifiedCache } from './strata'

export interface AttendOptions {
  /**
   * Logit scale applied to the query-key dot product. Defaults to the usual
   * `1 / sqrt(dim)`.
   */
  scale?: number
  /**
   * Whether to weight each slot by the tokens it stands for. On by default;
   * turning it off is only useful for measuring what the correction is worth,
   * since an uncorrected read treats a 127-token summary as a single token.
   *
   * @default true
   */
  massCorrected?: boolean
}

export interface AttendResult {
  /** The attended value, length `cache.dim`. */
  output: Float64Array
  /** Softmax weight per entry of {@link slotIndices}, summing to 1. */
  weights: Float64Array
  /** Global slot indices, in the cache's own oldest-first, level-ascending order. */
  slotIndices: number[]
  /**
   * Total mass the read covered. Below `tokensSeen` by exactly the mass that
   * has been forgotten past the deepest level, which is what makes this
   * readable as the effective context length of the read.
   */
  coveredMass: number
}

/**
 * Reads the cache with one query vector.
 *
 * Returns zero weights and a zero output when the cache is empty, rather than a
 * uniform distribution over nothing: an empty cache should contribute nothing to
 * a residual stream, and NaN from a 0/0 softmax would poison it instead.
 */
export function attend(
  cache: StratifiedCache,
  query: ArrayLike<number>,
  options: AttendOptions = {},
): AttendResult {
  if (query.length !== cache.dim)
    throw new Error(`expected a query of length ${cache.dim}, received ${query.length}`)

  const scale = options.scale ?? 1 / Math.sqrt(cache.dim)
  const massCorrected = options.massCorrected ?? true

  const slotIndices: number[] = []
  cache.forEachOccupied(slotIndex => slotIndices.push(slotIndex))

  const output = new Float64Array(cache.dim)
  const weights = new Float64Array(slotIndices.length)
  if (slotIndices.length === 0)
    return { output, weights, slotIndices, coveredMass: 0 }

  let coveredMass = 0
  let peak = Number.NEGATIVE_INFINITY
  for (let entry = 0; entry < slotIndices.length; entry++) {
    const slotIndex = slotIndices[entry]
    const key = cache.keyAt(slotIndex)
    const mass = cache.massAt(slotIndex)
    coveredMass += mass

    let dot = 0
    for (let component = 0; component < cache.dim; component++)
      dot += query[component] * key[component]

    const logit = scale * dot + (massCorrected ? Math.log(mass) : 0)
    weights[entry] = logit
    if (logit > peak)
      peak = logit
  }

  // Subtract the peak before exponentiating. The mass term alone reaches
  // log(127) per level and the dot product is unbounded, so an uncentred
  // softmax overflows on ordinary inputs rather than on adversarial ones.
  let total = 0
  for (let entry = 0; entry < weights.length; entry++) {
    const exponentiated = Math.exp(weights[entry] - peak)
    weights[entry] = exponentiated
    total += exponentiated
  }

  for (let entry = 0; entry < weights.length; entry++) {
    const weight = weights[entry] / total
    weights[entry] = weight

    const value = cache.valueAt(slotIndices[entry])
    for (let component = 0; component < cache.dim; component++)
      output[component] += weight * value[component]
  }

  return { output, weights, slotIndices, coveredMass }
}
