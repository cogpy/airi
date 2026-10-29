import type { Discord } from '@proj-airi/server-shared/types'
import type { CacheType, ChatInputCommandInteraction } from 'discord.js'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

import { splitDiscordMessage } from '../../../utils/split-message'

const log = useLogg('CommandReply').useGlobalConfig()

/**
 * Discord lets a bot edit a deferred reply for 15 minutes. The bot stops waiting a little earlier.
 */
const REPLY_TIMEOUT_MS = 14 * 60_000

/**
 * Sends a slash command outcome to the stage character as a chat input.
 */
export type SendCommandToStage = (outcome: string, discord: Discord) => void

interface PendingReply {
  interaction: ChatInputCommandInteraction<CacheType>
  timer: ReturnType<typeof setTimeout>
}

/**
 * Acknowledges a slash command at once, so Discord does not expire it after 3 seconds.
 */
export async function deferCommandReply(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  if (!interaction.deferred && !interaction.replied)
    await interaction.deferReply()
}

/**
 * Lets the stage character answer slash commands.
 *
 * Use when:
 * - The bot must answer a slash command. The active character card on the stage writes the reply,
 *   the same way it answers a mention. No fixed text is posted as her.
 *
 * Expects:
 * - The adapter to pass each stage reply with an `interactionId` to {@link CommandReplies.deliver}.
 */
export class CommandReplies {
  private readonly pending = new Map<string, PendingReply>()

  constructor(
    private readonly sendToStage: SendCommandToStage,
    private readonly timeoutMs = REPLY_TIMEOUT_MS,
  ) {}

  /**
   * Defers the command and asks the stage character to answer it.
   *
   * Expects:
   * - `outcome` to describe what happened as facts for the character, not as the reply text.
   *
   * Returns:
   * - After the input is sent. The reply is posted when the stage answers. Without an answer
   *   before the timeout, the pending reply is deleted and nothing is posted.
   */
  async reply(interaction: ChatInputCommandInteraction<CacheType>, outcome: string): Promise<void> {
    await deferCommandReply(interaction)

    const previous = this.pending.get(interaction.id)
    if (previous)
      clearTimeout(previous.timer)
    const timer = setTimeout(() => void this.expire(interaction.id), this.timeoutMs)
    this.pending.set(interaction.id, { interaction, timer })

    this.sendToStage(outcome, {
      channelId: interaction.channelId,
      guildId: interaction.guildId ?? undefined,
      guildName: interaction.guild?.name ?? undefined,
      guildMember: {
        id: interaction.user.id,
        displayName: interaction.user.displayName,
        nickname: interaction.user.username,
      },
      interactionId: interaction.id,
    })
  }

  /**
   * Posts the stage character's answer as the reply to its command.
   *
   * Returns:
   * - `true` when a pending command took the text. `false` when no command waits for this id.
   */
  async deliver(interactionId: string, text: string): Promise<boolean> {
    const pending = this.pending.get(interactionId)
    if (!pending)
      return false

    clearTimeout(pending.timer)
    this.pending.delete(interactionId)

    const [first, ...rest] = splitDiscordMessage(text)
    await pending.interaction.editReply(first)
    for (const chunk of rest)
      await pending.interaction.followUp(chunk)
    return true
  }

  private async expire(interactionId: string): Promise<void> {
    const pending = this.pending.get(interactionId)
    if (!pending)
      return

    this.pending.delete(interactionId)
    log.withField('command', pending.interaction.commandName).warn('The stage did not answer the command in time')
    // No fixed text stands in for the character. Remove the pending "thinking" reply.
    await pending.interaction.deleteReply().catch((error: unknown) => {
      log.withField('error', errorMessageFrom(error)).warn('Failed to delete the pending reply')
    })
  }
}
