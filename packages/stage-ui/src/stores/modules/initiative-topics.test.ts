import { describe, expect, it, vi } from 'vitest'

import { createTopicExtractor, parseTopicResponse, TOPIC_EXTRACTION_PROMPT } from './initiative-topics'

describe('parseTopicResponse', () => {
  it('takes a short noun phrase as the subject', () => {
    expect(parseTopicResponse('minecraft speedruns')).toBe('minecraft speedruns')
  })

  it('normalizes so the same subject twice lands on one key', () => {
    // Without this, two mentions become two memories and neither accumulates.
    expect(parseTopicResponse('  Minecraft   Speedruns ')).toBe(parseTopicResponse('minecraft speedruns'))
  })

  it('unwraps a phrase the model quoted', () => {
    expect(parseTopicResponse('"minecraft speedruns"')).toBe('minecraft speedruns')
    expect(parseTopicResponse('minecraft speedruns.')).toBe('minecraft speedruns')
  })

  it('accepts nothing from an explicit NONE', () => {
    expect(parseTopicResponse('NONE')).toBeUndefined()
    expect(parseTopicResponse('none')).toBeUndefined()
  })

  it('accepts nothing from an empty or missing answer', () => {
    expect(parseTopicResponse('')).toBeUndefined()
    expect(parseTopicResponse('   ')).toBeUndefined()
    expect(parseTopicResponse(undefined)).toBeUndefined()
    expect(parseTopicResponse(null)).toBeUndefined()
  })

  it('rejects a sentence, which would never match a second mention', () => {
    expect(parseTopicResponse('The user is talking about their new graphics card setup'))
      .toBeUndefined()
  })

  it('rejects a model that answered about the task instead of the message', () => {
    expect(parseTopicResponse('I cannot determine')).toBeUndefined()
    expect(parseTopicResponse('Sorry, unclear')).toBeUndefined()
    expect(parseTopicResponse('As an AI model')).toBeUndefined()
    expect(parseTopicResponse('The subject is games')).toBeUndefined()
  })

  it('rejects a phrase too long to be a subject', () => {
    expect(parseTopicResponse('a'.repeat(64))).toBeUndefined()
  })
})

describe('createTopicExtractor', () => {
  it('names the subject of a message', async () => {
    const generate = vi.fn().mockResolvedValue('minecraft speedruns')
    const derive = createTopicExtractor({ generate })

    expect(await derive('did you see that speedrun')).toBe('minecraft speedruns')
    expect(generate).toHaveBeenCalledWith({
      prompt: TOPIC_EXTRACTION_PROMPT,
      message: 'did you see that speedrun',
    })
  })

  it('does not ask about an empty message', async () => {
    const generate = vi.fn()
    const derive = createTopicExtractor({ generate })

    expect(await derive('   ')).toBeUndefined()
    expect(generate).not.toHaveBeenCalled()
  })

  it('truncates a long message rather than skipping it', async () => {
    const generate = vi.fn().mockResolvedValue('long story')
    const derive = createTopicExtractor({ generate, maxMessageLength: 10 })

    await derive('a'.repeat(50))

    expect(generate.mock.calls[0][0].message).toHaveLength(10)
  })

  it('leaves the character with nothing to raise when the provider fails', async () => {
    // A naming failure must never surface into the conversation: the worst it
    // can do is leave the character where it was before anyone wired this up.
    const derive = createTopicExtractor({
      generate: vi.fn().mockRejectedValue(new Error('rate limited')),
    })

    await expect(derive('anything at all')).resolves.toBeUndefined()
  })

  it('rejects a junk answer rather than remembering it', async () => {
    const derive = createTopicExtractor({
      generate: vi.fn().mockResolvedValue('I am not sure what they mean by that'),
    })

    expect(await derive('mmm')).toBeUndefined()
  })
})
