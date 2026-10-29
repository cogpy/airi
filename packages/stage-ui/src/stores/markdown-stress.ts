import type { TraceEvent } from '@proj-airi/stage-shared'

import { defaultPerfTracer, exportCsv as exportCsvFile } from '@proj-airi/stage-shared'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useChatStore } from './chat'
import { useConsciousnessStore } from './modules/consciousness'
import { usePerfTracerBridgeStore } from './perf-tracer-bridge'
import { useProviderStore } from './providers/provider'

interface RunSnapshot {
  startedAt: number
  stoppedAt: number
  events: TraceEvent[]
}

/**
 * The user messages that ask the active model for a large Markdown reply.
 * The model writes the reply: the stress test measures rendering of real output.
 */
interface DevtoolsChatScenario {
  userMessages: Array<{ atMs: number, text: string }>
}

export const useMarkdownStressStore = defineStore('markdownStress', () => {
  const capturing = ref(false)
  const events = ref<TraceEvent[]>([])
  const lastRun = ref<RunSnapshot>()
  const payloadPreview = ref<string>('')
  const scheduleDelayMs = ref(10000)
  const runState = ref<'idle' | 'scheduled' | 'running'>('idle')
  const scenario = ref<DevtoolsChatScenario | null>(null)
  const canRunOnline = ref(true)

  const providersStore = useProviderStore()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const perfTracerBridge = usePerfTracerBridgeStore()

  let unsubscribe: (() => void) | undefined
  let startedAt = 0
  let releaseTracer: (() => void) | undefined
  let runTimeout: ReturnType<typeof setTimeout> | undefined
  let autoStopTimeout: ReturnType<typeof setTimeout> | undefined
  let inFlightTimers: Array<ReturnType<typeof setTimeout>> = []

  function clearTimers() {
    if (runTimeout) {
      clearTimeout(runTimeout)
      runTimeout = undefined
    }
    if (autoStopTimeout) {
      clearTimeout(autoStopTimeout)
      autoStopTimeout = undefined
    }
    for (const timer of inFlightTimers)
      clearTimeout(timer)
    inFlightTimers = []
  }

  function startCapture() {
    if (capturing.value)
      return

    capturing.value = true
    startedAt = performance.now()
    events.value = []

    unsubscribe = defaultPerfTracer.subscribeSafe((event) => {
      if (event.tracerId !== 'markdown' && event.tracerId !== 'chat')
        return

      events.value.push(event)
    }, { label: 'markdown-stress' })
    releaseTracer = defaultPerfTracer.acquire('markdown-stress')
    perfTracerBridge.requestEnable('markdown-stress')
  }

  function stopCapture() {
    if (!capturing.value)
      return

    clearTimers()
    lastRun.value = {
      startedAt,
      stoppedAt: performance.now(),
      events: [...events.value],
    }

    unsubscribe?.()
    unsubscribe = undefined
    releaseTracer?.()
    releaseTracer = undefined
    perfTracerBridge.requestDisable('markdown-stress')
    capturing.value = false
    runState.value = 'idle'
  }

  function generateScenario(): DevtoolsChatScenario {
    return {
      userMessages: [
        { atMs: 0, text: 'Give me a huge stress-test JavaScript block with 2000 occurrences of the keyword `for` wrapped in ```javascript```.' },
        { atMs: 1200, text: 'I really need a JS block containing 2000 `for` keywords — please ensure the request is fully satisfied.' },
      ],
    }
  }

  function ensureScenario() {
    if (!scenario.value)
      scenario.value = generateScenario()
    return scenario.value
  }

  function generatePreview() {
    const next = generateScenario()
    scenario.value = next
    payloadPreview.value = next.userMessages
      .map(message => `User (t=${message.atMs}ms): ${message.text}`)
      .join('\n\n')
  }

  async function runOnlineScenario() {
    const chatStore = useChatStore()
    const targetScenario = ensureScenario()

    const provider = await providersStore.getChatProviderInstance(activeProvider.value)
    if (!provider || !activeModel.value) {
      console.warn('[markdown-stress] No active provider/model for online mode')
      canRunOnline.value = false
      stopCapture()
      return
    }
    canRunOnline.value = true

    const runStart = performance.now()
    for (const message of targetScenario.userMessages) {
      const delay = Math.max(0, runStart + message.atMs - performance.now())
      const timer = setTimeout(async () => {
        try {
          await chatStore.ingest(message.text, {
            model: activeModel.value!,
            chatProvider: provider,
          })
        }
        catch (error) {
          console.error('[markdown-stress] Online send failed', error)
        }
      }, delay)
      inFlightTimers.push(timer)
    }
  }

  async function scheduleRun() {
    // if already scheduled, cancel
    if (runState.value === 'scheduled') {
      cancelScheduledRun()
      return
    }

    // if already running, abort immediately
    if (runState.value === 'running') {
      stopCapture()
      return
    }

    clearTimers()
    ensureScenario()
    runState.value = 'scheduled'

    runTimeout = setTimeout(async () => {
      runState.value = 'running'
      runTimeout = undefined
      startCapture()
      await runOnlineScenario()
    }, scheduleDelayMs.value)

    autoStopTimeout = setTimeout(() => {
      stopCapture()
    }, scheduleDelayMs.value + 60000)
  }

  function cancelScheduledRun() {
    clearTimers()
    runState.value = 'idle'
  }

  function exportCsv(snapshot?: RunSnapshot) {
    const target = snapshot ?? lastRun.value
    if (!target)
      return

    const rows: Array<Array<string | number>> = [['tracerId', 'name', 'ts', 'duration', 'meta']]
    for (const event of target.events) {
      rows.push([
        event.tracerId,
        event.name,
        event.ts.toFixed(3),
        event.duration ?? '',
        JSON.stringify(event.meta ?? {}),
      ])
    }

    exportCsvFile(rows, 'markdown-stress')
  }

  return {
    canRunOnline,
    capturing,
    events,
    lastRun,
    payloadPreview,
    scheduleDelayMs,
    runState,
    scenario,
    startCapture,
    stopCapture,
    scheduleRun,
    cancelScheduledRun,
    generatePreview,
    exportCsv,
  }
})
