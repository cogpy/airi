/**
 * AiriCog Co-play Rules Contract
 *
 * A game is a shared environment, not a participant. Its rules are the only
 * place that knows what a board looks like or what a move is. Everything
 * else in co-play — whose turn it is, who may move, what to do when the
 * model gives no legal move — is written against this contract, so a new
 * game such as chess plugs in by implementing it and nothing more.
 *
 * Rules are pure: every function returns a new value and never mutates the
 * state it is given. The session relies on that to keep history.
 */

/**
 * How a game stands.
 *
 * - `in-progress`: someone still has to move.
 * - `win`: the game is over and `seat` won.
 * - `draw`: the game is over and nobody won.
 */
export type GameOutcome
  = | { status: 'in-progress' }
    | { status: 'win', seat: string }
    | { status: 'draw' }

/**
 * The rules of one turn-based game.
 *
 * `State` and `Move` belong to the game. Callers outside the game only pass
 * them back to these functions, and use {@link GameRules.formatMove} and
 * {@link GameRules.parseMove} to move them through text: a model's tool
 * argument, a person's typed move, or a protocol event.
 *
 * @param State Immutable game state. It must survive `structuredClone`, so a
 *   stage can log or replay it.
 * @param Move One move. Two moves are the same move exactly when
 *   `formatMove` gives the same text for both.
 */
export interface GameRules<State, Move> {
  /** Stable id of the game, such as `tic-tac-toe`. Peers match games by it. */
  id: string
  /** Name a model or a person reads, such as `Tic-tac-toe`. */
  name: string
  /**
   * Usual seat names, in turn order, such as `['X', 'O']`. Its length is the
   * number of players the game needs; a session refuses any other number.
   * Callers that have no reason to rename seats pass it to
   * {@link initialState} as is.
   */
  seats: readonly string[]
  /**
   * The state before the first move. `seats` names each seat in turn order,
   * one per entry of {@link seats}: `seats[0]` moves first. Seat names are
   * what {@link currentSeat} and {@link outcome} return, and what
   * {@link describe} is asked about.
   */
  initialState: (seats: readonly string[]) => State
  /** Seat whose turn it is, or `undefined` once the game is over. */
  currentSeat: (state: State) => string | undefined
  /**
   * Every move the current seat may make, in a fixed order. Empty once the
   * game is over. The order is part of the contract: the fallback policy
   * picks the first move it finds acceptable, so it must be deterministic.
   */
  legalMoves: (state: State) => Move[]
  /**
   * The state after the current seat makes `move`. Callers pass only moves
   * from {@link legalMoves}; the result for any other move is unspecified.
   */
  applyMove: (state: State, move: Move) => State
  outcome: (state: State) => GameOutcome
  /**
   * Plain text a model can read, from the point of view of `seat`: the
   * board, which side `seat` plays, whose turn it is, the legal moves when it
   * is `seat`'s turn, and the result once the game is over.
   */
  describe: (state: State, seat: string) => string
  /**
   * Reads one move from free text, such as a model's tool argument or what a
   * person typed. Returns `undefined` when the text names no move. It does
   * not check legality; the session does.
   */
  parseMove: (text: string) => Move | undefined
  /**
   * The canonical text of a move. `parseMove(formatMove(move))` gives the
   * same move back. Peers send moves to each other in this form.
   */
  formatMove: (move: Move) => string
}

/**
 * Who sits in one seat of a game.
 *
 * - `self`: the character on this stage. She moves through her game tool.
 * - `other`: anyone else, such as the local user or another agent. Their moves
 *   arrive from outside, typed in or received from the server channel.
 */
export interface GamePlayer {
  /** Seat name, as given to {@link GameRules.initialState}. */
  seat: string
  /** Participant id from the participants model. Moves are submitted by it. */
  participantId: string
  kind: 'self' | 'other'
}
