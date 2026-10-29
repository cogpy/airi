import type { CacheType, ChatInputCommandInteraction } from 'discord.js'

import { replyWithModel } from './reply'

export async function handlePing(interaction: ChatInputCommandInteraction<CacheType>) {
  await replyWithModel(
    interaction,
    `The user ${interaction.user.displayName} ran /ping to check if you are online. `
    + `You are online. Your Discord gateway latency is ${interaction.client.ws.ping} ms.`,
  )
}
