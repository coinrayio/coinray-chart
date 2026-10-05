import { describe, it, expect } from 'vitest'
import { footprintImbalances, footprintPoc, formatFootprintVolume, type FootprintRow } from '../common/Footprint'

describe('footprintImbalances', () => {
  const rows: FootprintRow[] = [
    [100, 10, 5],
    [101, 2, 40],
    [102, 30, 1],
    [103, 0, 9]
  ]

  it('flags the ask at P against the bid one row below', () => {
    // ask 40 @101 vs bid 10 @100 = 4x
    expect([...footprintImbalances(rows, 1, 3).ask]).toEqual([1])
  })

  it('flags the bid at P against the ask one row above', () => {
    // bid 30 @102 vs ask 9 @103 = 3.3x; bid 10 @100 vs ask 40 @101 is not
    expect([...footprintImbalances(rows, 1, 3).bid]).toEqual([2])
  })

  it('ignores a diagonal partner with no volume', () => {
    const sparse: FootprintRow[] = [[100, 0, 0], [101, 5, 50]]
    expect(footprintImbalances(sparse, 1, 3).ask.size).toBe(0)
    expect(footprintImbalances(sparse, 1, 3).bid.size).toBe(0)
  })

  it('matches rows by step, not array position, with fractional row sizes', () => {
    const fractional: FootprintRow[] = [[0.3, 1, 0], [0.1, 1, 0], [0.2, 0, 3]]
    expect([...footprintImbalances(fractional, 0.1, 3).ask]).toEqual([2])
  })
})

describe('footprintPoc', () => {
  it('picks the row with the most total volume', () => {
    expect(footprintPoc([[1, 1, 1], [2, 5, 5], [3, 2, 2]], 1)).toBe(2)
  })

  it('breaks ties toward the close', () => {
    expect(footprintPoc([[1, 5, 5], [2, 1, 1], [3, 5, 5]], 3)).toBe(3)
    expect(footprintPoc([[1, 5, 5], [2, 1, 1], [3, 5, 5]], 1)).toBe(1)
  })

  it('is null without volume', () => {
    expect(footprintPoc([], 1)).toBeNull()
    expect(footprintPoc([[1, 0, 0]], 1)).toBeNull()
  })
})

describe('formatFootprintVolume', () => {
  it('formats compactly', () => {
    expect(formatFootprintVolume(0)).toBe('0')
    expect(formatFootprintVolume(0.0314)).toBe('0.031')
    expect(formatFootprintVolume(4.5)).toBe('4.5')
    expect(formatFootprintVolume(4)).toBe('4')
    expect(formatFootprintVolume(350.4)).toBe('350')
    expect(formatFootprintVolume(7000)).toBe('7K')
    expect(formatFootprintVolume(7250)).toBe('7.3K')
    expect(formatFootprintVolume(1_200_000)).toBe('1.2M')
    expect(formatFootprintVolume(250_000)).toBe('250K')
    expect(formatFootprintVolume(3e9)).toBe('3B')
  })
})
