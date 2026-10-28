import type { CacheType, ChatInputCommandInteraction } from 'discord.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { handlePing } from './ping'
import { replyWithModel } from './reply'

const generateTextMock = vi.hoisted(() => vi.fn())

vi.mock('@xsai/generate-text', () => ({
  generateText: generateTextMock,
}))

interface FakeInteraction {
  commandName: string
  deferred: boolean
  replied: boolean
  user: { displayName: string }
  client: { ws: { ping: number } }
  deferReply: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
  followUp: ReturnType<typeof vi.fn>
  deleteReply: ReturnType<typeof vi.fn>
  reply: ReturnType<typeof vi.fn>
}

function createInteraction(): FakeInteraction {
  const interaction: FakeInteraction = {
    commandName: 'ping',
    deferred: false,
    replied: false,
    user: { displayName: 'Neko' },
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

describe('replyWithModel', () => {
  beforeEach(() => {
    generateTextMock.mockReset()
  })

  // ROOT CAUSE:
  //
  // `/ping` replied with the fixed string 'Pong!' from her bot account, without the model.
  it('posts the text that the model writes from the /ping outcome', async () => {
    generateTextMock.mockResolvedValue({ text: '<think>hmm</think>I am here, 42 ms away!' })
    const interaction = createInteraction()

    await handlePing(asInteraction(interaction))

    expect(interaction.deferReply).toHaveBeenCalledOnce()
    expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(generateTextMock.mock.invocationCallOrder[0])
    const [request] = generateTextMock.mock.calls[0]
    expect(request.messages.at(-1).content).toContain('/ping')
    expect(request.messages.at(-1).content).toContain('42 ms')
    expect(interaction.editReply).toHaveBeenCalledWith('I am here, 42 ms away!')
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('posts nothing when the model fails', async () => {
    generateTextMock.mockRejectedValue(new Error('provider down'))
    const interaction = createInteraction()

    await replyWithModel(asInteraction(interaction), 'The user ran /summon.')

    expect(interaction.editReply).not.toHaveBeenCalled()
    expect(interaction.followUp).not.toHaveBeenCalled()
    expect(interaction.reply).not.toHaveBeenCalled()
    expect(interaction.deleteReply).toHaveBeenCalledOnce()
  })

  it('posts nothing when the model returns empty text', async () => {
    generateTextMock.mockResolvedValue({ text: '   ' })
    const interaction = createInteraction()

    await replyWithModel(asInteraction(interaction), 'The user ran /summon.')

    expect(interaction.editReply).not.toHaveBeenCalled()
    expect(interaction.deleteReply).toHaveBeenCalledOnce()
  })

  it('splits a long model reply into follow-up messages', async () => {
    const longText = `${'a'.repeat(1500)} ${'b'.repeat(1500)}`
    generateTextMock.mockResolvedValue({ text: longText })
    const interaction = createInteraction()

    await replyWithModel(asInteraction(interaction), 'The user ran /summon.')

    expect(interaction.editReply).toHaveBeenCalledWith('a'.repeat(1500))
    expect(interaction.followUp).toHaveBeenCalledWith('b'.repeat(1500))
  })

  it('does not defer again when the command is already deferred', async () => {
    generateTextMock.mockResolvedValue({ text: 'Joined!' })
    const interaction = createInteraction()
    interaction.deferred = true

    await replyWithModel(asInteraction(interaction), 'You joined the voice channel "General".')

    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.editReply).toHaveBeenCalledWith('Joined!')
  })
})
