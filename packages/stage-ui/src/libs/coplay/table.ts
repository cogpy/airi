import type { GameMoveRejection, GameOutcome, GamePlayer, GameRules } from '@proj-airi/cognitive-airicog/coplay'

import { chooseFallbackMove, createGameSession, ticTacToe } from '@proj-airi/cognitive-airicog/coplay'

/**
 * The answer to one move at a table, with the move as text.
 *
 * An accepted move carries the canonical move text, which is what a stage
 * publishes to its peers and logs. A rejected move carries the session's
 * reason; the table is unchanged.
 */
export type TableMoveResult
  = | { status: 'accepted', ply: number, seat: string, participantId: string, move: string, outcome: GameOutcome }
    | { status: 'rejected', reason: GameMoveRejection, currentSeat?: string }

/**
 * One game in play, seen only through text.
 *
 * A stage works with games it knows only by id: moves come from a model's
 * tool call, a person's input, or a peer's event, and all of them are text.
 * The table hides the game's own state and move types behind that text, so
 * the store holds any game the same way. Turn order, legality and history
 * are the session's, from `@proj-airi/cognitive-airicog/coplay`.
 */
export interface CoplayTable {
  /** Id shared with peers that play the same game. */
  sessionId: string
  gameId: string
  /** Name a model or a person reads. */
  gameName: string
  /** Seated players in turn order. */
  players: readonly GamePlayer[]
  outcome: () => GameOutcome
  /** Accepted moves so far. It identifies a turn: it grows by one per move. */
  ply: () => number
  /** Player whose turn it is, or `undefined` once the game is over. */
  currentPlayer: () => GamePlayer | undefined
  /** The game as text from the point of view of `seat`. */
  describe: (seat: string) => string
  /** Legal moves for the player to move, as text. */
  legalMoves: () => string[]
  submitText: (participantId: string, text: string) => TableMoveResult
  /**
   * Plays the fallback move from `chooseFallbackMove` for the participant.
   * Rejected for the same reasons as any other move, such as when it is not
   * that participant's turn.
   */
  submitFallback: (participantId: string) => TableMoveResult
}

/**
 * Seats `players` at a new session of `rules` and erases the game's own
 * types. This is the one place a game's `State` and `Move` are in scope.
 */
function openTypedTable<State, Move>(rules: GameRules<State, Move>, sessionId: string, players: readonly GamePlayer[]): CoplayTable {
  const session = createGameSession(rules, players)

  function toTableResult(result: ReturnType<typeof session.submit>): TableMoveResult {
    if (result.status === 'rejected')
      return result
    const { ply, seat, participantId, text } = result.record
    return { status: 'accepted', ply, seat, participantId, move: text, outcome: result.outcome }
  }

  return {
    sessionId,
    gameId: rules.id,
    gameName: rules.name,
    players: session.players,
    outcome: session.outcome,
    ply: () => session.history().length,
    currentPlayer: session.currentPlayer,
    describe: seat => rules.describe(session.state(), seat),
    legalMoves: () => rules.legalMoves(session.state()).map(rules.formatMove),
    submitText: (participantId, text) => toTableResult(session.submitText(participantId, text)),
    submitFallback(participantId) {
      const move = chooseFallbackMove(rules, session.state())
      // No legal move means the game is over; `submitText` reports that the
      // same way it reports it for any other move.
      return move === undefined
        ? toTableResult(session.submitText(participantId, ''))
        : toTableResult(session.submit(participantId, move))
    },
  }
}

/**
 * A game this stage can play, before anyone is seated.
 *
 * `seats` are the game's usual seat names in turn order. A stage that starts
 * a game seats players under these names and sends them to peers, so every
 * stage seated in the game uses the same names.
 */
export interface CoplayGame {
  id: string
  name: string
  seats: readonly string[]
  /** Seats `players` at a new session. Throws when they do not fit the game. */
  open: (sessionId: string, players: readonly GamePlayer[]) => CoplayTable
}

function gameFrom<State, Move>(rules: GameRules<State, Move>): CoplayGame {
  return Object.freeze({
    id: rules.id,
    name: rules.name,
    seats: rules.seats,
    open: (sessionId: string, players: readonly GamePlayer[]) => openTypedTable(rules, sessionId, players),
  })
}

/**
 * Games this stage can play, by id. Peers name a game by this id in
 * `output:game:session`; a stage ignores a game it does not know.
 */
const games: ReadonlyMap<string, CoplayGame> = new Map<string, CoplayGame>([
  [ticTacToe.id, gameFrom(ticTacToe)],
])

/** The game with this id, or `undefined` when this stage does not know it. */
export function findCoplayGame(gameId: string): CoplayGame | undefined {
  return games.get(gameId)
}
