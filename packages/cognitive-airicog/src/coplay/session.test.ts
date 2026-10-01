import type { GamePlayer } from './rules'

import { describe, expect, it } from 'vitest'

import { createGameSession } from './session'
import { ticTacToe } from './tic-tac-toe'

const players: GamePlayer[] = [
  { seat: 'X', participantId: 'stage:airi', kind: 'self' },
  { seat: 'O', participantId: 'device:microphone', kind: 'other' },
]

/** Plays moves alternately, X first, and returns every result. */
function playAll(moves: string[]) {
  const session = createGameSession(ticTacToe, players)
  const results = moves.map((move, index) => session.submitText(players[index % 2]!.participantId, move))
  return { session, results }
}

describe('createGameSession', () => {
  it('lets the first player move first and records the move', () => {
    const session = createGameSession(ticTacToe, players)

    const result = session.submitText('stage:airi', 'b2')

    expect(result).toMatchObject({ status: 'accepted', record: { ply: 0, seat: 'X', participantId: 'stage:airi', move: 4, text: 'b2' }, outcome: { status: 'in-progress' } })
    expect(session.history()).toHaveLength(1)
    expect(session.currentPlayer()).toEqual(players[1])
  })

  it('rejects a move out of turn and leaves the game unchanged', () => {
    const session = createGameSession(ticTacToe, players)

    const result = session.submitText('device:microphone', 'a1')

    expect(result).toEqual({ status: 'rejected', reason: 'not-your-turn', currentSeat: 'X' })
    expect(session.history()).toEqual([])
  })

  it('rejects a participant without a seat before anything else', () => {
    const session = createGameSession(ticTacToe, players)

    expect(session.submitText('stage:stranger', 'not a move')).toEqual({ status: 'rejected', reason: 'unknown-player', currentSeat: 'X' })
  })

  it('rejects text that names no move', () => {
    const session = createGameSession(ticTacToe, players)

    expect(session.submitText('stage:airi', 'the middle one')).toEqual({ status: 'rejected', reason: 'unreadable-move', currentSeat: 'X' })
  })

  it('rejects a move onto a taken cell', () => {
    const session = createGameSession(ticTacToe, players)
    session.submitText('stage:airi', 'b2')

    expect(session.submit('device:microphone', 4)).toEqual({ status: 'rejected', reason: 'illegal-move', currentSeat: 'O' })
    expect(session.history()).toHaveLength(1)
  })

  it('plays a full game to a win and then refuses further moves', () => {
    // X: a1 b1 c1 wins the top row; O: a2 b2.
    const { session, results } = playAll(['a1', 'a2', 'b1', 'b2', 'c1'])

    expect(results.every(result => result.status === 'accepted')).toBe(true)
    expect(results.at(-1)).toMatchObject({ status: 'accepted', outcome: { status: 'win', seat: 'X' } })
    expect(session.outcome()).toEqual({ status: 'win', seat: 'X' })
    expect(session.currentPlayer()).toBeUndefined()
    expect(session.submitText('device:microphone', 'c3')).toEqual({ status: 'rejected', reason: 'game-over' })
  })

  it('plays a full game to a draw', () => {
    // X O X / X O O / O X X
    const { session, results } = playAll(['a1', 'b1', 'c1', 'b2', 'a2', 'c2', 'b3', 'a3', 'c3'])

    expect(results.every(result => result.status === 'accepted')).toBe(true)
    expect(session.outcome()).toEqual({ status: 'draw' })
    expect(session.history().map(record => record.text)).toEqual(['a1', 'b1', 'c1', 'b2', 'a2', 'c2', 'b3', 'a3', 'c3'])
  })

  it('refuses a table that does not fit the game', () => {
    expect(() => createGameSession(ticTacToe, [players[0]!])).toThrow('needs 2 players')
    expect(() => createGameSession(ticTacToe, [players[0]!, { ...players[1]!, seat: 'X' }])).toThrow('share a seat')
    expect(() => createGameSession(ticTacToe, [players[0]!, { ...players[1]!, participantId: 'stage:airi' }])).toThrow('two seats')
  })
})
