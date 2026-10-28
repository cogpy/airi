import { errorMessageFrom } from '@moeru/std'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { parseSpeechPreviewLine, speechPreviewConversation } from '../libs/speech/preview-line'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useTextGeneration } from './text-generation'

/** Longest wait for the preview line. A settings page cannot hang on a slow model. */
const PREVIEW_LINE_TIMEOUT_MS = 30_000

/**
 * Has the active chat model write a line that previews the character's voice.
 *
 * Returns:
 * - `writeLine`, which resolves to the line, or `undefined` when no chat model
 *   is set or the model wrote nothing usable. Nothing stands in for the model.
 * - `writing`, true while the model writes.
 * - `error`, the last failure, for the page to show.
 */
export function useSpeechPreviewLine() {
  const { generateText } = useTextGeneration()
  const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
  const { activeCard } = storeToRefs(useAiriCardStore())
  const { locale } = useI18n()
  const writing = ref(false)
  const error = ref<string>()

  async function writeLine(): Promise<string | undefined> {
    if (!activeProvider.value || !activeModel.value)
      return undefined
    writing.value = true
    error.value = undefined
    try {
      const reply = await generateText({ providerId: activeProvider.value, model: activeModel.value })(
        speechPreviewConversation({ characterName: activeCard.value?.name, language: locale.value }),
        AbortSignal.timeout(PREVIEW_LINE_TIMEOUT_MS),
      )
      return parseSpeechPreviewLine(reply)
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'The chat model did not write a line'
      return undefined
    }
    finally {
      writing.value = false
    }
  }

  return { writeLine, writing, error }
}
