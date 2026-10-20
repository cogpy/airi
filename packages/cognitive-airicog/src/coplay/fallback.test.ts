import type { TicTacToeState } from './tic-tac-toe'

import { describe, expect, it } from 'vitest'

import { chooseFallbackMove } from './fallback'
import { ticTacToe } from './tic-tac-toe'

function after(...moves: string[]): TicTacToeState {
  return moves.reduce((state, text) => ticTacToe.applyMove(state, ticTacToe.parseMove(text)!), ticTacToe.initialState(['X', 'O']))
}

function fallbackText(state: TicTacToeState) {
  const move = chooseFallbackMove(ticTacToe, state)
  return move === undefined ? undefined : ticTacToe.formatMove(move)
}

describe('chooseFallbackMove', () => {
  it('takes a winning move when there is one', () => {
    // X has a1 and b1; O has a2 and b2. X to move: c1 wins, c2 would only block.
    expect(fallbackText(after('a1', 'a2', 'b1', 'b2'))).toBe('c1')
  })

  it('blocks an opponent who would win next', () => {
    // X has a1 and b1; O has c3. O to move must block c1.
    expect(fallbackText(after('a1', 'c3', 'b1'))).toBe('c1')
  })

  it('plays the first legal move when nothing is urgent', () => {
    expect(fallbackText(ticTacToe.initialState(['X', 'O']))).toBe('a1')
  })

  it('still plays the first legal move when every move loses', () => {
    // O faces two open X lines (c1 and a3) and can block only one.
    expect(fallbackText(after('a1', 'b2', 'b1', 'c3', 'a2'))).toBe('c1')
  })

  it('gives no move once the game is over', () => {
    expect(chooseFallbackMove(ticTacToe, after('a1', 'a2', 'b1', 'b2', 'c1'))).toBeUndefined()
  })
})
