import type { CacheType, ChatInputCommandInteraction } from 'discord.js'

import type { CommandReplies } from './reply'

export async function handlePing(interaction: ChatInputCommandInteraction<CacheType>, replies: CommandReplies) {
  await replies.reply(
    interaction,
    `The user ${interaction.user.displayName} ran /ping to check if you are online. `
    + `You are online. Your Discord gateway latency is ${interaction.client.ws.ping} ms.`,
  )
}
