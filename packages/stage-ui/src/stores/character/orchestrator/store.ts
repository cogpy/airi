import type { InitiativeDecision } from '@proj-airi/cognitive-airicog/initiative'
import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketBaseEvent, WebSocketEventOf, WebSocketEvents } from '@proj-airi/server-sdk'

import type { AiriInitiativeSettings } from '../../modules/initiative'

import { createSparkNotifyAgent, createSparkNotifyReactionPlugin } from '@proj-airi/core-agent/agents/spark-notify'
import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { useCharacterNotebookStore, useCharacterStore } from '../'
import { useAiriRuntimePrompt } from '../../../composables/use-airi-runtime-prompt'
import { useLLM } from '../../ai/chat-llm/llm'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useAiriCardStore } from '../../modules/airi-card'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useInitiativeStore } from '../../modules/initiative'

export { sparkNotifyCommandSchema } from '@proj-airi/core-agent/agents/spark-notify'

/**
 * Longest remark quoted back to the model. A pasted page is still one remark,
 * and the model only needs enough of it to recognise what was being discussed.
 */
const MAX_QUOTED_REMARK = 280

/** What a card that never mentions initiative configures: nothing, so it stays off. */
const NO_INITIATIVE: Readonly<AiriInitiativeSettings> = Object.freeze({})

/**
 * Turns the character's decision to break a silence into the same internal
 * notification a due task produces, so the spark-notify agent composes the line
 * and the speech runtime voices it. The character speaks as herself, in her own
 * words; nothing is written into the transcript as if the user had said it.
 *
 * The subject is whatever the initiative store remembered — currently the
 * user's own remark — so the headline quotes it and leaves the model to judge
 * how, or whether, to pick it back up.
 */
function initiativeNotify(decision: Extract<InitiativeDecision, { act: true }>, now: number): WebSocketEventOf<'spark:notify'> {
  const id = `initiative-${now}`
  const remark = decision.topicAtomId.length > MAX_QUOTED_REMARK
    ? `${decision.topicAtomId.slice(0, MAX_QUOTED_REMARK)}…`
    : decision.topicAtomId

  return {
    type: 'spark:notify',
    source: 'character:initiative',
    data: {
      id,
      eventId: id,
      kind: 'ping',
      urgency: 'immediate',
      headline: 'The conversation has gone quiet. You may break the silence by picking up something said earlier.',
      note: `Earlier they said: ${remark}`,
      destinations: ['character'],
      payload: {
        topic: remark,
        urge: decision.urge,
        silencePressure: decision.silencePressure,
      },
    },
  }
}

