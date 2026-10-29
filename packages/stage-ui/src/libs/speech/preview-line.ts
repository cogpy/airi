import type { Conversation } from '@proj-airi/core-agent'

import { trimEnd, trimStart } from 'es-toolkit'

/** Longest line accepted for a voice preview. A longer reply is not one line. */
const MAX_PREVIEW_LINE_LENGTH = 200

/**
 * Builds the one-shot request for a line that previews the character's voice.
 *
 * The settings pages play this line through a speech provider. The model
 * writes it, so the preview is something the character says, not fixed text.
 */
export function speechPreviewConversation(options: { characterName?: string, identity?: string, language: string }): Conversation {
  const speaker = options.characterName ? `${options.characterName}, the character` : 'the character'
  const identity = options.identity?.trim()
  return {
    turns: [
      // The card's identity prompt sets her voice, as it does in chat.
      ...(identity ? [{ type: 'system' as const, id: 'speech-preview-identity', authority: 'system' as const, content: [{ type: 'text' as const, text: identity }] }] : []),
      {
        type: 'system',
        id: 'speech-preview-instructions',
        authority: 'system',
        content: [{
          type: 'text',
          text: `Write one short spoken line, under 20 words, that ${speaker} says while the user tries out her voice. `
            + `Write it in the language with the code "${options.language}". `
            + 'Use plain words that a speaker can pronounce: no emojis, no markup, no stage directions. Reply with the line only.',
        }],
      },
      {
        type: 'user',
        id: 'speech-preview-request',
        content: [{ type: 'text', text: 'Say a line to test your voice.' }],
      },
    ],
  }
}

/** Quotes a model puts around a line. */
const QUOTE_MARKS = ['"', '\'', '“', '”', '‘', '’', '「', '」', '`']

/**
 * Normalizes the model's reply into one preview line, or `undefined` when the
 * reply is empty or too long to be one line.
 *
 * @example
 * parseSpeechPreviewLine('"Hi, can you hear me?"\n')
 * // => 'Hi, can you hear me?'
 */
export function parseSpeechPreviewLine(reply: string): string | undefined {
  const firstLine = reply.trim().split('\n')[0] ?? ''
  // Character trims, not an anchored regular expression: the reply comes from
  // a model, and `[…]+$` is retried from every position of a long run.
  const line = trimEnd(trimStart(firstLine, QUOTE_MARKS), QUOTE_MARKS).trim()
  if (!line || line.length > MAX_PREVIEW_LINE_LENGTH)
    return undefined
  return line
}
