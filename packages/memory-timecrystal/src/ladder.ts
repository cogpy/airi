/**
 * The period ladder: nine nested timescales, one integer period each.
 *
 * A transformer's KV cache is flat in time. Every token is written at the same
 * rate, every layer at the same rate, and the cache grows without bound. The
 * generalized neuron in Nanobrain Fig 6.14 is the opposite shape: its parts
 * oscillate at nine distinct periods spanning 8ms to 1s, and what the neuron
 * holds at any instant is the joint phase of all nine. This module is that
 * ladder, expressed in tokens instead of milliseconds.
 *
 * Periods are integers, so divisibility is exact and phase never drifts — the
 * same reason integer masses make the cache's conservation law exact. They are
 * also pairwise coprime, which is not decoration; see below.
 */

/**
 * The biological periods, in seconds, of the nine oscillator families in the
 * generalized neuron. Kept as the derivation record for {@link TIME_CRYSTAL_PERIODS}
 * and as the axis label for anything plotting the ladder against real time.
 */
export const NANOBRAIN_SCALE_SECONDS = Object.freeze([
  0.008,
  0.026,
  0.052,
  0.11,
  0.16,
  0.25,
  0.33,
  0.5,
  1,
] as const)

/**
 * Token-domain periods: level `l` acts once every `TIME_CRYSTAL_PERIODS[l]` tokens.
 *
 * Each is the prime nearest that level's biological period once the ladder is
 * normalized to its fastest rung — 0.026s / 0.008s = 3.25 becomes 3, 0.5s /
 * 0.008s = 62.5 becomes 61, and so on. The fit is loosest at the fast end,
 * where the ratios fall furthest from any prime: levels 1 and 2 are 7.7% out,
 * level 3 is 5.5%, level 4 is 5%. From 0.25s up every rung lands within 2.4%,
 * which is where it matters — those are the rungs that carry most of the
 * cache's reach.
 *
 * Rounding to primes rather than to the nearest integer buys two things that
 * powers of two — the usual choice for a hierarchical cache — cannot give:
 *
 * Coprimality spreads the work. Two levels act on the same token only when
 * their product divides it, so folds almost never coincide and the per-token
 * cost stays near-flat. A power-of-two ladder does the reverse: at t = 256
 * every rung fires at once, and the cost of the cache arrives as a spike.
 *
 * Coprimality also makes the phase informative. Under powers of two, level `l`
 * acting implies every faster level is acting too, so the active set is just a
 * number. Here the active set at time t is the divisor pattern of t, and the
 * ladder does not return to a state it has held before until
 * {@link crystalPeriod} tokens have passed — some 5.1e10 of them, which is
 * why a context window only ever observes an aperiodic slice of a structure
 * that is, in principle, perfectly periodic.
 */
export const TIME_CRYSTAL_PERIODS = Object.freeze([1, 3, 7, 13, 19, 31, 41, 61, 127] as const)

/** Number of rungs in the standard ladder. */
export const TIME_CRYSTAL_LEVELS = TIME_CRYSTAL_PERIODS.length

/**
 * Whether a rung of period `period` acts on token `token`.
 *
 * Tokens are counted from 1, so that no rung is spuriously active at the
 * origin: every period divides 0, which would make the first token look like a
 * global synchronization event it is not.
 */
export function isPeriodActive(token: number, period: number): boolean {
  return token > 0 && token % period === 0
}

/**
 * Levels acting on `token`, ascending. Level 0 has period 1 and so appears in
 * every non-empty result.
 */
export function activeLevels(
  token: number,
  periods: readonly number[] = TIME_CRYSTAL_PERIODS,
): number[] {
  const active: number[] = []
  for (let level = 0; level < periods.length; level++) {
    if (isPeriodActive(token, periods[level]))
      active.push(level)
  }
  return active
}

/**
 * The active set as a bitmask, one bit per level.
 *
 * This is the ladder's state label: token counts sharing a signature stand in
 * the same phase of the crystal, whatever else differs about them. Consumers
 * that want to key a schedule, a probe, or a cache statistic on phase should
 * key it on this rather than on the token index.
 *
 * @example
 * phaseSignature(21)
 * // => 7  (levels 0, 1 and 2 act: 21 is divisible by 1, 3 and 7)
 */
export function phaseSignature(
  token: number,
  periods: readonly number[] = TIME_CRYSTAL_PERIODS,
): number {
  let signature = 0
  for (let level = 0; level < periods.length; level++) {
    if (isPeriodActive(token, periods[level]))
      signature |= 1 << level
  }
  return signature
}

/**
 * Token count after which the whole ladder returns to its starting phase, as
 * the least common multiple of the periods.
 *
 * Exact for the standard ladder — the product of its primes is 5.1e10, far
 * inside the safe-integer range — but a caller supplying large periods of their
 * own can overflow it, so the result is checked and a non-exact one throws
 * rather than being returned as a plausible wrong number.
 */
export function crystalPeriod(periods: readonly number[] = TIME_CRYSTAL_PERIODS): number {
  let period = 1
  for (const each of periods)
    period = (period / greatestCommonDivisor(period, each)) * each

  if (!Number.isSafeInteger(period))
    throw new Error(`crystal period exceeds exact integer range for periods [${periods.join(', ')}]`)

  return period
}

/**
 * Tokens the whole ladder covers at steady state, given per-level slot counts.
 *
 * A level absorbs one token of mass per step and closes a slot every
 * `period[l]` steps, so its slots average `period[l]` tokens each and total
 * reach is the dot product of periods and capacities. The useful shape of that:
 * reach grows with the sum of the periods while storage grows only with the sum
 * of the capacities.
 *
 * This is the mean the cache settles on, not a bound on any single slot. Mass
 * arrives at a level in whole slots from the level above, and coprime periods
 * guarantee those quanta never divide the fold window — level 2 folds every 7
 * tokens but receives level 1's mass in units of 3, so its slots hold 6 or 9
 * and average 7.03. Measured live mass tracks this figure to within about 1%
 * from the moment the ladder fills, however long the stream runs after that.
 *
 * @example
 * steadyStateReach([1, 3, 7, 13, 19, 31, 41, 61, 127], Array.from({ length: 9 }, () => 32))
 * // => 9696   (288 slots, of which the newest 32 are uncompressed tokens)
 */
export function steadyStateReach(
  periods: readonly number[],
  capacities: readonly number[],
): number {
  let reach = 0
  for (let level = 0; level < periods.length; level++)
    reach += periods[level] * capacities[level]
  return reach
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = a
  let right = b
  while (right !== 0) {
    const next = left % right
    left = right
    right = next
  }
  return left
}
