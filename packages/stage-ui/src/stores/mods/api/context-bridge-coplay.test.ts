import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useCoplayStore } from '../../coplay'
import { useParticipantsStore } from '../../participants'
import { useContextBridgeStore } from './context-bridge'

type ServerEventHandler = (event: { data: Record<string, unknown> }) => void | Promise<void>

const serverEventHandlers = new Map<string, ServerEventHandler[]>()
const ingest = vi.fn(async () => undefined)
const send = vi.fn()
const chatProvider = { generation: vi.fn() }
const coplay = ref<Record<string, unknown>>({})

function noopHook() {
  return () => undefined
}

vi.mock('../../character', () => ({
  useCharacterOrchestratorStore: () => ({}),
}))

vi.mock('../../chat', () => ({
  useChatStore: () => ({
    ingest,
    onBeforeMessageComposed: noopHook,
    onAfterMessageComposed: noopHook,
    onBeforeSend: noopHook,
    onAfterSend: noopHook,
    onTokenLiteral: noopHook,
    onTokenSpecial: noopHook,
    onStreamEnd: noopHook,
    onAssistantResponseEnd: noopHook,
    onAssistantMessage: noopHook,
    onChatTurnComplete: noopHook,
  }),
}))

vi.mock('../../chat/session-store', () => ({
  useChatSessionStore: () => ({ activeSessionId: 'session-1' }),
}))

vi.mock('../../chat/stream-store', () => ({
  useChatStreamStore: () => ({}),
}))

vi.mock('../../chat/context-store', () => ({
  useChatContextStore: () => ({ ingestContextMessage: vi.fn() }),
}))

vi.mock('../../devtools/context-observability', () => ({
  useContextObservabilityStore: () => ({ recordLifecycle: vi.fn() }),
}))

vi.mock('../../modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: ref('test-provider'),
    activeModel: ref('test-model'),
    activeTemperature: ref(undefined),
    activeTopP: ref(undefined),
    getChatProviderInstance: vi.fn(async () => chatProvider),
  }),
}))

vi.mock('../../modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCard: ref({ name: 'Local', extensions: { airi: { modules: { coplay: coplay.value } } } }),
  }),
}))

vi.mock('./channel-server', () => ({
  useModsServerChannelStore: () => ({
    ensureConnected: vi.fn(async () => undefined),
    send,
    onReconnected: noopHook,
    onContextUpdate: noopHook,
    onEvent: (type: string, handler: ServerEventHandler) => {
      serverEventHandlers.set(type, [...(serverEventHandlers.get(type) ?? []), handler])
      return () => undefined
    },
  }),
}))

async function emitServerEvent(type: string, data: Record<string, unknown>) {
  for (const handler of serverEventHandlers.get(type) ?? [])
    await handler({ data })
}

/** A game start from another stage, seating `seated` against stage:b. */
function gameStart(sessionId: string, publisher: string, seated: string) {
  return {
    sessionId,
    gameId: 'tic-tac-toe',
    participantId: publisher,
    name: 'Rin',
    phase: 'start',
    seats: [{ seat: 'X', participantId: publisher }, { seat: 'O', participantId: seated }],
    at: 1,
  }
}

describe('context bridge co-play events', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    serverEventHandlers.clear()
    ingest.mockClear()
    send.mockClear()
    coplay.value = { enabled: true }
  })

  afterEach(async () => {
    await useContextBridgeStore().dispose()
  })

  it('joins a game another stage starts with her and plays the moves it publishes', async () => {
    const selfId = useParticipantsStore().stageParticipantId
    await useContextBridgeStore().initialize()

    await emitServerEvent('output:game:session', gameStart('coplay:g1', 'stage:b', selfId))
    await vi.waitFor(() => expect(useCoplayStore().status).toBe('playing'))
    await emitServerEvent('output:game:action', { sessionId: 'coplay:g1', gameId: 'tic-tac-toe', participantId: 'stage:b', move: 'b2', at: 2 })

    await vi.waitFor(() => expect(ingest).toHaveBeenCalledTimes(1))
    expect(useCoplayStore().log.map(entry => entry.kind)).toContain('move')
    expect(useCoplayStore().view).toContain('2  . X .')
  })

  it('ignores game events that this stage published from another window', async () => {
    const selfId = useParticipantsStore().stageParticipantId
    await useContextBridgeStore().initialize()

    await emitServerEvent('output:game:session', gameStart('coplay:g1', selfId, 'stage:b'))
    await emitServerEvent('output:game:action', { sessionId: 'coplay:g1', gameId: 'tic-tac-toe', participantId: selfId, move: 'b2', at: 2 })

    expect(useCoplayStore().status).toBe('idle')
    expect(ingest).not.toHaveBeenCalled()
  })

  it('ignores moves for a session this stage does not play', async () => {
    const selfId = useParticipantsStore().stageParticipantId
    await useContextBridgeStore().initialize()
    await emitServerEvent('output:game:session', gameStart('coplay:g1', 'stage:b', selfId))
    await vi.waitFor(() => expect(useCoplayStore().status).toBe('playing'))

    await emitServerEvent('output:game:action', { sessionId: 'coplay:unknown', gameId: 'tic-tac-toe', participantId: 'stage:b', move: 'b2', at: 2 })

    expect(useCoplayStore().log.map(entry => entry.kind)).toEqual(['joined'])
    expect(ingest).not.toHaveBeenCalled()
  })

  it('does not join games when the card has co-play off', async () => {
    coplay.value = {}
    const selfId = useParticipantsStore().stageParticipantId
    await useContextBridgeStore().initialize()

    await emitServerEvent('output:game:session', gameStart('coplay:g1', 'stage:b', selfId))

    expect(useCoplayStore().status).toBe('idle')
  })
})
