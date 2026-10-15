import { describe, it, expect } from 'vitest'
import { footprintImbalances, footprintLayout, footprintPoc, footprintValueArea, formatFootprintVolume, type FootprintRow } from '../common/Footprint'

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

describe('footprintValueArea', () => {
  // Volumes by row: 100:10, 101:20, 102:50 (POC), 103:15, 104:5 = 100 total.
  const rows: FootprintRow[] = [
    [100, 5, 5],
    [101, 10, 10],
    [102, 25, 25],
    [103, 5, 10],
    [104, 2, 3]
  ]

  it('grows from the POC toward the busier neighbour until it holds the share', () => {
    // 50, +20 below = 70: rows 101..102, so 101 to 103 in price.
    expect(footprintValueArea(rows, 1, 102, 0.7)).toEqual({ low: 101, high: 103 })
  })

  it('works from unsorted rows', () => {
    expect(footprintValueArea([...rows].reverse(), 1, 102, 0.7)).toEqual({ low: 101, high: 103 })
  })

  it('is null without a POC or volume', () => {
    expect(footprintValueArea(rows, 1, null)).toBeNull()
    expect(footprintValueArea([[100, 0, 0]], 1, 100)).toBeNull()
  })
})

describe('footprintLayout', () => {
  it('draws bid x ask columns on wide bars and one delta column on narrow ones', () => {
    expect(footprintLayout(40, 'adaptive').mode).toBe('split')
    expect(footprintLayout(28, 'adaptive').mode).toBe('split')
    expect(footprintLayout(27, 'adaptive').mode).toBe('single')
  })

  it('keeps each other style at every width', () => {
    for (const width of [6, 16, 60]) {
      expect(footprintLayout(width, 'delta').mode).toBe('single')
      expect(footprintLayout(width, 'profile').mode).toBe('profile')
      expect(footprintLayout(width, 'histogram').mode).toBe('histogram')
    }
  })

  it('thins the body strip to 2px on narrow bars', () => {
    expect(footprintLayout(12, 'delta')).toMatchObject({ bodyWidth: 2, gap: 1 })
    expect(footprintLayout(100, 'delta')).toMatchObject({ bodyWidth: 8, gap: 2 })
  })
})
