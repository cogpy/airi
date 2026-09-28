import type { Emotion, EmotionPayload } from '../../constants/emotions'

import { EMOTION_VALUES } from '../../constants/emotions'

/**
 * Reads the `<|ACT:{...}|>` marker the character emits to choose its expression.
 *
 * The marker is written by a language model, so every part of it is treated as
 * untrusted: malformed JSON, an unknown emotion name, or an intensity that is
 * not a number all yield "no emotion" rather than throwing or passing a bad
 * value downstream.
 *
 * @example
 * parseActEmotion('hello <|ACT:{"emotion":"happy"}|>')
 * // => { name: 'happy', intensity: 1 }
 */
export function parseActEmotion(content: string): EmotionPayload | undefined {
  const match = /<\|ACT\s*(?::\s*)?(\{[\s\S]*\})\|>/i.exec(content)
  if (!match)
    return undefined

  const payloadText = match[1]

  let payload: { emotion?: unknown }
  try {
    payload = JSON.parse(payloadText) as { emotion?: unknown }
  }
  catch (e) {
    console.warn(`[parseActEmotion] Failed to parse ACT payload JSON: "${payloadText}"`, e)
    return undefined
  }

  const emotion = payload?.emotion

  if (typeof emotion === 'string') {
    const name = normalizeEmotionName(emotion)
    return name ? { name, intensity: 1 } : undefined
  }

  if (emotion && typeof emotion === 'object' && !Array.isArray(emotion)) {
    const named = emotion as { name?: unknown, intensity?: unknown }
    if (typeof named.name !== 'string')
      return undefined

    const name = normalizeEmotionName(named.name)
    return name ? { name, intensity: normalizeIntensity(named.intensity) } : undefined
  }

  return undefined
}

function normalizeEmotionName(value: string): Emotion | undefined {
  const normalized = value.trim().toLowerCase()

  return EMOTION_VALUES.includes(normalized as Emotion) ? normalized as Emotion : undefined
}

/**
 * Absent or unusable intensity means full strength — the character named a
 * feeling, so the safe reading is that it meant it.
 */
function normalizeIntensity(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value))
    return 1

  return Math.min(1, Math.max(0, value))
}
