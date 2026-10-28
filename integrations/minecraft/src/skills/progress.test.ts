import { describe, expect, it } from 'vitest'

import { ActionError } from '../utils/errors'
import { collectSkillProgress, reportSkillProgress, withSkillProgress } from './progress'

describe('collectSkillProgress', () => {
  it('collects progress facts that nested skill steps report', async () => {
    const { result, progress } = await collectSkillProgress(async () => {
      reportSkillProgress('Crafted 4 oak planks.')
      await Promise.resolve()
      reportSkillProgress('Crafted a wooden pickaxe.')
      return 3
    })

    expect(result).toBe(3)
    expect(progress).toEqual(['Crafted 4 oak planks.', 'Crafted a wooden pickaxe.'])
  })

  it('keeps progress of concurrent runs apart', async () => {
    const [first, second] = await Promise.all([
      collectSkillProgress(async () => {
        await Promise.resolve()
        reportSkillProgress('first')
      }),
      collectSkillProgress(async () => {
        reportSkillProgress('second')
      }),
    ])

    expect(first.progress).toEqual(['first'])
    expect(second.progress).toEqual(['second'])
  })

  it('ignores a report outside of a collector', () => {
    expect(() => reportSkillProgress('no collector')).not.toThrow()
  })

  it('adds the finished sub-steps to an ActionError context', async () => {
    const run = collectSkillProgress(async () => {
      reportSkillProgress('Crafted 4 oak planks.')
      throw new ActionError('CRAFTING_FAILED', 'Failed to craft sticks', { item: 'stick' })
    })

    await expect(run).rejects.toMatchObject({
      code: 'CRAFTING_FAILED',
      message: 'Failed to craft sticks',
      context: { item: 'stick', progress: ['Crafted 4 oak planks.'] },
    })
  })
})

describe('withSkillProgress', () => {
  it('returns the result unchanged when there is no progress', () => {
    expect(withSkillProgress('Collected [stone] x3', [])).toBe('Collected [stone] x3')
  })

  it('appends sub-steps to a string result', () => {
    expect(withSkillProgress('Collected [stone] x3', ['Crafted a wooden pickaxe.']))
      .toBe('Collected [stone] x3\nSub-steps: Crafted a wooden pickaxe.')
  })

  it('adds sub-steps to an object result', () => {
    expect(withSkillProgress({ ok: true }, ['a', 'b'])).toEqual({ ok: true, subSteps: ['a', 'b'] })
  })
})
