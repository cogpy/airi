import type { Discord } from '@proj-airi/server-shared/types'
import type { CacheType, ChatInputCommandInteraction } from 'discord.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handlePing } from './ping'
import { CommandReplies } from './reply'

interface FakeInteraction {
  id: string
  commandName: string
  channelId: string
  guildId: string | null
  guild: { name: string } | null
  deferred: boolean
  replied: boolean
  user: { id: string, displayName: string, username: string }
  client: { ws: { ping: number } }
  deferReply: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
  followUp: ReturnType<typeof vi.fn>
  deleteReply: ReturnType<typeof vi.fn>
  reply: ReturnType<typeof vi.fn>
}

function createInteraction(id = 'interaction-1'): FakeInteraction {
  const interaction: FakeInteraction = {
    id,
    commandName: 'ping',
    channelId: 'channel-7',
    guildId: 'guild-3',
    guild: { name: 'Moe Lab' },
    deferred: false,
    replied: false,
    user: { id: 'user-9', displayName: 'Neko', username: 'neko' },
    client: { ws: { ping: 42 } },
    deferReply: vi.fn(async () => {
      interaction.deferred = true
    }),
    editReply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
    deleteReply: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
  }

  return interaction
}

function asInteraction(interaction: FakeInteraction) {
  return interaction as unknown as ChatInputCommandInteraction<CacheType>
}

describe('commandReplies', () => {
  let sent: Array<{ outcome: string, discord: Discord }>
  let replies: CommandReplies

  beforeEach(() => {
    vi.useFakeTimers()
    sent = []
    replies = new CommandReplies((outcome, discord) => sent.push({ outcome, discord }), 1000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ROOT CAUSE:
  //
  // `/ping` replied with the fixed string 'Pong!'. A later fix let a separate model write the reply,
  // but that model had no character card, so the reply did not speak as the active character.
  it('sends the /ping outcome to the stage character with the interaction id', async () => {
    const interaction = createInteraction()

    await handlePing(asInteraction(interaction), replies)

    expect(interaction.deferReply).toHaveBeenCalledOnce()
    expect(sent).toHaveLength(1)
    expect(sent[0].outcome).toContain('/ping')
    expect(sent[0].outcome).toContain('42 ms')
    expect(sent[0].discord.channelId).toBe('channel-7')
    expect(sent[0].discord.guildName).toBe('Moe Lab')
    expect(sent[0].discord.interactionId).toBe('interaction-1')
    expect(interaction.editReply).not.toHaveBeenCalled()
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('posts the character answer as the command reply', async () => {
    const interaction = createInteraction()
    await replies.reply(asInteraction(interaction), 'The user ran /summon.')

    const delivered = await replies.deliver('interaction-1', 'I am here, 42 ms away!')

    expect(delivered).toBe(true)
    expect(interaction.editReply).toHaveBeenCalledWith('I am here, 42 ms away!')
  })

  it('leaves an answer for another interaction to the channel', async () => {
    const interaction = createInteraction()
    await replies.reply(asInteraction(interaction), 'The user ran /summon.')

    const delivered = await replies.deliver('interaction-2', 'Hello there.')

    expect(delivered).toBe(false)
    expect(interaction.editReply).not.toHaveBeenCalled()
  })

  it('posts nothing and deletes the pending reply when the stage does not answer', async () => {
    const interaction = createInteraction()
    await replies.reply(asInteraction(interaction), 'The user ran /summon.')

    await vi.advanceTimersByTimeAsync(1000)

    expect(interaction.deleteReply).toHaveBeenCalledOnce()
    expect(interaction.editReply).not.toHaveBeenCalled()
    expect(await replies.deliver('interaction-1', 'Too late.')).toBe(false)
  })

  it('splits a long answer into follow-up messages', async () => {
    const interaction = createInteraction()
    await replies.reply(asInteraction(interaction), 'The user ran /summon.')

    await replies.deliver('interaction-1', `${'a'.repeat(1500)} ${'b'.repeat(1500)}`)

    expect(interaction.editReply).toHaveBeenCalledWith('a'.repeat(1500))
    expect(interaction.followUp).toHaveBeenCalledWith('b'.repeat(1500))
  })

  it('does not defer again when the command is already deferred', async () => {
    const interaction = createInteraction()
    interaction.deferred = true

    await replies.reply(asInteraction(interaction), 'You joined the voice channel "General".')

    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
  })
})
