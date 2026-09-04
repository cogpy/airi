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
 * Converts an importance value to its whole number of attention quanta.
 *
 * Use when:
 * - You need the integer partition underlying an importance value
 * - You are comparing two importance values for exact ledger equality
 *
 * Expects:
 * - A finite number; non-finite input yields 0 so a poisoned value cannot
 *   propagate into the ledger
 *
 * Returns:
 * - The nearest integer quanta count, ties rounding half away from zero
 */
export function toQuanta(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.round(value * QUANTA_PER_UNIT)
}

/**
 * Converts a whole number of attention quanta back to an importance value.
 *
 * Use when:
 * - You have done ledger arithmetic in integer quanta and need the [0, 1]
 *   importance projection again
 *
 * Expects:
 * - An integer quanta count within the safe-integer range
 *
 * Returns:
 * - The exactly representable dyadic rational `quanta / QUANTA_PER_UNIT`
 */
export function fromQuanta(quanta: number): number {
  return quanta / QUANTA_PER_UNIT
}

/**
 * Snaps an importance value onto the attention quantum lattice.
 *
 * Before:
 * - 0.30000000000000004 (the float sum 0.1 + 0.2)
 * - 0.1 + 0.2 - 0.2 accumulated over many steps
 *
 * After:
 * - 0.30000019073486328 (an exact multiple of 1 / 2^20)
 * - a value that survives addition and subtraction without drift
 *
 * Use when:
 * - Any importance value enters or moves within the attention economy
 *
 * Expects:
 * - Any number; non-finite input is projected to 0
 *
 * Returns:
 * - The nearest lattice point, exactly representable in float64
 */
export function quantizeAttention(value: number): number {
  return fromQuanta(toQuanta(value))
}
