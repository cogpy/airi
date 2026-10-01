import type { Tool } from '@xsai/shared-chat'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatContextStore } from './chat/context-store'
import { useCoplayStore } from './coplay'
import { DEVICE_PARTICIPANT, useParticipantsStore } from './participants'

/**
 * What the mocked model does on her turn: the move it names through the
 * tool, in order, or nothing when it skips the tool.
 */
let modelMoves: string[] = []
const ingest = vi.fn(async (_text: string, options: { tools?: Tool[] }) => {
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

/** Lets the store's background model call and fallback settle. */
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
    expect(ingest).toHaveBeenCalledWith(expect.stringContaining('It is your move.'), expect.objectContaining({ model: 'test-model', chatProvider }))
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

  it('moves for her with the fallback policy when the model skips the tool, and says so', async () => {
    const store = useCoplayStore()

    await store.startSession({ partner: devicePartner })
    await settle()

    expect(store.log.at(-1)).toMatchObject({ kind: 'fallback' })
    expect(store.log.at(-1)?.text).toContain('She played a1 (chosen for her: she named no move).')
  })

  it('moves for her when the model keeps naming an illegal move', async () => {
    const store = useCoplayStore()
    await store.startSession({ partner: devicePartner, characterMovesFirst: false })
    modelMoves = ['a1']
    store.submitPartnerMove('a1')
    await settle()

    expect(store.log.map(entry => entry.kind)).toEqual(['started', 'move', 'rejected', 'fallback'])
    expect(store.log.at(-1)?.text).toContain('her last move was "a1": that move is not legal now')
  })

  it('takes the user\'s moves, refuses a move out of turn, and plays to a result', async () => {
    const store = useCoplayStore()
    // The model skips the tool, so the deterministic fallback plays her side:
    // a1, then b1, then c1 to complete the top row.
    await store.startSession({ partner: devicePartner })
    await settle()

    expect(store.submitPartnerMove('a1')).toMatchObject({ status: 'rejected', reason: 'illegal-move' })
    expect(store.submitPartnerMove('c3')).toMatchObject({ status: 'accepted' })
    await settle()
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
