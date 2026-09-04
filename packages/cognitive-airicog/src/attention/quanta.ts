/**
 * AiriCog Attention Quantum Lattice
 *
 * The attention economy conserves a fixed quantity of importance, but
 * conservation cannot be stated in arbitrary IEEE-754 floats: repeated
 * `x + d - d` over decimal fractions drifts, so a ledger built on raw floats
 * slowly invents or destroys currency and no exact invariant can be asserted.
 *
 * Every importance value in the economy is therefore held on a lattice of
 * dyadic rationals — integer multiples of `1 / QUANTA_PER_UNIT`. A dyadic
 * rational whose denominator is a power of two is exactly representable in
 * float64, and sums of such values are themselves exact while the running
 * total stays well inside 2^53. Conservation then holds bit-exactly rather
 * than to within some epsilon.
 *
 * The continuous [0, 1] importance scale is the appearance; the integer
 * partition of quanta is what is actually conserved.
 */

/**
 * Number of indivisible attention quanta per unit of importance.
 *
 * A power of two, so every lattice point is exactly representable in float64.
 * 2^20 resolves importance to ~9.5e-7 — far finer than any meaningful
 * attentional distinction — while keeping quanta counts for realistic fund
 * sizes (up to ~1e6 units) several orders of magnitude below
 * `Number.MAX_SAFE_INTEGER`.
 */
export const QUANTA_PER_UNIT = 2 ** 20

/**
 * Non-finite input yields 0 rather than propagating NaN or Infinity into the
 * ledger, where it would silently destroy the conservation invariant.
 */
export function toQuanta(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.round(value * QUANTA_PER_UNIT)
}

export function fromQuanta(quanta: number): number {
  return quanta / QUANTA_PER_UNIT
}

/**
 * Snaps an importance value onto the attention quantum lattice, so that
 * subsequent addition and subtraction of lattice values are exact.
 *
 * @example
 * quantizeAttention(0.1 + 0.2)
 * // => 0.30000019073486328
 */
export function quantizeAttention(value: number): number {
  return fromQuanta(toQuanta(value))
}
