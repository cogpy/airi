import type { CacheType, ChatInputCommandInteraction } from 'discord.js'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

import { generateCommandReply } from '../../../llm/command-reply'
import { splitDiscordMessage } from '../../../utils/split-message'

const log = useLogg('CommandReply').useGlobalConfig()

/**
 * Acknowledges a slash command at once, so Discord does not expire it after 3 seconds.
 */
export async function deferCommandReply(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  if (!interaction.deferred && !interaction.replied)
    await interaction.deferReply()
}

/**
 * Posts a reply to a slash command that the model writes from the outcome.
 *
 * Use when:
 * - The bot must answer a slash command. No fixed text is posted as her.
 *
 * Expects:
 * - `outcome` to describe what happened as facts for the model.
 *
 * Returns:
 * - After the reply is posted. When the model fails, the pending reply is deleted and nothing is posted.
 */
export async function replyWithModel(interaction: ChatInputCommandInteraction<CacheType>, outcome: string): Promise<void> {
  await deferCommandReply(interaction)

  let text: string
  try {
    text = await generateCommandReply(outcome)
  }
  catch (error) {
    log.withError(error).withField('command', interaction.commandName).error('The model did not write a reply')
    // No fixed text stands in for the model. Remove the pending "thinking" reply.
    await interaction.deleteReply().catch((deleteError: unknown) => {
      log.withField('error', errorMessageFrom(deleteError)).warn('Failed to delete the pending reply')
    })
    return
  }

  const [first, ...rest] = splitDiscordMessage(text)
  await interaction.editReply(first)
  for (const chunk of rest)
    await interaction.followUp(chunk)
}
