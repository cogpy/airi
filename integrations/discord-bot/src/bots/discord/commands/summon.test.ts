import type { Client as AiriClient } from '@proj-airi/server-sdk'
import type { CacheType, ChatInputCommandInteraction, Client as DiscordClient } from 'discord.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VoiceManager } from './summon'

const generateTextMock = vi.hoisted(() => vi.fn())

vi.mock('@xsai/generate-text', () => ({
  generateText: generateTextMock,
}))
vi.mock('../../../pipelines/tts', () => ({ openaiTranscribe: vi.fn() }))
vi.mock('../../../utils/audio', () => ({ convertOpusToWav: vi.fn() }))
vi.mock('../../../utils/audio-monitor', () => ({ AudioMonitor: vi.fn() }))
vi.mock('../../../utils/opus', () => ({ OpusDecoder: vi.fn() }))

function createInteraction(voiceChannel: { name: string } | null) {
  const interaction = {
    commandName: 'summon',
    deferred: false,
    replied: false,
    user: { displayName: 'Neko' },
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

function lastPrompt(): string {
  const [request] = generateTextMock.mock.calls.at(-1)!
  return request.messages.at(-1).content
}

describe('voiceManager.handleJoinChannelCommand', () => {
  let manager: VoiceManager

  beforeEach(() => {
    generateTextMock.mockReset()
    generateTextMock.mockResolvedValue({ text: 'model reply' })
    manager = new VoiceManager({} as DiscordClient, {} as AiriClient)
  })

  // ROOT CAUSE:
  //
  // `/summon` posted fixed strings such as 'Please join a voice channel first.' and `Joined: X.` from her bot account.
  it('lets the model write the reply when the user is not in a voice channel', async () => {
    const interaction = createInteraction(null)

    await manager.handleJoinChannelCommand(asInteraction(interaction))

    expect(interaction.deferReply).toHaveBeenCalledOnce()
    expect(lastPrompt()).toContain('not in a voice channel')
    expect(interaction.editReply).toHaveBeenCalledWith('model reply')
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('lets the model write the reply after it joins the voice channel', async () => {
    const joinChannel = vi.spyOn(manager, 'joinChannel').mockResolvedValue(undefined)
    const interaction = createInteraction({ name: 'General' })

    await manager.handleJoinChannelCommand(asInteraction(interaction))

    expect(joinChannel).toHaveBeenCalledOnce()
    expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(joinChannel.mock.invocationCallOrder[0])
    expect(lastPrompt()).toContain('You joined the voice channel "General"')
    expect(interaction.editReply).toHaveBeenCalledWith('model reply')
  })

  it('lets the model write the reply when joining fails', async () => {
    vi.spyOn(manager, 'joinChannel').mockRejectedValue(new Error('missing permission'))
    const interaction = createInteraction({ name: 'General' })

    await manager.handleJoinChannelCommand(asInteraction(interaction))

    expect(lastPrompt()).toContain('missing permission')
    expect(interaction.editReply).toHaveBeenCalledWith('model reply')
  })
})
