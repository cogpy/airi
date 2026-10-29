import type { IndexedData } from 'minecraft-data'

import { describe, expect, it } from 'vitest'

import { McData } from './mcdata'

function registryWithBlocks(names: string[]): IndexedData {
  return { blocksByName: Object.fromEntries(names.map((name, id) => [name, { id, name }])) } as unknown as IndexedData
}

describe('mcData.getClosestBlockName', () => {
  // ROOT CAUSE:
  //
  // The edit-distance matrix was built with `Array.from({ length }).fill(row)`, so every row was the same array.
  // Each write changed all rows, and the distances were wrong. A small typo then matched an unrelated block.
  it('matches a misspelled block name to the nearest real name', () => {
    const data = new McData(registryWithBlocks(['stone', 'oak_log', 'diamond_ore', 'dirt']))

    expect(data.getClosestBlockName('diamon_ore')).toBe('diamond_ore')
    expect(data.getClosestBlockName('oak_logg')).toBe('oak_log')
    expect(data.getClosestBlockName('dirt')).toBe('dirt')
  })
})
