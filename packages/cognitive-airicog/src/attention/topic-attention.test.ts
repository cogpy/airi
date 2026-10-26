import { describe, expect, it } from 'vitest'

import { createTopicAttention } from './topic-attention'

const START = 1_000_000

function salienceOf(attention: ReturnType<typeof createTopicAttention>, topic: string): number | undefined {
  return attention.candidates().find(candidate => candidate.atomId === topic)?.salience
}

describe('topicAttention', () => {
  it('puts a noticed topic in focus, named by the topic', () => {
    const attention = createTopicAttention()

    attention.notice('cats', 0.6, START)

    expect(attention.candidates()).toEqual([{ atomId: 'cats', salience: expect.closeTo(0.6, 5) }])
  })

  it('associates topics that come up within the co-mention window', () => {
    const attention = createTopicAttention({ coMentionWindowMs: 60_000 })

    attention.notice('cats', 0.6, START)
    attention.notice('dogs', 0.6, START + 30_000)
    attention.notice('taxes', 0.6, START + 200_000)

    expect(attention.associations('cats').map(association => association.topic)).toEqual(['dogs'])
    expect(attention.associations('taxes')).toEqual([])
  })

  it('strengthens an association with each co-mention', () => {
    const attention = createTopicAttention()

    attention.notice('cats', 0.6, START)
    attention.notice('dogs', 0.6, START + 1000)
    const once = attention.associations('cats')[0]!.strength
    attention.notice('cats', 0.6, START + 2000)
    const twice = attention.associations('cats')[0]!.strength

    expect(twice).toBeGreaterThan(once)
  })

  it('brings an associated topic back to mind when its partner comes up again', () => {
    const attention = createTopicAttention()
    attention.notice('cats', 0.6, START)
    attention.notice('dogs', 0.6, START + 1000)
    for (let step = 0; step < 200; step++)
      attention.step()
    expect(salienceOf(attention, 'dogs')).toBeUndefined()

    attention.notice('cats', 0.6, START + 600_000)

    expect(salienceOf(attention, 'dogs')).toBeGreaterThan(0)
  })

  it('lets an unmentioned topic fade out of focus', () => {
    const attention = createTopicAttention()
    attention.notice('cats', 0.6, START)

    for (let step = 0; step < 200; step++)
      attention.step()

    expect(attention.candidates()).toEqual([])
  })

  it('keeps the notice of a topic at what stimulation granted, also after spreading', () => {
    const attention = createTopicAttention()
    attention.notice('cats', 0.4, START)
    attention.notice('dogs', 0.4, START + 1000)

    expect(salienceOf(attention, 'dogs')).toBeCloseTo(0.4, 5)
  })

  it('prunes faded topics that are not retained, with their associations', () => {
    const attention = createTopicAttention()
    attention.notice('cats', 0.6, START)
    attention.notice('dogs', 0.6, START + 1000)
    for (let step = 0; step < 200; step++)
      attention.step()

    attention.prune(new Set(['cats']))

    expect(attention.atomSpace.getNode('ConceptNode', 'dogs')).toBeUndefined()
    expect(attention.atomSpace.getNode('ConceptNode', 'cats')).toBeDefined()
    expect(attention.associations('cats')).toEqual([])
  })

  it('ignores an empty topic and clamps a salience outside 0 to 1', () => {
    const attention = createTopicAttention()

    attention.notice('  ', 0.6, START)
    attention.notice('cats', 7, START)

    expect(attention.candidates()).toEqual([{ atomId: 'cats', salience: 1 }])
  })

  it('infers a weaker association across a shared topic with PLN deduction', () => {
    const attention = createTopicAttention({ coMentionWindowMs: 60_000 })

    attention.notice('my cat', 0.6, START)
    attention.notice('the vet', 0.6, START + 1000)
    attention.notice('the bill', 0.6, START + 2000)

    const inferred = attention.associations('my cat').find(association => association.topic === 'the bill')
    const direct = attention.associations('my cat').find(association => association.topic === 'the vet')
    expect(inferred).toMatchObject({ inferred: true })
    expect(direct).toMatchObject({ inferred: false })
    expect(inferred!.strength).toBeLessThan(direct!.strength)
  })

  it('turns an inferred association into a direct one when the two come up together', () => {
    const attention = createTopicAttention({ coMentionWindowMs: 60_000 })
    attention.notice('my cat', 0.6, START)
    attention.notice('the vet', 0.6, START + 1000)
    attention.notice('the bill', 0.6, START + 2000)
    const before = attention.associations('my cat').find(association => association.topic === 'the bill')!.strength

    attention.notice('my cat', 0.6, START + 3000)

    const after = attention.associations('my cat').find(association => association.topic === 'the bill')!
    expect(after.inferred).toBe(false)
    expect(after.strength).toBeGreaterThan(before)
  })

  it('does not infer from an inferred association', () => {
    const attention = createTopicAttention({ coMentionWindowMs: 60_000 })
    attention.notice('a', 0.6, START)
    attention.notice('b', 0.6, START + 1000)
    attention.notice('c', 0.6, START + 2000)
    attention.notice('d', 0.6, START + 3000)

    expect(attention.associations('a').map(association => association.topic).sort()).toEqual(['b', 'c'])
  })
})
