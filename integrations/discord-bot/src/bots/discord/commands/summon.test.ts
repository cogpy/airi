import type { Client as AiriClient } from '@proj-airi/server-sdk'
import type { CacheType, ChatInputCommandInteraction, Client as DiscordClient } from 'discord.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CommandReplies } from './reply'
import { VoiceManager } from './summon'

vi.mock('../../../pipelines/tts', () => ({ openaiTranscribe: vi.fn() }))
vi.mock('../../../utils/audio', () => ({ convertOpusToWav: vi.fn() }))
vi.mock('../../../utils/audio-monitor', () => ({ AudioMonitor: vi.fn() }))
vi.mock('../../../utils/opus', () => ({ OpusDecoder: vi.fn() }))

function createInteraction(voiceChannel: { name: string } | null) {
  const interaction = {
    id: 'interaction-1',
    commandName: 'summon',
    channelId: 'channel-7',
    guildId: 'guild-3',
    guild: { name: 'Moe Lab' },
    deferred: false,
    replied: false,
    user: { id: 'user-9', displayName: 'Neko', username: 'neko' },
    member: { voice: { channel: voiceChannel } },
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

function asInteraction(interaction: ReturnType<typeof createInteraction>) {
  return interaction as unknown as ChatInputCommandInteraction<CacheType>
}

describe('voiceManager.handleJoinChannelCommand', () => {
  let manager: VoiceManager
  let outcomes: string[]

  function lastOutcome(): string {
    return outcomes.at(-1) ?? ''
  }

  beforeEach(() => {
    outcomes = []
    const replies = new CommandReplies(outcome => outcomes.push(outcome))
    manager = new VoiceManager({} as DiscordClient, {} as AiriClient, replies)
  })

  // ROOT CAUSE:
  //
  // `/summon` posted fixed strings such as 'Please join a voice channel first.' and `Joined: X.` from her bot account.
  it('asks the stage character to answer when the user is not in a voice channel', async () => {
    const interaction = createInteraction(null)

    await manager.handleJoinChannelCommand(asInteraction(interaction))

    expect(interaction.deferReply).toHaveBeenCalledOnce()
    expect(lastOutcome()).toContain('not in a voice channel')
    expect(interaction.editReply).not.toHaveBeenCalled()
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('asks the stage character to answer after it joins the voice channel', async () => {
    const joinChannel = vi.spyOn(manager, 'joinChannel').mockResolvedValue(undefined)
    const interaction = createInteraction({ name: 'General' })

    await manager.handleJoinChannelCommand(asInteraction(interaction))

    expect(joinChannel).toHaveBeenCalledOnce()
    expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(joinChannel.mock.invocationCallOrder[0])
    expect(lastOutcome()).toContain('You joined the voice channel "General"')
    expect(interaction.editReply).not.toHaveBeenCalled()
  })

  it('asks the stage character to answer when joining fails', async () => {
    vi.spyOn(manager, 'joinChannel').mockRejectedValue(new Error('missing permission'))
    const interaction = createInteraction({ name: 'General' })

    await manager.handleJoinChannelCommand(asInteraction(interaction))

    expect(lastOutcome()).toContain('missing permission')
    expect(interaction.editReply).not.toHaveBeenCalled()
  })
})
