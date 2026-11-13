import { describe, it, expect } from 'vitest'
import { areaPolygon, columnWidthFor, extendLine } from '../view/IndicatorView'

describe('step lines', () => {
  it('a plain line goes straight to the next value', () => {
    const line = [{ x: 0, y: 10 }]
    extendLine(line, 8, 10, 20, false)
    expect(line).toEqual([{ x: 0, y: 10 }, { x: 8, y: 20 }])
  })

  it('a step runs flat to the next bar, then rises to its value', () => {
    const line = [{ x: 0, y: 10 }]
    extendLine(line, 8, 10, 20, true)
    expect(line).toEqual([{ x: 0, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 20 }])
  })

  it('a step with no change adds no riser', () => {
    const line = [{ x: 0, y: 10 }]
    extendLine(line, 8, 10, 10, true)
    expect(line).toEqual([{ x: 0, y: 10 }, { x: 8, y: 10 }])
  })

  it('a step whose next bar has no value runs flat to it and stops', () => {
    const line = [{ x: 0, y: 10 }]
    extendLine(line, 8, 10, undefined, true)
    expect(line).toEqual([{ x: 0, y: 10 }, { x: 8, y: 10 }])
  })
})

describe('tradingview.com plot styles', () => {
  it('Columns fill the bar less a 1px gap; a Histogram is its own width', () => {
    expect(columnWidthFor(10)).toBe(9)
    expect(columnWidthFor(10, 2)).toBe(2)
    expect(columnWidthFor(10, 0)).toBe(1)
  })

  it('an Area closes its line down to the base', () => {
    expect(areaPolygon([{ x: 0, y: 10 }, { x: 8, y: 20 }], 50)).toEqual([
      { x: 0, y: 50 }, { x: 0, y: 10 }, { x: 8, y: 20 }, { x: 8, y: 50 },
    ])
    expect(areaPolygon([], 50)).toEqual([])
  })
})
