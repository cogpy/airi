import type { CoplayTable } from './table'

import { describe, expect, it } from 'vitest'

import { characterTurnPrompt, createGameMoveTool, GAME_MOVE_TOOL_NAME, gameContextMessage } from './character-turn'
import { findCoplayGame } from './table'

const toolOptions = { messages: [], toolCallId: 'call-1' }

function openTicTacToe(): CoplayTable {
  return findCoplayGame('tic-tac-toe')!.open('coplay:test', [
    { seat: 'X', participantId: 'stage:airi', kind: 'self' },
    { seat: 'O', participantId: 'device:microphone', kind: 'other' },
  ])
}

describe('coplay table', () => {
  it('plays moves as text and reports the canonical move', () => {
    const table = openTicTacToe()

    expect(table.submitText('stage:airi', 'I take B2')).toMatchObject({ status: 'accepted', ply: 0, seat: 'X', move: 'b2' })
    expect(table.ply()).toBe(1)
    expect(table.currentPlayer()?.participantId).toBe('device:microphone')
  })

  it('plays a fallback move only for the player to move', () => {
    const table = openTicTacToe()

    expect(table.submitFallback('device:microphone')).toMatchObject({ status: 'rejected', reason: 'not-your-turn' })
    expect(table.submitFallback('stage:airi')).toMatchObject({ status: 'accepted', move: 'a1' })
  })

  it('does not know a game it was never given', () => {
    expect(findCoplayGame('chess')).toBeUndefined()
  })
})

describe('game_move tool', () => {
  it('passes the move text to the table and tells the model it was played', async () => {
    const table = openTicTacToe()
    const tool = createGameMoveTool(table, move => table.submitText('stage:airi', move))

    const reply = await tool.execute({ move: ' c3 ' }, toolOptions)

    expect(tool.function.name).toBe(GAME_MOVE_TOOL_NAME)
    expect(reply).toBe('You played c3. Now wait for your partner\'s move.')
    expect(table.ply()).toBe(1)
  })

  it('answers an illegal move with the reason and the legal moves, so the model can retry', async () => {
    const table = openTicTacToe()
    table.submitText('stage:airi', 'a1')
    table.submitText('device:microphone', 'b1')
    const tool = createGameMoveTool(table, move => table.submitText('stage:airi', move))

    const reply = await tool.execute({ move: 'a1' }, toolOptions)

    expect(reply).toContain('Move "a1" was not played: that move is not legal now.')
    expect(reply).toContain('Legal moves: c1, a2, b2, c2, a3, b3, c3.')
    expect(table.ply()).toBe(2)
  })

  it('refuses an argument that is not move text without touching the table', async () => {
    const table = openTicTacToe()
    const tool = createGameMoveTool(table, () => {
      throw new Error('must not be called')
    })

    expect(await tool.execute({ move: 5 }, toolOptions)).toContain('No move was played')
    expect(await tool.execute({}, toolOptions)).toContain('No move was played')
  })

  it('declares an object schema with a required move', () => {
    const tool = createGameMoveTool(openTicTacToe(), () => ({ status: 'rejected', reason: 'game-over' }))

    expect(tool.function.parameters).toMatchObject({ type: 'object', required: ['move'] })
  })
})

describe('character turn text', () => {
  it('asks her to move with the position and the tool name', () => {
    const prompt = characterTurnPrompt(openTicTacToe(), 'X', 'Mika')

    expect(prompt).toContain('(Tic-tac-toe with Mika) It is your move.')
    expect(prompt).toContain('Legal moves: a1')
    expect(prompt).toContain('game_move')
  })

  it('puts the position into the game lane, replacing the previous one', () => {
    const message = gameContextMessage(openTicTacToe(), 'X', 'Mika')

    expect(message).toMatchObject({ lane: 'game', strategy: 'replace-self', contextId: 'coplay:test', metadata: { source: { id: 'coplay' } } })
    expect(message.text).toContain('You are playing Tic-tac-toe with Mika.')
  })
})
