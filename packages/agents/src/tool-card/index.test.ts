import { describe, expect, it } from 'vitest'

import { readToolCardReply } from '.'

describe('readToolCardReply', () => {
  it('reads the sentence and the program of a tagged fence', () => {
    const reply = 'Shows the weather for today.\n```openui-lang\nCard(Query("weather"))\n```'

    expect(readToolCardReply(reply)).toEqual({ description: 'Shows the weather for today.', program: 'Card(Query("weather"))' })
  })

  it('reads a sentence that follows the fence', () => {
    const reply = '```\nList(Query("items"))\n```\nLists the items.'

    expect(readToolCardReply(reply)).toEqual({ description: 'Lists the items.', program: 'List(Query("items"))' })
  })

  it('reads only the first fence', () => {
    const reply = 'First.\n```\nA()\n```\n```\nB()\n```'

    expect(readToolCardReply(reply).program).toBe('A()')
  })

  it('throws on a reply without a fence', () => {
    expect(() => readToolCardReply('I cannot make a card.')).toThrow('no openui-lang fence')
  })

  it('throws on a fence that is never closed', () => {
    expect(() => readToolCardReply('Card.\n```openui-lang\nCard()')).toThrow('no openui-lang fence')
  })

  it('throws on an empty fence', () => {
    expect(() => readToolCardReply('Card.\n```\n   \n```')).toThrow('no openui-lang fence')
  })

  // https://github.com/cogpy/airi/security/code-scanning/58
  //
  // ROOT CAUSE:
  //
  // The fence was matched with /```[^\n]*\n([\s\S]*?)```/. On a reply of
  // fences without a newline, the engine retried the line run at every
  // fence, so 120 KB took 13 s.
  //
  // We fixed this by finding the fence with index scans.
  it('reads a long run of fences without a newline in linear time', () => {
    const reply = '```'.repeat(40_000)

    const started = performance.now()
    expect(() => readToolCardReply(reply)).toThrow('no openui-lang fence')
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
