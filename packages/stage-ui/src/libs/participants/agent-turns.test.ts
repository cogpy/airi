import type { AgentTurn } from './agent-turns'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAgentTurnAssembler } from './agent-turns'

const SETTLE_MS = 1500

describe('createAgentTurnAssembler', () => {
  let turns: AgentTurn[]
  let assembler: ReturnType<typeof createAgentTurnAssembler>

  beforeEach(() => {
    vi.useFakeTimers()
    turns = []
    assembler = createAgentTurnAssembler(turn => turns.push(turn), { settleMs: SETTLE_MS })
  })

  afterEach(() => {
    assembler.reset()
    vi.useRealTimers()
  })

  /** Publishes one played sentence the way a stage does: start with its text, then end. */
  function speakSentence(participantId: string, id: string, text: string, turnId?: string) {
    assembler.activity({ participantId, phase: 'start' })
    assembler.utterance({ id, participantId, name: 'Rin', text, turnId })
    assembler.activity({ participantId, phase: 'end' })
  }

  it('joins the sentences of one turn into one answerable turn', () => {
    speakSentence('stage-b', 'u1', 'Hello.')
    vi.advanceTimersByTime(SETTLE_MS - 500)
    speakSentence('stage-b', 'u2', 'How are you?')
    vi.advanceTimersByTime(SETTLE_MS)

    expect(turns).toEqual([{ participantId: 'stage-b', name: 'Rin', id: 'u1', text: 'Hello. How are you?' }])
  })

  it('waits while the agent is still speaking', () => {
    assembler.activity({ participantId: 'stage-b', phase: 'start' })
    assembler.utterance({ id: 'u1', participantId: 'stage-b', text: 'A long sentence' })
    vi.advanceTimersByTime(SETTLE_MS * 10)

    expect(turns).toEqual([])
  })

  it('delivers once the agent has been silent for the settle time', () => {
    speakSentence('stage-b', 'u1', 'Hello.')
    vi.advanceTimersByTime(SETTLE_MS - 1)

    expect(turns).toEqual([])

    vi.advanceTimersByTime(1)

    expect(turns).toHaveLength(1)
  })

  it('ends a turn at once when the next utterance belongs to a new turn', () => {
    speakSentence('stage-b', 'u1', 'First turn.', 'turn-1')
    speakSentence('stage-b', 'u2', 'Second turn.', 'turn-2')

    expect(turns).toEqual([{ participantId: 'stage-b', name: 'Rin', id: 'u1', text: 'First turn.' }])

    vi.advanceTimersByTime(SETTLE_MS)

    expect(turns.at(-1)).toEqual({ participantId: 'stage-b', name: 'Rin', id: 'u2', text: 'Second turn.' })
  })

  it('keeps agents apart', () => {
    speakSentence('stage-b', 'u1', 'From B.')
    speakSentence('stage-c', 'u2', 'From C.')
    vi.advanceTimersByTime(SETTLE_MS)

    expect(turns.map(turn => turn.participantId)).toEqual(['stage-b', 'stage-c'])
  })

  it('delivers nothing for speech without text', () => {
    assembler.activity({ participantId: 'stage-b', phase: 'start' })
    assembler.activity({ participantId: 'stage-b', phase: 'end' })
    vi.advanceTimersByTime(SETTLE_MS)

    expect(turns).toEqual([])
  })

  it('drops unfinished turns on reset', () => {
    speakSentence('stage-b', 'u1', 'Hello.')
    assembler.reset()
    vi.advanceTimersByTime(SETTLE_MS)

    expect(turns).toEqual([])
  })
})
