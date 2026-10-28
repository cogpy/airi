import type { Context } from 'grammy'

import { useLogg } from '@guiiai/logg'

import { generateCommandReply } from '../../../llm/command-reply'

/**
 * Sends a reply to a bot command that the model writes from the outcome.
 *
 * Use when:
 * - The bot must answer a command. No fixed text is sent as her.
 *
 * Expects:
 * - `outcome` to describe what happened as facts for the model.
 *
 * Returns:
 * - After the reply is sent. When the model fails, nothing is sent and the error is logged.
 */
export async function replyWithModel(ctx: Pick<Context, 'reply'>, outcome: string): Promise<void> {
  const logger = useLogg('replyWithModel').useGlobalConfig()

  let text: string
  try {
    text = await generateCommandReply(outcome)
  }
  catch (err) {
    // No fixed text stands in for the model.
    logger.withError(err).log('The model did not write a command reply')
    return
  }

  await ctx.reply(text)
}
