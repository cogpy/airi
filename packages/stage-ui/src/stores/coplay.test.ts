import type { Tool } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

import { useChatContextStore } from './chat/context-store'
import { useCoplayStore } from './coplay'
import { DEVICE_PARTICIPANT, useParticipantsStore } from './participants'

/**
 * What the mocked model does on her turn: the move it names through the
 * tool, in order, or nothing when it skips the tool.
 */
let modelMoves: string[] = []
const ingest = vi.fn(async (_text: string, options: { tools?: Tool[] }, _sessionId?: string) => {
  const tool = options.tools?.find(candidate => candidate.function.name === 'game_move')
  for (const move of modelMoves)
    await tool?.execute({ move }, { messages: [], toolCallId: `call-${move}` })
})
const send = vi.fn()
const coplay = ref<Record<string, unknown>>({ enabled: true })
const chatProvider = { generation: vi.fn() }

vi.mock('./chat', () => ({
  useChatStore: () => ({ ingest }),
}))

const sessionState = reactive({ activeSessionId: 'session-1', messages: [] as Array<{ role: string, interrupted?: true }> })

vi.mock('./chat/session-store', () => ({
  useChatSessionStore: () => ({
    get activeSessionId() {
      return sessionState.activeSessionId
    },
    set activeSessionId(value: string) {
      sessionState.activeSessionId = value
    },
    getSessionMessages: () => sessionState.messages,
  }),
}))

vi.mock('./mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({ send }),
}))

vi.mock('./modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: ref('test-provider'),
    activeModel: ref('test-model'),
    activeTemperature: ref(undefined),
    activeTopP: ref(undefined),
    getChatProviderInstance: vi.fn(async () => chatProvider),
  }),
}))

vi.mock('./modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCard: ref({ name: 'Airi', extensions: { airi: { modules: { coplay: coplay.value } } } }),
  }),
}))

const devicePartner = { participantId: DEVICE_PARTICIPANT.id, origin: 'device' as const, name: 'you' }

/** Lets the store's background model calls settle. */
async function settle() {
  await vi.waitFor(() => expect(useCoplayStore().characterThinking).toBe(false))
  await new Promise(resolve => setTimeout(resolve, 0))
}

function sentOfType(type: string) {
  return send.mock.calls.map(([event]) => event).filter(event => event.type === type)
}

