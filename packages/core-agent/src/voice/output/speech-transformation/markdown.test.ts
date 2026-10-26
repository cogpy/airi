import { describe, expect, it } from 'vitest'

import { normalizeMathDelimiters } from './markdown'

describe('normalizeMathDelimiters', () => {
  it('converts the parenthesis and bracket delimiters outside code', () => {
    expect(normalizeMathDelimiters(String.raw`a \(x\) b \[y\]`)).toBe('a $x$ b $$y$$')
    expect(normalizeMathDelimiters('`\\(x\\)` and \\(x\\)')).toBe('`\\(x\\)` and $x$')
    expect(normalizeMathDelimiters('```\n\\[x\\]\n```')).toBe('```\n\\[x\\]\n```')
  })

  it('matches each opening delimiter with the first closing one after it', () => {
    expect(normalizeMathDelimiters(String.raw`\[a\] and \[b\]`)).toBe('$$a$$ and $$b$$')
    expect(normalizeMathDelimiters(String.raw`\[\]x\]`)).toBe(String.raw`$$\]x$$`)
    expect(normalizeMathDelimiters(String.raw`\[ unclosed \(x\)`)).toBe(String.raw`\[ unclosed $x$`)
    expect(normalizeMathDelimiters(String.raw`\[\]`)).toBe(String.raw`\[\]`)
  })

  // https://github.com/cogpy/airi/security/code-scanning/61
  //
  // ROOT CAUSE:
  //
  // The delimiters were matched with lazy regular expressions. On a reply of
  // many `\[` and no `\]`, the engine searched for `\]` again at every `\[`.
  //
  // We fixed this by finding each pair with index scans.
  it('handles a long run of opening delimiters in linear time', () => {
    const reply = String.raw`\[a`.repeat(100_000)

    const started = performance.now()
    expect(normalizeMathDelimiters(reply)).toBe(reply)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
