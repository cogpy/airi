import type { GameOutcome, GameRules } from './rules'

/**
 * A tic-tac-toe position.
 *
 * `cells` holds nine entries in reading order (a1, b1, c1, a2, … c3). Each
 * entry is the index into `seats` of the seat that marked it, or `null`.
 * Seat `0` plays X and moves first; seat `1` plays O.
 */
export interface TicTacToeState {
  seats: readonly [string, string]
  cells: readonly (0 | 1 | null)[]
}

/** A cell index, `0` (a1) to `8` (c3), in reading order. */
export type TicTacToeMove = number

const COLUMNS = ['a', 'b', 'c'] as const
const MARKS = ['X', 'O'] as const

/** Every row, column and diagonal, as cell indexes. */
const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

function winnerIndex(cells: TicTacToeState['cells']): 0 | 1 | undefined {
  for (const [a, b, c] of LINES) {
    const mark = cells[a]
    if (mark !== null && mark !== undefined && mark === cells[b] && mark === cells[c])
      return mark
  }
  return undefined
}

function outcome(state: TicTacToeState): GameOutcome {
  const winner = winnerIndex(state.cells)
  if (winner !== undefined)
    return { status: 'win', seat: state.seats[winner] }
  if (state.cells.every(cell => cell !== null))
    return { status: 'draw' }
  return { status: 'in-progress' }
}

function turnIndex(state: TicTacToeState): 0 | 1 {
  return state.cells.filter(cell => cell !== null).length % 2 === 0 ? 0 : 1
}

function currentSeat(state: TicTacToeState): string | undefined {
  if (outcome(state).status !== 'in-progress')
    return undefined
  return state.seats[turnIndex(state)]
}

function legalMoves(state: TicTacToeState): TicTacToeMove[] {
  if (outcome(state).status !== 'in-progress')
    return []
  return state.cells.flatMap((cell, index) => cell === null ? [index] : [])
}

/**
 * Canonical text of a cell: column letter, then row number.
 *
 * @example
 * formatMove(4)
 * // => 'b2'
 */
function formatMove(move: TicTacToeMove): string {
  return `${COLUMNS[move % 3]}${Math.floor(move / 3) + 1}`
}

/**
 * Reads a cell from free text. A coordinate such as `b2` anywhere in the
 * text wins; otherwise text that is only a digit `1` to `9` names a cell in
 * reading order, as on a phone keypad.
 *
 * @example
 * parseMove('I take B2!')
 * // => 4
 * parseMove('7')
 * // => 6
 * parseMove('the middle')
 * // => undefined
 */
function parseMove(text: string): TicTacToeMove | undefined {
  const coordinate = /\b([a-c])\s*([1-3])\b/i.exec(text)
  if (coordinate)
    return (Number(coordinate[2]) - 1) * 3 + COLUMNS.indexOf(coordinate[1]!.toLowerCase() as typeof COLUMNS[number])

  const keypad = /^\s*([1-9])\s*$/.exec(text)
  if (keypad)
    return Number(keypad[1]) - 1

  return undefined
}

function describe(state: TicTacToeState, seat: string): string {
  const seatIndex = state.seats.indexOf(seat)
  const board = [0, 1, 2].map((row) => {
    const cells = [0, 1, 2].map((column) => {
      const cell = state.cells[row * 3 + column]
      return cell === null || cell === undefined ? '.' : MARKS[cell]
    })
    return `${row + 1}  ${cells.join(' ')}`
  })

  const lines = [
    seatIndex < 0
      ? 'Tic-tac-toe. You are watching.'
      : `Tic-tac-toe. You play ${MARKS[seatIndex]}; your opponent plays ${MARKS[1 - seatIndex]}.`,
    '   a b c',
    ...board,
  ]

  const result = outcome(state)
  if (result.status === 'win') {
    lines.push(result.seat === seat ? 'Game over: you won.' : `Game over: ${MARKS[state.seats.indexOf(result.seat)]} won.`)
    return lines.join('\n')
  }
  if (result.status === 'draw') {
    lines.push('Game over: a draw.')
    return lines.join('\n')
  }

  const toMove = turnIndex(state)
  if (toMove === seatIndex) {
    lines.push(`It is your turn. Legal moves: ${legalMoves(state).map(formatMove).join(', ')}.`)
    lines.push('Name a move as column letter then row number, such as b2.')
  }
  else {
    lines.push(`It is ${MARKS[toMove]}'s turn.`)
  }
  return lines.join('\n')
}

/**
 * Tic-tac-toe on a 3 by 3 board: the reference {@link GameRules}.
 *
 * It exists to prove the co-play core end to end with a game small enough to
 * check by hand. Its seats are `X` and `O`; a caller may rename them, and
 * the first seat always plays X and moves first. Moves are written `a1` to `c3`, column then row, row 1 at the
 * top.
 */
export const ticTacToe: GameRules<TicTacToeState, TicTacToeMove> = Object.freeze({
  id: 'tic-tac-toe',
  name: 'Tic-tac-toe',
  seats: Object.freeze(['X', 'O']),
  initialState(seats: readonly string[]): TicTacToeState {
    if (seats.length !== 2 || seats[0] === seats[1])
      throw new Error('Tic-tac-toe needs two distinct seats')
    return { seats: [seats[0]!, seats[1]!], cells: Array.from<0 | 1 | null>({ length: 9 }).fill(null) }
  },
  currentSeat,
  legalMoves,
  applyMove(state: TicTacToeState, move: TicTacToeMove): TicTacToeState {
    const cells = [...state.cells]
    cells[move] = turnIndex(state)
    return { seats: state.seats, cells }
  },
  outcome,
  describe,
  parseMove,
  formatMove,
})
