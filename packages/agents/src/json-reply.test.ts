import { describe, expect, it } from 'vitest'

import { readJsonReply } from './json-reply'

describe('readJsonReply', () => {
  it('reads a bare JSON reply', () => {
    expect(readJsonReply('{"complete": true}')).toEqual({ complete: true })
  })

  it('reads a reply wrapped in a tagged code fence', () => {
    expect(readJsonReply('```json\n{"complete": true}\n```')).toEqual({ complete: true })
  })

  it('reads a reply wrapped in an untagged code fence', () => {
    expect(readJsonReply('```\n{"complete": false}\n```')).toEqual({ complete: false })
  })

  it('reads a reply the model only opened or only closed a fence on', () => {
    expect(readJsonReply('```json {"a": 1}')).toEqual({ a: 1 })
    expect(readJsonReply('{"a": 2} ```')).toEqual({ a: 2 })
  })

  it('keeps a fence that sits inside a string value', () => {
    expect(readJsonReply('{"text": "``` not a fence"}')).toEqual({ text: '``` not a fence' })
  })

  it('throws on a reply that is not JSON', () => {
    expect(() => readJsonReply('I cannot help with that.')).toThrow()
  })

  // ROOT CAUSE:
  //
  // `/\s*```$/` is unanchored, so the engine retried `\s*` across a whitespace
  // run at every start position: quadratic, 82 ms at 10 KB and 5.2 s at 80 KB.
  // Only an interior run reaches it, because `.trim()` removes the edges.
  //
  // Fixed with `endsWith` and `trimEnd` on a slice.
  it('reads a long interior whitespace run without quadratic cost', () => {
    const reply = `{"text":"${' '.repeat(80_000)}"}`

    const started = performance.now()
    expect(readJsonReply(reply)).toEqual({ text: ' '.repeat(80_000) })

    // The old pattern needed about 5 s for this input. The bound is wide so a
    // slow machine cannot fail the test, and still catches a return to
    // quadratic scanning.
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
