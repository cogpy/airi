import type { GameRules } from './rules'

/**
 * Picks a move for the seat to move when the character gave no legal one.
 *
 * The character moves through a model, and a model can skip the tool, name
 * an illegal move, or fail outright. Without a fallback the game would wait
 * on her forever. This policy keeps it going with a move that is never
 * embarrassing, in this order:
 *
 * 1. A move that wins at once.
 * 2. Otherwise, the first move after which no opponent reply wins at once.
 *    This blocks an opponent's open line without game-specific knowledge.
 * 3. Otherwise, the first legal move.
 *
 * Deterministic: "first" follows the order of `rules.legalMoves`, so the same
 * state always gives the same move. Returns `undefined` when there is no
 * legal move, which happens only once the game is over.
 *
 * It looks two plies ahead with `applyMove`, about `n * m` calls for `n` own
 * moves and `m` replies. That is trivial for small boards and a few thousand
 * calls for a chess position, which is still fine for one move per turn.
 *
 * @example
 * // X to move with X on a1 and b1: c1 completes the top row.
 * chooseFallbackMove(ticTacToe, state)
 * // => 2
 */
export function chooseFallbackMove<State, Move>(rules: GameRules<State, Move>, state: State): Move | undefined {
  const seat = rules.currentSeat(state)
  const moves = rules.legalMoves(state)
  if (seat === undefined || moves.length === 0)
    return undefined

  const after = moves.map(move => ({ move, state: rules.applyMove(state, move) }))

  const winning = after.find((candidate) => {
    const outcome = rules.outcome(candidate.state)
    return outcome.status === 'win' && outcome.seat === seat
  })
  if (winning)
    return winning.move

  const safe = after.find(candidate => !rules.legalMoves(candidate.state).some((reply) => {
    const outcome = rules.outcome(rules.applyMove(candidate.state, reply))
    return outcome.status === 'win' && outcome.seat !== seat
  }))
  if (safe)
    return safe.move

  return moves[0]
}
