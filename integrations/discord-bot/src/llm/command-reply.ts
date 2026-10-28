import { env } from 'node:process'

import { generateText } from '@xsai/generate-text'

const systemPrompt = [
  'You are AIRI (アイリ), a virtual character. You talk to people on Discord through your own bot account.',
  'A user used one of your slash commands. The next message tells you what happened.',
  'Write the message that you post as your reply, in your own voice and in the language of the user.',
  'Keep it short. Do not use a fixed or formal template. Reply with only the message text.',
].join('\n')

/**
 * Asks the model to write the reply to a slash command.
 *
 * Use when:
 * - The bot must answer a Discord interaction. Every reply that the bot posts comes from the model.
 *
 * Expects:
 * - `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, and `OPENAI_MODEL` to name an OpenAI-compatible provider.
 *   A locally served model works when the provider serves it.
 * - `outcome` to describe the event and its result as facts, not as the reply text.
 *
 * Returns:
 * - The reply text that the model wrote.
 *
 * @throws When the model returns no text.
 */
export async function generateCommandReply(outcome: string, abortSignal?: AbortSignal): Promise<string> {
  const result = await generateText({
    apiKey: env.OPENAI_API_KEY ?? '',
    baseURL: env.OPENAI_API_BASE_URL ?? '',
    model: env.OPENAI_MODEL ?? '',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: outcome },
    ],
    abortSignal,
  })

  // Reasoning models can put their thoughts in the text. Only the reply is posted.
  const text = (result.text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!text)
    throw new Error('The model returned no reply text')

  return text
}