describe('coplay store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    modelMoves = []
    sessionState.activeSessionId = 'session-1'
    sessionState.messages = []
    ingest.mockClear()
    send.mockClear()
    coplay.value = { enabled: true }
  })

  it('refuses to start a game when the card has co-play off', async () => {
    coplay.value = {}

    await expect(useCoplayStore().startSession({ partner: devicePartner })).rejects.toThrow('Co-play is off')
  })

  it('asks her to move with the game_move tool and plays the move she names', async () => {
    modelMoves = ['b2']
    const store = useCoplayStore()

    await store.startSession({ partner: devicePartner })
    await settle()

    expect(ingest).toHaveBeenCalledTimes(1)
    expect(ingest).toHaveBeenCalledWith(expect.stringContaining('It is your move.'), expect.objectContaining({ model: 'test-model', chatProvider }), 'session-1')
    expect(store.log.map(entry => entry.kind)).toEqual(['started', 'move'])
    expect(store.view).toContain('2  . X .')
  })

  it('puts the position into the chat context game lane after each move', async () => {
    modelMoves = ['b2']
    const store = useCoplayStore()

    await store.startSession({ partner: devicePartner })
    await settle()

    const [message] = useChatContextStore().getContextsSnapshot().coplay ?? []
    expect(message).toMatchObject({ lane: 'game', strategy: 'replace-self' })
    expect(message?.text).toContain('2  . X .')
  })

  it('exposes the board, legal moves and whose turn it is for a UI', async () => {
    modelMoves = ['b2']
    const store = useCoplayStore()

    await store.startSession({ partner: devicePartner })
    await settle()

    expect(store.gameName).toBe('Tic-tac-toe')
    expect(store.characterSeat).toBe(store.board?.cells[4]?.seat)
    expect(store.board?.cells[4]).toMatchObject({ mark: 'X' })
    expect(store.turn).toBe('partner')
    expect(store.legalMoves).toHaveLength(8)
    expect(store.legalMoves).not.toContain('b2')
  })

  it('leaves the last position on the board but offers no move after a stop', async () => {
    modelMoves = ['b2']
    const store = useCoplayStore()
    await store.startSession({ partner: devicePartner })
    await settle()

    store.stopSession()

    expect(store.status).toBe('over')
    expect(store.turn).toBeUndefined()
    expect(store.legalMoves).toEqual([])
    expect(store.board?.cells[4]).toMatchObject({ mark: 'X' })
  })

  it('asks the model again with the reason when a call gives no move', async () => {
    const store = useCoplayStore()
    // The first call skips the tool; the second names a move.
    ingest.mockImplementationOnce(async () => {})
    modelMoves = ['b2']

    await store.startSession({ partner: devicePartner })
    await settle()

    expect(ingest).toHaveBeenCalledTimes(2)
    expect(ingest.mock.calls[1]?.[0]).toContain('Your last try gave no legal move: she named no move.')
    expect(store.log.map(entry => entry.kind)).toEqual(['started', 'move'])
    expect(store.characterStuck).toBe(false)
  })

  it('waits on her turn when no model call gives a legal move, and moves when asked again', async () => {
    const store = useCoplayStore()

    await store.startSession({ partner: devicePartner })
    await settle()

    expect(ingest).toHaveBeenCalledTimes(3)
    expect(store.log.at(-1)).toMatchObject({ kind: 'waiting', text: 'She did not move (she named no move). The game waits for her.' })
    expect(store.characterStuck).toBe(true)
    expect(store.turn).toBe('character')
    expect(store.board?.cells.every(cell => !cell.mark)).toBe(true)

    modelMoves = ['b2']
    store.retryCharacterMove()
    await settle()

    expect(ingest).toHaveBeenCalledTimes(4)
    expect(store.characterStuck).toBe(false)
    expect(store.board?.cells[4]).toMatchObject({ mark: 'X' })
  })

  // https://github.com/cogpy/airi/pull/31#discussion_r4404183437
  //
  // ROOT CAUSE:
  //
  // The retry loop asked the model again after any call that gave no move,
  // including a call the user cancelled by talking over her. The retry
  // restarted her speech right after the interruption.
  //
  // We fixed this by stopping the retries when her reply was cancelled.
  it('stops asking the model again after her reply is cancelled', async () => {
    const store = useCoplayStore()
    ingest.mockImplementationOnce(async () => {
      throw new DOMException('Interrupted by voice', 'AbortError')
    })

    await store.startSession({ partner: devicePartner })
    await settle()

    expect(ingest).toHaveBeenCalledTimes(1)
    expect(store.log.at(-1)).toMatchObject({ kind: 'waiting', text: 'She did not move (her reply was cancelled). The game waits for her.' })
    expect(store.characterStuck).toBe(true)
  })

  it('stops asking again when her reply settles as interrupted', async () => {
    const store = useCoplayStore()
    ingest.mockImplementationOnce(async () => {
      sessionState.messages = [{ role: 'assistant', interrupted: true }]
    })

    await store.startSession({ partner: devicePartner })
    await settle()

    expect(ingest).toHaveBeenCalledTimes(1)
    expect(store.log.at(-1)?.text).toContain('her reply was cancelled')
  })

  // https://github.com/cogpy/airi/pull/31#discussion_r4406540177
  //
  // ROOT CAUSE:
  //
  // Each try read the active session again, so a chat switch during a try
  // sent the next try into the newly selected conversation.
  //
  // We fixed this by capturing the session when her turn starts.
  it('sends every try of a turn to the conversation where the turn started', async () => {
    sessionState.activeSessionId = 'session-start'
    const store = useCoplayStore()
    ingest.mockImplementationOnce(async () => {
      sessionState.activeSessionId = 'session-other'
    })
    modelMoves = ['b2']

    await store.startSession({ partner: devicePartner })
    await settle()

    expect(ingest).toHaveBeenCalledTimes(2)
    expect(ingest.mock.calls.map(call => call[2])).toEqual(['session-start', 'session-start'])
  })

  it('says which illegal move she kept naming when the game waits on her', async () => {
    const store = useCoplayStore()
    await store.startSession({ partner: devicePartner, characterMovesFirst: false })
    modelMoves = ['a1']
    store.submitPartnerMove('a1')
    await settle()

    expect(store.log.map(entry => entry.kind)).toEqual(['started', 'move', 'rejected', 'rejected', 'rejected', 'waiting'])
    expect(store.log.at(-1)?.text).toContain('her last move was "a1": that move is not legal now')
  })

  it('takes the user\'s moves, refuses a move out of turn, and plays to a result', async () => {
    const store = useCoplayStore()
    // Her model plays a1, then b1, then c1 to complete the top row.
    modelMoves = ['a1']
    await store.startSession({ partner: devicePartner })
    await settle()

    expect(store.submitPartnerMove('a1')).toMatchObject({ status: 'rejected', reason: 'illegal-move' })
    modelMoves = ['b1']
    expect(store.submitPartnerMove('c3')).toMatchObject({ status: 'accepted' })
    await settle()
    modelMoves = ['c1']
    expect(store.submitPartnerMove('b2')).toMatchObject({ status: 'accepted' })
    await settle()

    expect(store.status).toBe('over')
    expect(store.outcome).toEqual({ status: 'win', seat: 'X' })
    expect(store.log.at(-1)).toMatchObject({ kind: 'ended', text: 'She won.' })
    expect(() => store.submitPartnerMove('a3')).toThrow('No game is being played')
  })
})

