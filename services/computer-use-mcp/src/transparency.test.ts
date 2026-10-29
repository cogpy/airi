import type { StrategyAdvisory } from './strategy'

import { describe, expect, it } from 'vitest'

import { explainNextStep } from './transparency'

function advisoryOf(kind: StrategyAdvisory['kind'], reason: string): StrategyAdvisory {
  return { kind, reason, category: 'prep', recommendedSurface: 'none' }
}

describe('explainNextStep', () => {
  // ROOT CAUSE:
  //
  // The next-step advice was written in the first person ("I need to focus…", "I'm adjusting my plan").
  // Shown in a tool result, fixed text then read as the character's own reasoning.
  it('words the advice as neutral guidance, not as the character speaking', () => {
    const text = explainNextStep([
      advisoryOf('focus_app_first', 'Finder is not in front.'),
      advisoryOf('take_screenshot_first', 'The screen state is unknown.'),
      advisoryOf('use_terminal_instead', 'A file listing is needed.'),
      advisoryOf('read_error_first', 'The last command failed.'),
      advisoryOf('approval_rejected_replan', 'The user rejected the click.'),
    ])

    expect(text).not.toMatch(/\bI(?:'ll|'m)?\b/)
    expect(text).toContain('Advice: focus the correct application first. Finder is not in front.')
    expect(text).toContain('The previous action was rejected. Advice: adjust the plan.')
  })
})
