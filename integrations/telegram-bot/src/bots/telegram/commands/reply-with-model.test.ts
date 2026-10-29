import { beforeEach, describe, expect, it, vi } from 'vitest'

import { replyWithModel } from './reply-with-model'

const generateTextMock = vi.hoisted(() => vi.fn())

vi.mock('@xsai/generate-text', () => ({
  generateText: generateTextMock,
}))

vi.mock('../../../prompts', () => ({
  personality: vi.fn(async () => 'You are the test character.'),
}))

describe('replyWithModel', () => {
  beforeEach(() => {
    generateTextMock.mockReset()
  })

  // ROOT CAUSE:
  //
  // `/add_sticker_pack` replied with fixed strings such as 'Sticker pack added.' from her account, without the model.
  it('sends the text that the model writes from the outcome', async () => {
    generateTextMock.mockResolvedValue({ text: '<think>ok</think>Got it, new stickers to play with!' })
    const ctx = { reply: vi.fn() }

    await replyWithModel(ctx, 'You added the sticker pack "Cats" with 12 stickers.')

    const [request] = generateTextMock.mock.calls[0]
    expect(request.messages[0].content).toContain('You are the test character.')
    expect(request.messages.at(-1).content).toBe('You added the sticker pack "Cats" with 12 stickers.')
    expect(ctx.reply).toHaveBeenCalledWith('Got it, new stickers to play with!')
  })

  it('sends nothing when the model fails', async () => {
    generateTextMock.mockRejectedValue(new Error('provider down'))
    const ctx = { reply: vi.fn() }

    await replyWithModel(ctx, 'The command was not a reply to a sticker.')

    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('sends nothing when the model returns empty text', async () => {
    generateTextMock.mockResolvedValue({ text: '<think>hmm</think>  ' })
    const ctx = { reply: vi.fn() }

    await replyWithModel(ctx, 'The command was not a reply to a sticker.')

    expect(ctx.reply).not.toHaveBeenCalled()
  })
})