export const useCharacterOrchestratorStore = defineStore('character-orchestrator', () => {
  const { stream } = useLLM()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const characterStore = useCharacterStore()
  const notebookStore = useCharacterNotebookStore()
  const { systemPrompt } = storeToRefs(characterStore)
  const runtimePrompt = useAiriRuntimePrompt()
  const modsServerChannelStore = useModsServerChannelStore()
  const cardStore = useAiriCardStore()
  const initiativeStore = useInitiativeStore()

  const processing = ref(false)
  const pendingNotifies = ref<Array<WebSocketEventOf<'spark:notify'>>>([])

  const scheduledNotifies = ref<Array<{
    event: WebSocketEventOf<'spark:notify'>
    control?: SparkNotifyResponseControl
    enqueuedAt: number
    nextRunAt: number
    attempts: number
    maxAttempts: number
    reason?: string
  }>>([])

  const attentionConfig = ref({
    tickIntervalMs: 2_000,
    taskNotifyWindowMs: 60_000,
    requeueDelayMs: 30_000,
    maxAttempts: 3,
  })

  let tickTimer: ReturnType<typeof setInterval> | undefined
  let initialized = false
  const eventUnsubscribes: Array<() => void> = []
  const sparkNotifyAgent = createSparkNotifyAgent({
    runner: {
      run: request => stream(
        request.selectedChat.model,
        request.selectedChat.provider,
        request.conversation,
        {
          tools: request.tools,
          providerId: request.selectedChat.providerId,
          supportsTools: request.policy.supportsTools,
          waitForTools: request.policy.waitForTools,
          toolChoice: request.policy.toolChoice,
          onStreamEvent: request.onStreamEvent,
        },
      ),
    },
    plugins: [
      createSparkNotifyReactionPlugin({
        onDelta: (eventId, text) => characterStore.onSparkNotifyReactionStreamEvent(eventId, text),
        onEnd: (eventId, text) => characterStore.onSparkNotifyReactionStreamEnd(eventId, text),
      }),
    ],
  })

  function computeNextRunAt(event: WebSocketEventOf<'spark:notify'>, attempts: number) {
    const now = Date.now()
    const baseDelay = (() => {
      switch (event.data.urgency) {
        case 'immediate':
          return 0
        case 'soon':
          return 10_000
        case 'later':
          return 60_000
        default:
          return 30_000
      }
    })()

    return now + baseDelay + (attempts * attentionConfig.value.requeueDelayMs)
  }

  function removePending(eventId: string) {
    pendingNotifies.value = pendingNotifies.value.filter(item => item.data.id !== eventId)
  }

  function enqueueSparkNotify(
    event: WebSocketEventOf<'spark:notify'>,
    options?: {
      reason?: string
      nextRunAt?: number
      maxAttempts?: number
      control?: SparkNotifyResponseControl
    },
  ) {
    if (!pendingNotifies.value.some(item => item.data.id === event.data.id)) {
      pendingNotifies.value.push(event)
    }

    scheduledNotifies.value.push({
      event,
      control: options?.control,
      enqueuedAt: Date.now(),
      nextRunAt: options?.nextRunAt ?? computeNextRunAt(event, 0),
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? attentionConfig.value.maxAttempts,
      reason: options?.reason,
    })
  }

  async function processSparkNotify(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    const providerId = activeProvider.value
    const model = activeModel.value
    if (!providerId || !model) {
      console.warn('Spark notify ignored: missing active provider or model')
      return undefined
    }

    const provider = await consciousnessStore.getChatProviderInstance(providerId)
    processing.value = true

    try {
      const result = await sparkNotifyAgent.handle({
        event,
        selectedChat: {
          providerId,
          model,
          provider,
        },
        systemPrompt: systemPrompt.value,
        runtimePrompt: runtimePrompt.value,
        control,
      })
      if (!result.commands.length)
        return result

      for (const command of result.commands) {
        modsServerChannelStore.send({
          type: 'spark:command',
          data: command,
        })
      }

      return result
    }
    finally {
      processing.value = false
    }
  }

  async function handleIncomingSparkNotify(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    if (event.data.urgency === 'immediate' && !processing.value) {
      return await processSparkNotify(event, control)
    }

    enqueueSparkNotify(event, { reason: 'spark:notify', control })
    return undefined
  }

  async function handleSparkNotifyWithReaction(
    event: WebSocketEventOf<'spark:notify'>,
    options?: SparkNotifyResponseControl & { fallbackText?: string },
  ) {
    await handleIncomingSparkNotify(event, options)

    const reaction = [...characterStore.reactions]
      .reverse()
      .find(item => item.sourceEventId === event.data.id)
      ?.message
      ?.trim()

    return reaction || options?.fallbackText || ''
  }

  function enqueueDueTasks(now: number) {
    const dueTasks = notebookStore.getDueTasks(now, attentionConfig.value.taskNotifyWindowMs)
    if (!dueTasks.length)
      return

    for (const task of dueTasks) {
      const event: WebSocketEventOf<'spark:notify'> = {
        type: 'spark:notify',
        source: 'character:task-scheduler',
        data: {
          id: `task-${task.id}`,
          eventId: task.id,
          kind: 'reminder',
          urgency: task.priority === 'critical' ? 'immediate' : 'soon',
          headline: `Task reminder: ${task.title}`,
          note: task.details,
          destinations: ['character'],
          payload: {
            taskId: task.id,
            dueAt: task.dueAt,
            priority: task.priority,
          },
        },
      }

      enqueueSparkNotify(event, { reason: 'task:due' })
      notebookStore.markTaskNotified(task.id, now + attentionConfig.value.requeueDelayMs)
    }
  }

  async function tick() {
    if (processing.value)
      return

    const now = Date.now()
    enqueueDueTasks(now)

    const nextIndex = scheduledNotifies.value.findIndex(item => item.nextRunAt <= now)
    if (nextIndex < 0)
      return

    const [next] = scheduledNotifies.value.splice(nextIndex, 1)
    removePending(next.event.data.id)

    try {
      await processSparkNotify(next.event, next.control)
    }
    catch (error) {
      if (next.attempts + 1 < next.maxAttempts) {
        scheduledNotifies.value = [...scheduledNotifies.value, {
          ...next,
          attempts: next.attempts + 1,
          nextRunAt: computeNextRunAt(next.event, next.attempts + 1),
        }]
        pendingNotifies.value = [...pendingNotifies.value, next.event]
      }
      else {
        console.warn('Dropped spark:notify after max attempts:', error)
      }
    }
  }

  function startTicker() {
    if (tickTimer)
      return

    tickTimer = setInterval(() => {
      void tick()
    }, attentionConfig.value.tickIntervalMs)
  }

  function stopTicker() {
    if (!tickTimer)
      return

    clearInterval(tickTimer)
    tickTimer = undefined
  }

  async function handleSparkEmit(_: WebSocketBaseEvent<'spark:emit', WebSocketEvents['spark:emit']>) {
    // Currently no-op
    return undefined
  }

  function initialize() {
    if (initialized)
      return

    initialized = true

    eventUnsubscribes.push(
      modsServerChannelStore.onEvent('spark:notify', async (event) => {
        try {
          await handleIncomingSparkNotify(event)
        }
        catch (error) {
          console.warn('Failed to handle spark:notify event:', error)
        }
      }),
    )

    eventUnsubscribes.push(
      modsServerChannelStore.onEvent('spark:emit', async (event) => {
        try {
          await handleSparkEmit(event)
        }
        catch (error) {
          console.warn('Failed to handle spark:emit event:', error)
        }
      }),
    )

    // A lull is only worth breaking once; by the next tick the conversation may
    // have resumed, so a failed attempt is dropped rather than retried.
    eventUnsubscribes.push(
      initiativeStore.onInitiative(decision => enqueueSparkNotify(initiativeNotify(decision, Date.now()), {
        reason: 'initiative',
        maxAttempts: 1,
      })),
    )

    // The active card decides whether the character speaks unprompted. Switching
    // cards restarts the lull timer under the new card's settings; a card
    // without initiative leaves it stopped, since start() is a no-op while off.
    eventUnsubscribes.push(
      watch(
        () => cardStore.activeCard?.extensions?.airi?.modules?.initiative,
        (settings) => {
          initiativeStore.stop()
          initiativeStore.configure(settings ?? NO_INITIATIVE)
          initiativeStore.start()
        },
        { immediate: true },
      ),
    )

    startTicker()
  }

  function dispose() {
    stopTicker()
    initiativeStore.stop()

    for (const unsubscribe of eventUnsubscribes) {
      unsubscribe()
    }

    eventUnsubscribes.length = 0
    initialized = false
  }

  return {
    processing,
    pendingNotifies,
    scheduledNotifies,
    attentionConfig,

    initialize,
    startTicker,
    stopTicker,
    dispose,

    handleSparkNotify: handleIncomingSparkNotify,
    handleSparkNotifyWithReaction,
    handleSparkEmit,
  }
})
