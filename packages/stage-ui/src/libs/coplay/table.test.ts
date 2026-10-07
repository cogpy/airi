import { describe, expect, it } from 'vitest'

import { findCoplayGame, listCoplayGames } from './table'

const players = [
  { seat: 'x', participantId: 'her', kind: 'self' as const },
  { seat: 'o', participantId: 'you', kind: 'other' as const },
]

function openTicTacToe() {
  return findCoplayGame('tic-tac-toe')!.open('session-1', players)
}

describe('coplay table board view', () => {
  it('lists tic-tac-toe as a playable game', () => {
    expect(listCoplayGames().map(game => game.id)).toContain('tic-tac-toe')
  })

  it('draws a tic-tac-toe position as a 3 by 3 grid in reading order', () => {
    const table = openTicTacToe()
    table.submitText('her', 'b2')

    const board = table.board()!
    expect(board).toMatchObject({ columns: 3, rows: 3 })
    expect(board.cells.map(cell => cell.id)).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3'])
    expect(board.cells[4]).toEqual({ id: 'b2', label: 'b2', mark: 'X', seat: 'x' })
  })

  it('offers a move only on squares that are legal to play now', () => {
    const table = openTicTacToe()
    table.submitText('her', 'b2')

    const cells = table.board()!.cells
    expect(cells.filter(cell => cell.move).map(cell => cell.move)).toEqual(table.legalMoves())
    expect(cells[4]?.move).toBeUndefined()
  })

  it('offers no move once the game is over', () => {
    const table = openTicTacToe()
    for (const [participantId, move] of [['her', 'a1'], ['you', 'a2'], ['her', 'b1'], ['you', 'b2'], ['her', 'c1']] as const)
      table.submitText(participantId, move)

    expect(table.outcome()).toEqual({ status: 'win', seat: 'x' })
    expect(table.board()!.cells.some(cell => cell.move)).toBe(false)
  })
})
