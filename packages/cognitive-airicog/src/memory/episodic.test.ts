import type { Episode } from './episodic'

import { describe, expect, it } from 'vitest'

import { decideInitiative } from '../initiative/initiative'
import {
  asInitiativeCandidates,
  createDefaultMemoryConfig,
  encodingStrength,
  memoryStrength,
  recall,
  rehearse,
  shouldRetain,
} from './episodic'

const NOW = 1_000_000_000
const DAY = 86_400_000

function episodeWith(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'ep_1',
    atomId: 'atom_topic',
    at: NOW,
    salience: 0.6,
    ...overrides,
  }
}

describe('encodingStrength', () => {
  it('lays down an attended experience more strongly than a background one', () => {
    const attended = encodingStrength(episodeWith({ salience: 0.9 }))
    const background = encodingStrength(episodeWith({ salience: 0.1 }))

    expect(attended).toBeGreaterThan(background)
  })

  it('lays down a charged experience more strongly than a flat one', () => {
    const flat = encodingStrength(episodeWith({ valence: 0 }))
    const delighted = encodingStrength(episodeWith({ valence: 0.8 }))

    expect(delighted).toBeGreaterThan(flat)
  })

  it('reads feeling by magnitude, so upset sticks as well as delight', () => {
    const delighted = encodingStrength(episodeWith({ valence: 0.8 }))
    const upset = encodingStrength(episodeWith({ valence: -0.8 }))

    expect(upset).toBeCloseTo(delighted)
  })

  it('never encodes past full strength', () => {
    expect(encodingStrength(episodeWith({ salience: 1, valence: 1 }))).toBe(1)
  })

  it('holds nothing from an experience nothing was attending to', () => {
    expect(encodingStrength(episodeWith({ salience: 0, valence: 1 }))).toBe(0)
  })
})

describe('memoryStrength', () => {
  it('holds a fresh memory at its encoded strength', () => {
    const episode = episodeWith()

    expect(memoryStrength(episode, NOW)).toBeCloseTo(encodingStrength(episode))
  })

  it('fades a memory as it ages', () => {
    const episode = episodeWith()
    const today = memoryStrength(episode, NOW)
    const tomorrow = memoryStrength(episode, NOW + DAY)
    const nextWeek = memoryStrength(episode, NOW + 7 * DAY)

    expect(tomorrow).toBeLessThan(today)
    expect(nextWeek).toBeLessThan(tomorrow)
  })

  it('restores a memory that was recalled, measuring decay from the recall', () => {
    const forgotten = episodeWith()
    const revisited = rehearse(forgotten, NOW + 6 * DAY)

    expect(memoryStrength(revisited, NOW + 6 * DAY))
      .toBeGreaterThan(memoryStrength(forgotten, NOW + 6 * DAY))
  })

  it('makes a revisited memory outlast a vivid one left alone', () => {
    // The spacing effect: each recall lengthens the interval before the next
    // fade, so returning to something modest beats a strong one-off.
    const vivid = episodeWith({ id: 'ep_vivid', salience: 1, valence: 1 })

    let revisited = episodeWith({ id: 'ep_revisited', salience: 0.5 })
    for (let day = 1; day <= 3; day++)
      revisited = rehearse(revisited, NOW + day * DAY)

    const muchLater = NOW + 30 * DAY

    expect(memoryStrength(revisited, muchLater)).toBeGreaterThan(memoryStrength(vivid, muchLater))
  })

  it('does not let a backwards clock strengthen a memory', () => {
    const episode = episodeWith()

    expect(memoryStrength(episode, NOW - DAY)).toBeCloseTo(memoryStrength(episode, NOW))
  })
})

