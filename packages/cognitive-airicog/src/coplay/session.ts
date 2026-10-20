import type { GameOutcome, GamePlayer, GameRules } from './rules'

/** One accepted move, in the order it was played. */
export interface GameMoveRecord<Move> {
  /** Moves played before this one. The first move has ply `0`. */
  ply: number
  seat: string
  participantId: string
  move: Move
  /** Canonical text of the move, from {@link GameRules.formatMove}. */
  text: string
}

/**
 * Why the session refused a move. Checked in this order, so the first reason
 * that applies is the one reported:
 *
 * 1. `unknown-player`: the participant has no seat in this game.
 * 2. `game-over`: the game already has a result.
 * 3. `not-your-turn`: another seat is to move.
 * 4. `unreadable-move`: the text names no move (only from `submitText`).
 * 5. `illegal-move`: the move is not one of the current legal moves.
 */
export type GameMoveRejection = 'unknown-player' | 'game-over' | 'not-your-turn' | 'unreadable-move' | 'illegal-move'

/**
 * The session's answer to one submitted move.
 *
 * An accepted move carries the state and outcome after it. A rejected move
 * leaves the session unchanged; `currentSeat` says who is to move, or is
 * absent once the game is over.
 */
export type GameSubmitResult<State, Move>
  = | { status: 'accepted', record: GameMoveRecord<Move>, state: State, outcome: GameOutcome }
    | { status: 'rejected', reason: GameMoveRejection, currentSeat?: string }

/**
 * One game in play between seated participants.
 *
 * State model:
 *
 * - Players (fixed). Set at creation, one seat each, in turn order.
 * - Game state (owned). Starts at `rules.initialState` and changes only
 *   through an accepted {@link submit} or {@link submitText}.
 * - History (owned, append-only). One record per accepted move. Rejected moves
 *   leave no trace here; the caller logs them if it wants to.
 * - Outcome (derived). Read from the rules after every accepted move. Once it
 *   is not `in-progress`, every later move is rejected with `game-over`.
 *
 * The session has no clock and does no IO. It never decides on its own that
 * someone moved: a caller asks the character, reads a person's input, or
 * receives a peer's event, then submits the move here.
 */
export interface GameSession<State, Move> {
  readonly rules: GameRules<State, Move>
  readonly players: readonly GamePlayer[]
  /** The current game state. */
  state: () => State
  /** Accepted moves, oldest first. The array is a copy. */
  history: () => GameMoveRecord<Move>[]
  outcome: () => GameOutcome
  /** Player whose turn it is, or `undefined` once the game is over. */
  currentPlayer: () => GamePlayer | undefined
  /** The player with this participant id, if any. */
  player: (participantId: string) => GamePlayer | undefined
  /** Plays `move` for the participant, if the rules allow it now. */
  submit: (participantId: string, move: Move) => GameSubmitResult<State, Move>
  /** Reads a move from text with `rules.parseMove`, then submits it. */
  submitText: (participantId: string, text: string) => GameSubmitResult<State, Move>
}

/**
 * Seats players at a new game.
 *
 * `players` lists one player per seat, in turn order: the first player moves
 * first. Seat names are the caller's, usually `rules.seats`. Throws when the
 * number of players does not match `rules.seats`, or when two players share
 * a seat or a participant id, because a game set up
 * that way cannot be played fairly and is a caller error, not a move to
 * reject.
 *
 * @example
 * const session = createGameSession(ticTacToe, [
 *   { seat: 'X', participantId: 'stage:a', kind: 'self' },
 *   { seat: 'O', participantId: 'device:microphone', kind: 'other' },
 * ])
 * session.submitText('stage:a', 'b2')
 * // => { status: 'accepted', record: { ply: 0, seat: 'X', text: 'b2', ... }, ... }
 */
export function createGameSession<State, Move>(
  rules: GameRules<State, Move>,
  players: readonly GamePlayer[],
): GameSession<State, Move> {
  if (players.length !== rules.seats.length)
    throw new Error(`${rules.name} needs ${rules.seats.length} players, got ${players.length}`)
  if (new Set(players.map(player => player.seat)).size !== players.length)
    throw new Error('Two players cannot share a seat')
  if (new Set(players.map(player => player.participantId)).size !== players.length)
    throw new Error('One participant cannot hold two seats')

  const seatedPlayers = Object.freeze(players.map(player => Object.freeze({ ...player })))
  let state = rules.initialState(seatedPlayers.map(player => player.seat))
  const history: GameMoveRecord<Move>[] = []

  function player(participantId: string) {
    return seatedPlayers.find(candidate => candidate.participantId === participantId)
  }

  function currentPlayer() {
    const seat = rules.currentSeat(state)
    return seat === undefined ? undefined : seatedPlayers.find(candidate => candidate.seat === seat)
  }

  /** Rejections that do not depend on the move itself, in precedence order. */
  function turnRejection(participantId: string): GameSubmitResult<State, Move> | undefined {
    const mover = player(participantId)
    if (!mover)
      return rejected('unknown-player')
    if (rules.outcome(state).status !== 'in-progress')
      return rejected('game-over')
    if (rules.currentSeat(state) !== mover.seat)
      return rejected('not-your-turn')
    return undefined
  }

  function rejected(reason: GameMoveRejection): GameSubmitResult<State, Move> {
    const seat = rules.currentSeat(state)
    return seat === undefined ? { status: 'rejected', reason } : { status: 'rejected', reason, currentSeat: seat }
  }

  function play(participantId: string, move: Move): GameSubmitResult<State, Move> {
    // Moves are compared by canonical text, so the session needs no
    // game-specific equality and a parsed move matches its legal twin.
    const text = rules.formatMove(move)
    const legal = rules.legalMoves(state).find(candidate => rules.formatMove(candidate) === text)
    if (legal === undefined)
      return rejected('illegal-move')

    const mover = player(participantId)!
    const record: GameMoveRecord<Move> = { ply: history.length, seat: mover.seat, participantId, move: legal, text }
    state = rules.applyMove(state, legal)
    history.push(record)
    return { status: 'accepted', record, state, outcome: rules.outcome(state) }
  }

  return {
    rules,
    players: seatedPlayers,
    state: () => state,
    history: () => [...history],
    outcome: () => rules.outcome(state),
    currentPlayer,
    player,
    submit(participantId, move) {
      return turnRejection(participantId) ?? play(participantId, move)
    },
    submitText(participantId, text) {
      const rejection = turnRejection(participantId)
      if (rejection)
        return rejection

      const move = rules.parseMove(text)
      if (move === undefined)
        return rejected('unreadable-move')
      return play(participantId, move)
    },
  }
}
