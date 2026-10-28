import { describe, expect, it } from 'vitest'

import { caseSensitiveLetters } from './normalize'

describe('caseSensitiveLetters', () => {
  it('reads a calligraphic or blackboard letter as a letter, and drops upright words', () => {
    expect([...caseSensitiveLetters(String.raw`\mathcal{U} + u_t`)]).toContain('u')
    expect([...caseSensitiveLetters(String.raw`\mathrm{Var}(x) + X`)]).not.toContain('v')
  })

  // https://github.com/cogpy/airi/security/code-scanning/60
  //
  // ROOT CAUSE:
  //
  // `\{([^}]*)\}` let each scan run past other braces to the end of the
  // reference, so a run of unclosed `\mathbb{{` was quadratic.
  //
  // We fixed this by stopping each scan at the next brace with `[^{}]`.
  it('handles a long run of unclosed commands in linear time', () => {
    const reference = String.raw`\mathbb{{|`.repeat(20_000)

    const started = performance.now()
    caseSensitiveLetters(reference)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
