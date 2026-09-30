import { describe, expect, it } from 'vitest'
import type { KLineData } from '../common/Data'
import { predictionArc, projectionWedge } from '../extension/overlay/tv/forecastData/forecast'
import { vwapSeries } from '../extension/overlay/tv/forecastData/anchoredVwap'
import { buildProfile } from '../extension/overlay/tv/forecastData/volumeProfile'
import { linearRegression } from '../extension/overlay/tv/forecastData/regressionTrend'
import { orientPattern, patternEnds } from '../extension/overlay/tv/forecastData/barsPattern'
import { ghostBar, ghostCandles } from '../extension/overlay/tv/forecastData/ghostFeed'

const bar = (open: number, high: number, low: number, close: number, volume: number, timestamp = 0): KLineData => ({ timestamp, open, high, low, close, volume })

describe('forecast', () => {
  it('runs from source to target, leaving horizontally and arriving vertically', () => {
    const arc = predictionArc({ x: 0, y: 100 }, { x: 80, y: 20 }, 16)
    expect(arc[0]).toEqual({ x: 0, y: 100 })
    expect(arc[arc.length - 1].x).toBeCloseTo(80, 9)
    expect(arc[arc.length - 1].y).toBeCloseTo(20, 9)
    // First step is mostly horizontal, last step mostly vertical.
    expect(Math.abs(arc[1].x - arc[0].x)).toBeGreaterThan(Math.abs(arc[1].y - arc[0].y))
    const n = arc.length
    expect(Math.abs(arc[n - 1].y - arc[n - 2].y)).toBeGreaterThan(Math.abs(arc[n - 1].x - arc[n - 2].x))
  })
})

describe('projection', () => {
  it('pulls the direction point onto the base radius', () => {
    const { edge, arc } = projectionWedge({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 500 }, 8)
    expect(edge.x).toBeCloseTo(0, 9)
    expect(edge.y).toBeCloseTo(100, 9)
    for (const p of arc) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 9)
  })
  it('sweeps the short way round', () => {
    const { arc } = projectionWedge({ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 100, y: -10 }, 4)
    for (const p of arc) expect(p.x).toBeGreaterThan(0)
  })
})

describe('anchored vwap', () => {
  it('weights the source by volume from the anchor on', () => {
    const bars = [bar(0, 99, 1, 50, 1000), bar(10, 10, 10, 10, 1), bar(20, 20, 20, 20, 3)]
    const { vwap, sd } = vwapSeries(bars, 1, 'close')
    expect(vwap).toEqual([10, 17.5])
    expect(sd[0]).toBe(0)
    // Two prices 10 (w1) and 20 (w3): mean 17.5, variance 18.75.
    expect(sd[1]).toBeCloseTo(Math.sqrt(18.75), 9)
  })
  it('is NaN without volume rather than a wrong line', () => {
    expect(vwapSeries([bar(1, 1, 1, 1, 0)], 0, 'close').vwap[0]).toBeNaN()
  })
})

describe('volume profile', () => {
  const bars = [bar(0, 10, 0, 10, 100), bar(10, 10, 0, 0, 100), bar(4, 6, 4, 5, 50)]
  it('spreads volume over the rows a bar covers, split by direction', () => {
    const p = buildProfile(bars, 0, 2, 10, 70)!
    expect(p.rows).toHaveLength(10)
    const up = p.rows.reduce((a, r) => a + r.up, 0)
    const down = p.rows.reduce((a, r) => a + r.down, 0)
    expect(up).toBeCloseTo(150, 9)
    expect(down).toBeCloseTo(100, 9)
    // Row 0 (0..1): 10 up + 10 down from the two wide bars.
    expect(p.rows[0].up).toBeCloseTo(10, 9)
    expect(p.rows[0].down).toBeCloseTo(10, 9)
  })
  it('puts the POC on the busiest row and a value area around it holding the share asked', () => {
    const p = buildProfile(bars, 0, 2, 10, 70)!
    expect(p.poc).toBe(4) // the small bar sits on rows 4-5, first max wins
    const total = p.rows.reduce((a, r) => a + r.up + r.down, 0)
    const inside = p.rows.slice(p.vaFrom, p.vaTo + 1).reduce((a, r) => a + r.up + r.down, 0)
    expect(inside / total).toBeGreaterThanOrEqual(0.7)
    expect(p.vaFrom).toBeLessThanOrEqual(p.poc)
    expect(p.vaTo).toBeGreaterThanOrEqual(p.poc)
  })
  it('has no profile for a range with no price extent', () => {
    expect(buildProfile([bar(5, 5, 5, 5, 10)], 0, 0, 24, 70)).toBeNull()
  })
})

describe('regression trend', () => {
  it('recovers a straight line exactly', () => {
    const fit = linearRegression([1, 3, 5, 7, 9])
    expect(fit.slope).toBeCloseTo(2, 9)
    expect(fit.intercept).toBeCloseTo(1, 9)
    expect(fit.stdDev).toBeCloseTo(0, 9)
    expect(fit.pearsons).toBeCloseTo(1, 9)
  })
  it('uses the n - 1 deviation TV uses, and a negative R for a falling series', () => {
    const fit = linearRegression([4, 1, 3, 0])
    expect(fit.pearsons).toBeLessThan(0)
    const residual = [4, 1, 3, 0].reduce((a, y, i) => a + (y - (fit.intercept + fit.slope * i)) ** 2, 0)
    expect(fit.stdDev).toBeCloseTo(Math.sqrt(residual / 3), 9)
  })
})

describe('bars pattern', () => {
  const pattern: Array<[number, number, number, number]> = [[10, 12, 8, 11], [11, 15, 10, 14]]
  it('pins the first high and last low in bars mode, open and close in candles mode', () => {
    expect(patternEnds(orientPattern(pattern, false, false), 'bars')).toEqual({ first: 12, last: 10 })
    expect(patternEnds(orientPattern(pattern, false, false), 'candles')).toEqual({ first: 10, last: 14 })
  })
  it('mirrors in time and flips prices', () => {
    expect(orientPattern(pattern, true, false).map((b) => b.open)).toEqual([11, 10])
    const flipped = orientPattern(pattern, false, true)
    // range 8..15, so 12 -> 11 and the high/low swap.
    expect(flipped[0]).toEqual({ open: 13, high: 15 + 8 - 8, low: 15 + 8 - 12, close: 12 })
  })
})

describe('ghost feed', () => {
  it('follows TV\'s candle formula', () => {
    const seq = [0.25, 0.5, 0.5, 0.75]
    const rand = () => seq.shift()!
    // centre = 100 * 0.5 * 0.5 = 25; range = 100 * (1 + 0 * 0.5) = 100; low = -25
    expect(ghostBar(100, 50, rand)).toEqual({ low: -25, high: 75, open: 25, close: 50 })
  })
  it('makes one candle per bar, leaving out each segment\'s last bar, and is repeatable', () => {
    const path = [{ index: 0, value: 100 }, { index: 3, value: 130 }, { index: 5, value: 130 }]
    const candles = ghostCandles(path, 2, 50, 7)
    expect(candles.map((c) => c.index)).toEqual([0, 1, 2, 4])
    expect(ghostCandles(path, 2, 50, 7)).toEqual(candles)
    // The line is 10 per bar; candles stay within the generator's reach of it.
    expect(Math.abs((candles[1].bar.low + candles[1].bar.high) / 2 - 110)).toBeLessThan(4)
  })
})
