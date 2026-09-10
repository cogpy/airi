import type { StratumSlot } from './strata'

import { describe, expect, it } from 'vitest'

import { attend } from './attend'
import { createStratifiedCache } from './strata'

/**
 * Plain attention over a list of entries, with no mass term. The baseline the
 * stratified read has to reproduce.
 */
function referenceAttention(
  entries: readonly { key: ArrayLike<number>, value: ArrayLike<number> }[],
  query: ArrayLike<number>,
  scale: number,
): Float64Array {
  const dim = query.length
  const logits = entries.map((entry) => {
    let dot = 0
    for (let component = 0; component < dim; component++)
      dot += query[component] * entry.key[component]
    return scale * dot
  })

  const peak = Math.max(...logits)
  const exponentiated = logits.map(logit => Math.exp(logit - peak))
  const total = exponentiated.reduce((sum, each) => sum + each, 0)

  const output = new Float64Array(dim)
  entries.forEach((entry, index) => {
    const weight = exponentiated[index] / total
    for (let component = 0; component < dim; component++)
      output[component] += weight * entry.value[component]
  })
  return output
}

/** Re-inflates each slot into the `mass` tokens it stands for. */
function expandByMass(slots: readonly StratumSlot[]) {
  const entries: { key: Float32Array, value: Float32Array }[] = []
  for (const slot of slots) {
    for (let copy = 0; copy < slot.mass; copy++)
      entries.push({ key: slot.key, value: slot.value })
  }
  return entries
}

function drift(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let worst = 0
  for (let component = 0; component < a.length; component++)
    worst = Math.max(worst, Math.abs(a[component] - b[component]))
  return worst
}

function tokenAt(index: number, dim: number) {
  const key = new Float32Array(dim)
  const value = new Float32Array(dim)
  for (let component = 0; component < dim; component++) {
    key[component] = Math.sin(index * 0.37 + component)
    value[component] = Math.cos(index * 0.21 + component * 2)
  }
  return { key, value }
}

describe('the mass correction', () => {
  it('reads a folded cache exactly as attention would read the tokens it stands for', () => {
    // The identity the whole design rests on: adding log(mass) to a slot's
    // logit reproduces, to the last bit the floats allow, what a softmax over
    // that slot's tokens would have contributed. Whatever the fold lost, it
    // lost when it averaged — never here, on the read.
    const cache = createStratifiedCache({ dim: 8 })
    for (let index = 0; index < 6000; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
    }

    const query = tokenAt(6000, cache.dim).key
    const scale = 1 / Math.sqrt(cache.dim)

    const stratified = attend(cache, query)
    const expanded = referenceAttention(expandByMass(cache.slots()), query, scale)

    expect(drift(stratified.output, expanded)).toBeLessThan(1e-12)
  })

  it('is what keeps a folded past competitive with an exact recent window', () => {
    // A long stretch of one key, then a short recent stretch of an orthogonal
    // one, in a cache shaped so the recent window holds many more *slots* than
    // the past does while the past holds far more *tokens*. Uncorrected, the
    // read counts slots and the past all but disappears.
    const dim = 4
    const past = new Float32Array([1, 0, 0, 0])
    const recent = new Float32Array([0, 1, 0, 0])
    const cache = createStratifiedCache({ dim, capacities: [256, 4, 4, 4, 4, 4, 4, 4, 4] })

    for (let index = 0; index < 1400; index++)
      cache.write(past, past)
    for (let index = 0; index < 256; index++)
      cache.write(recent, recent)

    const weightOnPast = (massCorrected: boolean) => {
      const read = attend(cache, past, { massCorrected })
      return read.slotIndices.reduce((total, slotIndex, entry) => {
        const key = cache.keyAt(slotIndex)
        // A handful of slots straddle the boundary and hold a mixture; the
        // threshold keeps them out of both sides of the comparison.
        return key[0] > 0.9 ? total + read.weights[entry] : total
      }, 0)
    }

    expect(weightOnPast(true)).toBeGreaterThan(0.8)
    expect(weightOnPast(false)).toBeLessThan(0.3)
  })
})

describe('reading', () => {
  it('returns a distribution', () => {
    const cache = createStratifiedCache({ dim: 6 })
    for (let index = 0; index < 500; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
    }

    const read = attend(cache, tokenAt(500, cache.dim).key)
    const total = read.weights.reduce((sum, weight) => sum + weight, 0)

    expect(read.weights).toHaveLength(read.slotIndices.length)
    expect(total).toBeCloseTo(1, 12)
    expect(read.weights.every(weight => weight >= 0)).toBe(true)
  })

  it('reports the tokens it covered, short by exactly what has been forgotten', () => {
    const cache = createStratifiedCache({ dim: 4 })
    for (let index = 0; index < 30_000; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
    }

    const read = attend(cache, tokenAt(0, cache.dim).key)
    const ledger = cache.conservation()

    expect(read.coveredMass).toBe(ledger.live)
    expect(read.coveredMass + ledger.pending + ledger.forgotten).toBe(30_000)
  })

  it('contributes nothing from an empty cache rather than dividing by nothing', () => {
    const cache = createStratifiedCache({ dim: 4 })
    const read = attend(cache, [1, 0, 0, 0])

    expect(read.slotIndices).toEqual([])
    expect(read.coveredMass).toBe(0)
    expect(Array.from(read.output)).toEqual([0, 0, 0, 0])
  })

  it('survives logits large enough to overflow an uncentred softmax', () => {
    const cache = createStratifiedCache({ dim: 4 })
    for (let index = 0; index < 4000; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
    }

    const enormous = new Float32Array([1e4, -1e4, 1e4, -1e4])
    const read = attend(cache, enormous)

    expect(read.weights.every(weight => Number.isFinite(weight))).toBe(true)
    expect(read.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12)
    expect(Array.from(read.output).every(Number.isFinite)).toBe(true)
  })

  it('rejects a query whose width is not the cache\'s', () => {
    const cache = createStratifiedCache({ dim: 4 })
    expect(() => attend(cache, [1, 2, 3])).toThrow(/length 4/)
  })
})
