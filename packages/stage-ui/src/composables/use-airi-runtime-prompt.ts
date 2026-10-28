import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../constants/emotions'

const RUNTIME_PROMPT_KEYS = [
  'base.prompt.emotion',
  'base.prompt.emoji',
  'base.prompt.suffix',
]

export interface AiriRuntimePromptOptions {
  /**
   * How the character currently feels, from a mood tracker.
   *
   * Called per request so a mood that has drifted since the last turn is
   * described as it stands now. Returning `undefined` — which it does whenever
   * nothing shows — leaves the prompt exactly as it was without this.
   */
  moodLine?: () => string | undefined
  /**
   * The sample reply that shows the model how to use emotion tokens.
   *
   * Called per request, so the sample follows the character that answers.
   * Returning `undefined` or blank text uses the built-in sample. The model
   * still writes every reply: the sample only shows the format.
   */
  emotionExample?: () => string | undefined
}

/**
 * Returns the localized emotion and emoji prompt for each model request.
 *
 * The emotion list tells the character which feelings it may display; the
 * optional mood line tells it how it already feels, which the list alone cannot
 * — a display emotion is chosen fresh each turn and carries nothing over.
 */
export function useAiriRuntimePrompt(options: AiriRuntimePromptOptions = {}) {
  const { locale, t, te } = useI18n()

  return computed(() => {
    if (!RUNTIME_PROMPT_KEYS.every(key => te(key, locale.value)))
      return ''

    // A locale whose emotion text has no `{example}` keeps its own sample until it is translated again.
    const example = options.emotionExample?.()?.trim() || t('base.prompt.emotionExample')
    const sections = [
      t('base.prompt.emotion', { example }),
      EMOTION_VALUES
        .map(emotion => `- ${emotion} (Emotion for feeling ${EMOTION_EmotionMotionName_value[emotion]})`)
        .join('\n'),
      t('base.prompt.suffix'),
      t('base.prompt.emoji'),
    ]

    const moodLine = options.moodLine?.()
    if (moodLine)
      sections.push(moodLine)

    return sections.join('\n\n')
  })
}
