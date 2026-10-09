import type { Episode } from './episodic'

import { describe, expect, it } from 'vitest'

import { asInitiativeCandidates, memoryStrength } from './episodic'
import { decideReflection, parseReflection, reflectionEpisodes, reflectionPrompt } from './reflection'

const NOW = 1_000_000_000

function remark(index: number, salience = 0.6, at = NOW - 60_000 + index): Episode {
  return { id: `ep_${index}`, atomId: `remark ${index}`, at, salience }
}

function remarks(count: number, salience = 0.6): Episode[] {
  return Array.from({ length: count }, (_, index) => remark(index, salience))
}

describe('decideReflection', () => {
  it('waits for a few experiences before reflecting at all', () => {
    expect(decideReflection({ now: NOW, episodes: remarks(2, 1) })).toMatchObject({ reflect: false, reason: 'too-few', pending: 2 })
  })

  it('reflects once new experiences are strong enough in sum', () => {
    const decision = decideReflection({ now: NOW, episodes: remarks(5) })

    expect(decision).toMatchObject({ reflect: true, pending: 5 })
    expect(decision.importance).toBeCloseTo(3)
  })

  it('reflects on a long run of faint experiences by count alone', () => {
    expect(decideReflection({ now: NOW, episodes: remarks(9, 0.1) })).toMatchObject({ reflect: false, reason: 'below-threshold' })
    expect(decideReflection({ now: NOW, episodes: remarks(10, 0.1) })).toMatchObject({ reflect: true, pending: 10 })
  })

  it('counts only experiences after the last reflection, and never reflections', () => {
    const lastReflectionAt = NOW - 30 * 60_000
    const old = { ...remark(100, 1), at: lastReflectionAt - 1 }
    const insight = reflectionEpisodes(['an insight'], [old], NOW - 1000)[0]!

    const decision = decideReflection({ now: NOW, episodes: [old, insight, ...remarks(2, 1)], lastReflectionAt })

    expect(decision).toMatchObject({ reflect: false, reason: 'too-few', pending: 2 })
  })

  it('stays refractory after a reflection however much happens', () => {
    expect(decideReflection({ now: NOW, episodes: remarks(30, 1), lastReflectionAt: NOW - 60_000 })).toMatchObject({ reflect: false, reason: 'refractory' })
    // A clock that ran backwards is not elapsed time.
    expect(decideReflection({ now: NOW, episodes: remarks(30, 1), lastReflectionAt: NOW + 60_000 })).toMatchObject({ reflect: false, reason: 'refractory' })
  })

  it('offers the newest experiences, oldest first, up to the source limit', () => {
    const decision = decideReflection({ now: NOW, episodes: remarks(25).reverse() }, { maxSources: 4 })

    expect(decision.reflect && decision.sources.map(source => source.id)).toEqual(['ep_21', 'ep_22', 'ep_23', 'ep_24'])
  })
})

describe('reflectionPrompt', () => {
  it('lists described experiences in order and asks for a bounded number of insights', () => {
    const prompt = reflectionPrompt(
      [remark(1), { ...remark(2), atomId: undefined }, remark(3)],
      episode => episode.atomId,
      { characterName: 'Vexa', maxInsights: 2 },
    )

    expect(prompt).toContain('You are Vexa.')
    expect(prompt).toContain('- remark 1\n- remark 3')
    expect(prompt).toContain('at most 2 insights')
    expect(prompt).toContain('reply with: none')
  })
})

describe('parseReflection', () => {
  it('strips numbering, bullets and quotes, and drops duplicates', () => {
    expect(parseReflection('1. They get nervous before interviews.\n- "I joke too much when they are tired."\n2) they get nervous before interviews.', 5))
      .toEqual(['They get nervous before interviews.', 'I joke too much when they are tired.'])
  })

  it('treats "none" and empty replies as nothing to remember', () => {
    expect(parseReflection('None.')).toEqual([])
    expect(parseReflection('\n  \n')).toEqual([])
  })

  it('keeps at most the requested number of insights and skips rambling lines', () => {
    expect(parseReflection(`a\nb\nc\nd\n${'x'.repeat(300)}`, 3)).toEqual(['a', 'b', 'c'])
    expect(parseReflection(`${'x'.repeat(300)}\nshort one`, 3)).toEqual(['short one'])
  })
})

describe('reflectionEpisodes', () => {
  it('lays insights down as reflections linked to their sources', () => {
    const sources = remarks(3)
    const [episode] = reflectionEpisodes(['They like cats.'], sources, NOW)

    expect(episode).toEqual({
      id: `reflection_${NOW}_0`,
      atomId: 'They like cats.',
      at: NOW,
      salience: 0.9,
      kind: 'reflection',
      sources: ['ep_0', 'ep_1', 'ep_2'],
    })
  })

  it('outlasts the remarks it came from and can be raised in a lull', () => {
    const sources = remarks(3)
    const [insight] = reflectionEpisodes(['They like cats.'], sources, NOW)
    const later = NOW + 7 * 86_400_000

    expect(memoryStrength(insight!, later)).toBeGreaterThan(memoryStrength(sources[0]!, later))
    expect(asInitiativeCandidates([...sources, insight!], later)[0]?.atomId).toBe('They like cats.')
  })
})
