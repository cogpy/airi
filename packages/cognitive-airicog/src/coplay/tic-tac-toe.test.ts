import type { TicTacToeState } from './tic-tac-toe'

import { describe, expect, it } from 'vitest'

import { ticTacToe } from './tic-tac-toe'

/** Applies moves written as text, X first. */
function after(...moves: string[]): TicTacToeState {
  return moves.reduce((state, text) => ticTacToe.applyMove(state, ticTacToe.parseMove(text)!), ticTacToe.initialState(['X', 'O']))
}

describe('ticTacToe', () => {
  it('starts empty with X to move and nine legal moves', () => {
    const state = ticTacToe.initialState(['X', 'O'])

    expect(ticTacToe.currentSeat(state)).toBe('X')
    expect(ticTacToe.legalMoves(state)).toHaveLength(9)
    expect(ticTacToe.outcome(state)).toEqual({ status: 'in-progress' })
  })

  it('formats and parses moves as the same cell', () => {
    for (const move of ticTacToe.legalMoves(ticTacToe.initialState(['X', 'O'])))
      expect(ticTacToe.parseMove(ticTacToe.formatMove(move))).toBe(move)
  })

  it('reads a move out of a sentence or a keypad digit', () => {
    expect(ticTacToe.parseMove('I will take C3, obviously.')).toBe(8)
    expect(ticTacToe.parseMove(' 5 ')).toBe(4)
    expect(ticTacToe.parseMove('somewhere nice')).toBeUndefined()
    expect(ticTacToe.parseMove('d4')).toBeUndefined()
  })

  it('finds a win on a diagonal', () => {
    expect(ticTacToe.outcome(after('a1', 'b1', 'b2', 'c1', 'c3'))).toEqual({ status: 'win', seat: 'X' })
  })

  it('describes the board, the side, and the legal moves to the player to move', () => {
    const description = ticTacToe.describe(after('b2'), 'O')

    expect(description).toContain('You play O')
    expect(description).toContain('2  . X .')
    expect(description).toContain('It is your turn. Legal moves: a1, b1, c1, a2, c2, a3, b3, c3.')
  })

  it('tells the waiting player whose turn it is, without legal moves', () => {
    const description = ticTacToe.describe(after('b2'), 'X')

    expect(description).toContain('It is O\'s turn.')
    expect(description).not.toContain('Legal moves')
  })

  it('describes the result once the game is over', () => {
    const won = after('a1', 'a2', 'b1', 'b2', 'c1')

    expect(ticTacToe.describe(won, 'X')).toContain('Game over: you won.')
    expect(ticTacToe.describe(won, 'O')).toContain('Game over: X won.')
    expect(ticTacToe.legalMoves(won)).toEqual([])
  })
})
