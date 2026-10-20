import { describe, expect, it } from 'vitest'

import { parseTopicName, topicNamingConversation } from './topic-naming'

describe('parseTopicName', () => {
  it('strips quotes, trailing punctuation and case', () => {
    expect(parseTopicName('"The Job Interview."\n')).toBe('the job interview')
  })

  it('keeps only the first line when the model adds commentary', () => {
    expect(parseTopicName('their cat\nThis is about a pet.')).toBe('their cat')
  })

  // ROOT CAUSE:
  //
  // Quotes and punctuation were stripped with an anchored `[…]+$` regular
  // expression, which a model reply with a long run of quotes made quadratic.
  //
  // We fixed this by trimming with es-toolkit's index-based trimStart/trimEnd.
  it('strips a long run of quotes in linear time', () => {
    const quotes = '"'.repeat(50_000)

    expect(parseTopicName(`${quotes}Their cat${quotes}`)).toBe('their cat')
  })

  it('treats "none" as nothing worth returning to', () => {
    expect(parseTopicName('None.')).toBeUndefined()
    expect(parseTopicName('   ')).toBeUndefined()
  })

  it('rejects a reply too long to be a name', () => {
    expect(parseTopicName('that sounds like a really fun weekend, you should tell me more about it')).toBeUndefined()
  })
})

describe('topicNamingConversation', () => {
  it('sends the remark as the user turn after the instructions', () => {
    const conversation = topicNamingConversation('my cat learned to open doors')

    expect(conversation.turns.map(turn => turn.type)).toEqual(['system', 'user'])
    expect(conversation.turns[1]).toMatchObject({ content: [{ type: 'text', text: 'my cat learned to open doors' }] })
  })
})
