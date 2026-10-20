import type { GameMoveRejection, GameOutcome, GamePlayer, GameRules, TicTacToeState } from '@proj-airi/cognitive-airicog/coplay'

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
 * One square of a board, as a UI shows it.
 *
 * `id` is stable for the square across moves, so a UI can key it. `move` is
 * present only while playing the square is legal for the player to move; a UI
 * submits that text as the move, so the board never builds move text itself.
 */
export interface CoplayBoardCell {
  id: string
  /** Mark shown on the square, such as `X`, or absent when it is empty. */
  mark?: string
  /** Seat that owns the mark, so a UI can color the character's marks apart. */
  seat?: string
  /** Move text that plays this square, when that is legal now. */
  move?: string
  /** Name a screen reader reads, such as `b2`. */
  label: string
}

/**
 * A game position as a grid of squares in reading order (`columns` per row).
 *
 * Games that are not played on a grid have no board view; a UI shows their
 * text description and legal moves instead.
 */
export interface CoplayBoardView {
  columns: number
  rows: number
  cells: readonly CoplayBoardCell[]
}

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
  /** The position as a grid, or `undefined` for a game with no board view. */
  board: () => CoplayBoardView | undefined
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
function openTypedTable<State, Move>(
  rules: GameRules<State, Move>,
  toBoard: ((state: State, legalMoves: ReadonlySet<string>) => CoplayBoardView) | undefined,
  sessionId: string,
  players: readonly GamePlayer[],
): CoplayTable {
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
    board() {
      if (!toBoard)
        return undefined
      const state = session.state()
      return toBoard(state, new Set(rules.legalMoves(state).map(rules.formatMove)))
    },
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

/**
 * Registers a game. `toBoard` is the game's optional grid view; it lives here,
 * not in the rules, because how a position is drawn is the stage's concern
 * while `@proj-airi/cognitive-airicog/coplay` stays free of presentation.
 */
function gameFrom<State, Move>(
  rules: GameRules<State, Move>,
  toBoard?: (state: State, legalMoves: ReadonlySet<string>) => CoplayBoardView,
): CoplayGame {
  return Object.freeze({
    id: rules.id,
    name: rules.name,
    seats: rules.seats,
    open: (sessionId: string, players: readonly GamePlayer[]) => openTypedTable(rules, toBoard, sessionId, players),
  })
}

const TIC_TAC_TOE_MARKS = ['X', 'O'] as const

/**
 * Draws a tic-tac-toe position as a 3 by 3 grid.
 *
 * @example
 * ticTacToeBoard({ seats: ['x', 'o'], cells: [0, null, ...] }, new Set(['b1']))
 * // => { columns: 3, rows: 3, cells: [{ id: 'a1', label: 'a1', mark: 'X', seat: 'x' }, { id: 'b1', label: 'b1', move: 'b1' }, ...] }
 */
function ticTacToeBoard(state: TicTacToeState, legalMoves: ReadonlySet<string>): CoplayBoardView {
  return {
    columns: 3,
    rows: 3,
    cells: state.cells.map((owner, index) => {
      const square = ticTacToe.formatMove(index)
      if (owner !== null)
        return { id: square, label: square, mark: TIC_TAC_TOE_MARKS[owner], seat: state.seats[owner] }
      return legalMoves.has(square) ? { id: square, label: square, move: square } : { id: square, label: square }
    }),
  }
}

/**
 * Games this stage can play, by id. Peers name a game by this id in
 * `output:game:session`; a stage ignores a game it does not know.
 */
const games: ReadonlyMap<string, CoplayGame> = new Map<string, CoplayGame>([
  [ticTacToe.id, gameFrom(ticTacToe, ticTacToeBoard)],
])

/** The game with this id, or `undefined` when this stage does not know it. */
export function findCoplayGame(gameId: string): CoplayGame | undefined {
  return games.get(gameId)
}

/** Every game this stage can play, for a UI to offer. */
export function listCoplayGames(): CoplayGame[] {
  return [...games.values()]
}
