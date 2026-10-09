import { describe, expect, it } from 'vitest'

import { heldInsights, insightsContextMessage, reflectionConversation } from './reflection'

const NOW = 1_000_000_000

describe('reflection helpers', () => {
  it('lists held reflections strongest first, skipping experiences', () => {
    const episodes = [
      { id: 'e1', atomId: 'a remark', at: NOW, salience: 1 },
      { id: 'r1', atomId: 'An old insight.', at: NOW - 6 * 86_400_000, salience: 0.9, kind: 'reflection' as const },
      { id: 'r2', atomId: 'A fresh insight.', at: NOW, salience: 0.9, kind: 'reflection' as const },
    ]

    expect(heldInsights(episodes, NOW)).toEqual(['A fresh insight.', 'An old insight.'])
    expect(heldInsights(episodes, NOW, 1)).toEqual(['A fresh insight.'])
  })

  it('puts insights in the memory lane, replacing its own last copy', () => {
    expect(insightsContextMessage(['They like cats.'])).toMatchObject({
      contextId: 'reflection',
      lane: 'memory',
      strategy: 'replace-self',
      text: 'What you have come to understand from this conversation so far:\n- They like cats.',
    })
  })

  it('sends the reflection prompt as the only user turn', () => {
    expect(reflectionConversation('reflect please').turns).toEqual([
      { type: 'user', id: 'reflection-request', content: [{ type: 'text', text: 'reflect please' }] },
    ])
  })
})
