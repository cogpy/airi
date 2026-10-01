import type { ParticipantActivity } from '../../../libs/participants'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useParticipantsStore } from '../../participants'
import { useContextBridgeStore } from './context-bridge'

type ServerEventHandler = (event: { data: Record<string, unknown> }) => void | Promise<void>

const SETTLE_MS = 1500

const serverEventHandlers = new Map<string, ServerEventHandler[]>()
const ingest = vi.fn(async () => undefined)
const chatProvider = { generation: vi.fn() }
const initiative = ref<Record<string, unknown>>({})

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
    activeCard: ref({ name: 'Local', extensions: { airi: { modules: { initiative: initiative.value } } } }),
  }),
}))

vi.mock('./channel-server', () => ({
  useModsServerChannelStore: () => ({
    ensureConnected: vi.fn(async () => undefined),
    send: vi.fn(),
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

/** Publishes one sentence the way another stage does: start, its text, then end. */
async function agentSays(participantId: string, id: string, text: string) {
  await emitServerEvent('output:speech:activity', { participantId, name: 'Rin', phase: 'start', at: 1 })
  await emitServerEvent('output:speech:utterance', { id, participantId, name: 'Rin', text, at: 1 })
  await emitServerEvent('output:speech:activity', { participantId, name: 'Rin', phase: 'end', at: 2 })
}

describe('context bridge agent speech', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    serverEventHandlers.clear()
    ingest.mockClear()
    initiative.value = { converseWithAgents: true }
  })

  afterEach(async () => {
    await useContextBridgeStore().dispose()
    vi.useRealTimers()
  })

  it('answers another agent\'s whole turn as a user turn with a structured speaker', async () => {
    const participants = useParticipantsStore()
    const activity: ParticipantActivity[] = []
    participants.onActivity(event => activity.push(event))
    await useContextBridgeStore().initialize()

    await agentSays('stage:b', 'u1', 'Hello.')
    await agentSays('stage:b', 'u2', 'How are you?')
    await vi.advanceTimersByTimeAsync(SETTLE_MS)

    expect(ingest).toHaveBeenCalledTimes(1)
    expect(ingest).toHaveBeenCalledWith('Hello. How are you?', expect.objectContaining({
      model: 'test-model',
      chatProvider,
      speaker: { id: 'stage:b', name: 'Rin', kind: 'agent' },
    }))
    expect(activity[0]).toMatchObject({ participant: { id: 'stage:b', kind: 'other', origin: 'agent' }, phase: 'start' })
  })

  it('ignores speech that this stage published from another window', async () => {
    const participants = useParticipantsStore()
    const activity: ParticipantActivity[] = []
    participants.onActivity(event => activity.push(event))
    await useContextBridgeStore().initialize()

    await agentSays(participants.stageParticipantId, 'u1', 'My own words.')
    await vi.advanceTimersByTimeAsync(SETTLE_MS)

    expect(ingest).not.toHaveBeenCalled()
    expect(activity).toEqual([])
  })

  it('ignores agents when the card does not converse with them', async () => {
    initiative.value = {}
    const participants = useParticipantsStore()
    const activity: ParticipantActivity[] = []
    participants.onActivity(event => activity.push(event))
    await useContextBridgeStore().initialize()

    await agentSays('stage:b', 'u1', 'Hello.')
    await vi.advanceTimersByTimeAsync(SETTLE_MS)

    expect(ingest).not.toHaveBeenCalled()
    expect(activity).toEqual([])
  })

  it('stops answering once the card\'s agent turn budget is spent, but still hears the agent', async () => {
    initiative.value = { converseWithAgents: true, agentTurnBudget: 1 }
    const participants = useParticipantsStore()
    const activity: ParticipantActivity[] = []
    participants.onActivity(event => activity.push(event))
    await useContextBridgeStore().initialize()

    await agentSays('stage:b', 'u1', 'First.')
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    await vi.advanceTimersByTimeAsync(10_000)
    await agentSays('stage:b', 'u2', 'Second.')
    await vi.advanceTimersByTimeAsync(SETTLE_MS)

    expect(ingest).toHaveBeenCalledTimes(1)
    expect(activity.filter(event => event.phase === 'start')).toHaveLength(2)
  })
})
