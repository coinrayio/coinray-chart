import { describe, expect, it } from 'vitest'
import { fibLevelPosition, levelLineStyle } from '../extension/overlay/fibonacciShared'
import { levelLineStyle as cyclesLevelLineStyle } from '../extension/overlay/tv/fibCycles/shared'

describe('fibLevelPosition', () => {
  const far = { y: 100 }
  const near = { y: 0 }
  it('is linear in price and pixels by default', () => {
    expect(fibLevelPosition(0.5, far, near, 100, 200)).toEqual({ y: 50, value: 150 })
  })
  it('interpolates in log space when a mapper is given', () => {
    const { y, value } = fibLevelPosition(0.5, far, near, 100, 400, (p) => p)
    expect(value).toBeCloseTo(200)
    expect(y).toBeCloseTo(200)
  })
  it('falls back to linear for non-positive prices', () => {
    expect(fibLevelPosition(0.5, far, near, -10, 10, (p) => p).value).toBe(0)
  })
})

describe('levelLineStyle', () => {
  const base = { style: 'solid' as const, size: 2, dashedValue: [2, 2] }
  it('keeps the base when the level has no override', () => {
    expect(levelLineStyle(base, { color: '#f00' })).toEqual({ ...base, color: '#f00' })
  })
  it('lays the level style, width and dash over the base', () => {
    expect(levelLineStyle(base, { color: '#f00', lineStyle: 'dashed', lineWidth: 4, lineDashedValue: [6, 3] }))
      .toEqual({ style: 'dashed', size: 4, dashedValue: [6, 3], color: '#f00' })
  })
  it('fib time tools do the same', () => {
    expect(cyclesLevelLineStyle({ lineWidth: 3 }, { coeff: 1, color: '#0f0', lineWidth: 1, lineStyle: 'dashed' }))
      .toMatchObject({ style: 'dashed', size: 1, color: '#0f0' })
  })
})
