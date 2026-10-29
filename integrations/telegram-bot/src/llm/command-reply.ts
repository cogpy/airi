import type { GenerateTextOptions } from '@xsai/generate-text'

import { env } from 'node:process'

import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'

import { personality } from '../prompts'
import { div } from '../prompts/utils'

/**
 * Asks the model to write the reply to a bot command, in her own voice.
 *
 * Use when:
 * - The bot must answer a command. Every reply that the bot posts comes from the model.
 *
 * Expects:
 * - `LLM_API_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` to name the chat model of the bot.
 * - `outcome` to describe the event and its result as facts, not as the reply text.
 *
 * Returns:
 * - The reply text that the model wrote.
 *
 * @throws When the model returns no text.
 */
export async function generateCommandReply(outcome: string, abortSignal?: AbortSignal): Promise<string> {
  const systemContent = div(
    await personality(),
    [
      'A user used one of your bot commands in Telegram. The next message tells you what happened.',
      'Write the message that you send as your reply, in your own voice.',
      env.LLM_RESPONSE_LANGUAGE ? `Write in ${env.LLM_RESPONSE_LANGUAGE}.` : 'Write in the language of the user.',
      'Keep it short. Reply with only the message text, without JSON or markup.',
    ].join('\n'),
  )

  const req = {
    apiKey: env.LLM_API_KEY!,
    baseURL: env.LLM_API_BASE_URL!,
    model: env.LLM_MODEL!,
    messages: message.messages(
      { role: 'system' as const, content: systemContent },
      { role: 'user' as const, content: outcome },
    ),
    abortSignal,
  } satisfies GenerateTextOptions
  if (env.LLM_OLLAMA_DISABLE_THINK) {
    (req as Record<string, unknown>).think = false
  }

  const res = await generateText(req)
  // Reasoning models can put their thoughts in the text. Only the reply is sent.
  const text = (res.text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!text)
    throw new Error('The model returned no reply text')

  return text
}