describe('shouldRetain', () => {
  it('keeps a memory that is still held', () => {
    expect(shouldRetain(episodeWith(), NOW)).toBe(true)
  })

  it('lets go of one that has faded past the floor', () => {
    expect(shouldRetain(episodeWith(), NOW + 365 * DAY)).toBe(false)
  })

  it('keeps a revisited memory that an untouched one would have lost', () => {
    const untouched = episodeWith({ id: 'ep_untouched' })

    let revisited = episodeWith({ id: 'ep_revisited' })
    for (let day = 1; day <= 5; day++)
      revisited = rehearse(revisited, NOW + day * DAY)

    const weeksLater = NOW + 20 * DAY

    expect(shouldRetain(revisited, weeksLater)).toBe(true)
    expect(shouldRetain(untouched, weeksLater)).toBe(false)
  })
})

describe('recall', () => {
  it('returns what is still held, strongest first', () => {
    const episodes = [
      episodeWith({ id: 'ep_faint', salience: 0.2 }),
      episodeWith({ id: 'ep_vivid', salience: 0.9 }),
      episodeWith({ id: 'ep_middling', salience: 0.5 }),
    ]

    expect(recall(episodes, NOW).map(r => r.episode.id))
      .toEqual(['ep_vivid', 'ep_middling', 'ep_faint'])
  })

  it('leaves out what has been forgotten', () => {
    const episodes = [
      episodeWith({ id: 'ep_recent' }),
      episodeWith({ id: 'ep_ancient', at: NOW - 365 * DAY }),
    ]

    expect(recall(episodes, NOW).map(r => r.episode.id)).toEqual(['ep_recent'])
  })

  it('remembers nothing from an empty history', () => {
    expect(recall([], NOW)).toEqual([])
  })

  it('does not mutate the episodes it ranks', () => {
    const episode = episodeWith()
    const before = structuredClone(episode)

    recall([episode], NOW)

    expect(episode).toEqual(before)
  })
})

describe('rehearse', () => {
  it('leaves the original memory untouched', () => {
    const episode = episodeWith()

    rehearse(episode, NOW + DAY)

    expect(episode.recalledAt).toBeUndefined()
  })

  it('accumulates each recall', () => {
    const twice = rehearse(rehearse(episodeWith(), NOW + DAY), NOW + 2 * DAY)

    expect(twice.recalledAt).toEqual([NOW + DAY, NOW + 2 * DAY])
  })
})

describe('asInitiativeCandidates', () => {
  it('offers held memories as subjects, ranked by how well they are held', () => {
    const episodes = [
      episodeWith({ id: 'ep_faint', atomId: 'atom_faint', salience: 0.2 }),
      episodeWith({ id: 'ep_vivid', atomId: 'atom_vivid', salience: 0.9 }),
    ]

    const candidates = asInitiativeCandidates(episodes, NOW)

    expect(candidates.map(c => c.atomId)).toEqual(['atom_vivid', 'atom_faint'])
    expect(candidates[0].salience).toBeGreaterThan(candidates[1].salience)
  })

  it('skips a memory that cannot name its subject', () => {
    const episodes = [
      episodeWith({ id: 'ep_nameless', atomId: undefined }),
      episodeWith({ id: 'ep_named', atomId: 'atom_named' }),
    ]

    expect(asInitiativeCandidates(episodes, NOW).map(c => c.atomId)).toEqual(['atom_named'])
  })

  it('gives initiative something to raise from memory alone', () => {
    // The loop that makes remembering worth having: a subject the character
    // has not seen since, still held well enough to bring up in a lull.
    const remembered = episodeWith({ atomId: 'atom_minecraft', salience: 0.8, valence: 0.6 })
    const later = NOW + 2 * DAY

    const decision = decideInitiative({
      now: later,
      lastInteractionAt: later - 600_000,
      candidates: asInitiativeCandidates([remembered], later),
    })

    expect(decision.act).toBe(true)
    if (decision.act)
      expect(decision.topicAtomId).toBe('atom_minecraft')
  })

  it('stops offering a subject once its memory has gone', () => {
    const forgotten = episodeWith({ atomId: 'atom_gone', at: NOW - 365 * DAY })
    const config = createDefaultMemoryConfig()

    expect(asInitiativeCandidates([forgotten], NOW, config)).toEqual([])
  })
})
