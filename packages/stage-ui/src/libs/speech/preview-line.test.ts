import { describe, expect, it } from 'vitest'

import { parseSpeechPreviewLine, speechPreviewConversation } from './preview-line'

describe('speechPreviewConversation', () => {
  it('asks for one line in the character\'s voice and language', () => {
    const [system] = speechPreviewConversation({ characterName: 'ReLU', language: 'ja' }).turns
    const text = system?.type === 'system' ? system.content.map(part => part.type === 'text' ? part.text : '').join('') : ''

    expect(text).toContain('ReLU, the character')
    expect(text).toContain('"ja"')
  })
})

describe('parseSpeechPreviewLine', () => {
  it('keeps the first line without its quotes', () => {
    expect(parseSpeechPreviewLine('"Hi, can you hear me?"\nmore')).toBe('Hi, can you hear me?')
    expect(parseSpeechPreviewLine('「こんにちは」')).toBe('こんにちは')
  })

  it('gives nothing for an empty or overlong reply', () => {
    expect(parseSpeechPreviewLine('  \n')).toBeUndefined()
    expect(parseSpeechPreviewLine('a'.repeat(201))).toBeUndefined()
  })

  // A reply from a model can hold a long run of quotes; trimming it must stay linear.
  it('trims a long run of quotes in linear time', () => {
    const started = performance.now()

    expect(parseSpeechPreviewLine(`${'"'.repeat(50_000)}x`)).toBe('x')
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
