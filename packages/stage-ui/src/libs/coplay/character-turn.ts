import type { Tool } from '@xsai/shared-chat'

import type { ContextMessage } from '../../types/chat'
import type { CoplayTable, TableMoveResult } from './table'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { rawTool } from '@xsai/tool'
import { nanoid } from 'nanoid'

import * as v from 'valibot'

/** Model-facing name of the tool she moves with. */
export const GAME_MOVE_TOOL_NAME = 'game_move'

/**
 * Source id of game context messages. The chat context registry keeps one
 * bucket per source, and game messages replace each other in it, so the
 * model always sees only the latest position.
 */
const COPLAY_CONTEXT_SOURCE_ID = 'coplay'

const gameMoveInput = v.object({
  move: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
})

const REJECTION_TEXT: Record<Extract<TableMoveResult, { status: 'rejected' }>['reason'], string> = {
  'unknown-player': 'you are not seated in this game',
  'game-over': 'the game is already over',
  'not-your-turn': 'it is not your turn',
  'unreadable-move': 'that text names no move',
  'illegal-move': 'that move is not legal now',
}

/** Plain-language reason for a rejected move, for the model and the log. */
export function rejectionText(reason: Extract<TableMoveResult, { status: 'rejected' }>['reason']): string {
  return REJECTION_TEXT[reason]
}

/**
 * The game as side context for her next model calls: which game, against
 * whom, and the position from her seat.
 *
 * Every message for one stage shares one source bucket and uses
 * `replace-self`, so a new position replaces the old one instead of piling
 * up. `lane: 'game'` is the lane the participants ADR gives game state.
 */
export function gameContextMessage(table: CoplayTable, selfSeat: string, partnerName: string): ContextMessage {
  return {
    id: nanoid(),
    contextId: table.sessionId,
    lane: 'game',
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: { source: { id: COPLAY_CONTEXT_SOURCE_ID } },
    text: `You are playing ${table.gameName} with ${partnerName}.\n${table.describe(selfSeat)}`,
    createdAt: Date.now(),
  }
}

/**
 * The user turn that asks her to move.
 *
 * It repeats the position although the game context carries it too: context
 * is side information, and the move request is the one thing this turn is
 * for, so the legal moves sit next to the instruction.
 */
export function characterTurnPrompt(table: CoplayTable, selfSeat: string, partnerName: string): string {
  return [
    `(${table.gameName} with ${partnerName}) It is your move.`,
    table.describe(selfSeat),
    `Call the ${GAME_MOVE_TOOL_NAME} tool once with your move. You may also say a short line to ${partnerName}.`,
  ].join('\n')
}

/**
 * The tool she moves with, for one request.
 *
 * `play` submits the move text to the table and returns the result. The tool
 * answers the model in plain text either way: on a rejection it names the
 * reason and the legal moves, so the model can call again in the same turn.
 * An argument that is not a non-empty string is answered the same way and
 * never reaches the table.
 */
export function createGameMoveTool(table: CoplayTable, play: (move: string) => TableMoveResult): Tool {
  return rawTool<unknown>({
    name: GAME_MOVE_TOOL_NAME,
    description: `Make your move in ${table.gameName}. Call it once, on your turn, with one legal move written as the game describes it.`,
    parameters: {
      type: 'object',
      properties: {
        move: { type: 'string', description: 'Your move, such as b2.' },
      },
      required: ['move'],
      additionalProperties: false,
    },
    execute: (input) => {
      const parsed = v.safeParse(gameMoveInput, input)
      if (!parsed.success)
        return `No move was played: give the move as text. Legal moves: ${table.legalMoves().join(', ')}.`

      const result = play(parsed.output.move)
      if (result.status === 'rejected') {
        const refused = `Move "${parsed.output.move}" was not played: ${rejectionText(result.reason)}.`
        if (result.reason !== 'unreadable-move' && result.reason !== 'illegal-move')
          return refused
        return `${refused} Legal moves: ${table.legalMoves().join(', ')}.`
      }

      if (result.outcome.status === 'draw')
        return `You played ${result.move}. The game is a draw.`
      if (result.outcome.status === 'win')
        return result.outcome.seat === result.seat ? `You played ${result.move} and won.` : `You played ${result.move}. The game is over.`
      return `You played ${result.move}. Now wait for your partner's move.`
    },
  })
}