describe('coplay store with an agent partner', () => {
  const agentPartner = { participantId: 'stage:mika', origin: 'agent' as const, name: 'Mika' }

  beforeEach(() => {
    setActivePinia(createPinia())
    modelMoves = []
    sessionState.activeSessionId = 'session-1'
    sessionState.messages = []
    ingest.mockClear()
    send.mockClear()
    coplay.value = { enabled: true }
  })

  it('publishes the game start with every seat and each of her moves', async () => {
    modelMoves = ['b2']
    const store = useCoplayStore()
    const selfId = useParticipantsStore().stageParticipantId

    const table = await store.startSession({ partner: agentPartner })
    await settle()

    expect(sentOfType('output:game:session')).toEqual([expect.objectContaining({
      data: expect.objectContaining({
        sessionId: table.sessionId,
        gameId: 'tic-tac-toe',
        participantId: selfId,
        phase: 'start',
        seats: [{ seat: 'X', participantId: selfId }, { seat: 'O', participantId: 'stage:mika' }],
      }),
    })])
    expect(sentOfType('output:game:action')).toEqual([expect.objectContaining({
      data: expect.objectContaining({ sessionId: table.sessionId, participantId: selfId, move: 'b2' }),
    })])
  })

  it('plays the partner\'s published move for its session only, then takes her turn', async () => {
    modelMoves = ['b2']
    const store = useCoplayStore()
    const table = await store.startSession({ partner: agentPartner })
    await settle()
    ingest.mockClear()
    modelMoves = ['c3']

    expect(store.receivePartnerAction({ sessionId: 'coplay:other', gameId: 'tic-tac-toe', participantId: 'stage:mika', move: 'a1', at: 1 })).toBeUndefined()
    expect(store.receivePartnerAction({ sessionId: table.sessionId, gameId: 'tic-tac-toe', participantId: 'stage:mika', move: 'a1', at: 1 })).toMatchObject({ status: 'accepted' })
    await settle()

    expect(ingest).toHaveBeenCalledTimes(1)
    expect(store.view).toContain('1  O . .')
    expect(store.view).toContain('3  . . X')
  })

  it('joins a game another stage started with her and plays her seat', async () => {
    modelMoves = ['b2']
    const store = useCoplayStore()
    const selfId = useParticipantsStore().stageParticipantId
    const start = {
      sessionId: 'coplay:from-mika',
      gameId: 'tic-tac-toe',
      participantId: 'stage:mika',
      name: 'Mika',
      phase: 'start' as const,
      seats: [{ seat: 'X', participantId: 'stage:mika' }, { seat: 'O', participantId: selfId }],
      at: 1,
    }

    expect(await store.joinSession(start)).toBe(true)
    expect(ingest).not.toHaveBeenCalled()
    expect(await store.joinSession({ ...start, sessionId: 'coplay:second' })).toBe(false)

    store.receivePartnerAction({ sessionId: 'coplay:from-mika', gameId: 'tic-tac-toe', participantId: 'stage:mika', move: 'a1', at: 2 })
    await settle()

    expect(sentOfType('output:game:action')).toEqual([expect.objectContaining({
      data: expect.objectContaining({ sessionId: 'coplay:from-mika', participantId: selfId, move: 'b2' }),
    })])
  })

  it('does not join a game that does not seat her', async () => {
    const store = useCoplayStore()

    expect(await store.joinSession({
      sessionId: 'coplay:not-mine',
      gameId: 'tic-tac-toe',
      participantId: 'stage:mika',
      phase: 'start',
      seats: [{ seat: 'X', participantId: 'stage:mika' }, { seat: 'O', participantId: 'stage:rin' }],
      at: 1,
    })).toBe(false)
  })

  it('publishes a stop, and stops when the partner stops', async () => {
    const store = useCoplayStore()
    const table = await store.startSession({ partner: agentPartner, characterMovesFirst: false })

    store.receiveSessionEnd({ sessionId: table.sessionId, gameId: 'tic-tac-toe', participantId: 'stage:mika', phase: 'end', seats: [], reason: 'bored', at: 1 })
    expect(store.status).toBe('over')
    expect(store.log.at(-1)?.text).toBe('Mika stopped the game (bored).')

    const second = await store.startSession({ partner: agentPartner, characterMovesFirst: false })
    store.stopSession()

    expect(sentOfType('output:game:session').at(-1)).toMatchObject({ data: { sessionId: second.sessionId, phase: 'end', reason: 'stopped' } })
    expect(store.status).toBe('over')
  })
})
