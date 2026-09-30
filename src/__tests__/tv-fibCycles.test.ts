import { describe, expect, it } from 'vitest'
import { timeLevelIndex, FIB_TIME_ZONE_LEVELS, TREND_BASED_FIB_TIME_LEVELS } from '../extension/overlay/tv/fibCycles/fibTime'
import { angleOf, wedgeSpan } from '../extension/overlay/tv/fibCycles/fanArcs'
import { cycleDash, sineY, sineSamples } from '../extension/overlay/tv/fibCycles/cycles'
import { arcPoints, bandPoints, cycleIndices } from '../extension/overlay/tv/fibCycles/shared'

describe('fib time levels', () => {
  it('measure in bars from the origin and round to whole bars', () => {
    expect(timeLevelIndex(100, 10, 0)).toBe(100)
    expect(timeLevelIndex(100, 10, 1.618)).toBe(116)
    expect(timeLevelIndex(100, -10, 2)).toBe(80)
    expect(timeLevelIndex(50, 7, 0.382)).toBe(53)
  })
  it('ship TV defaults', () => {
    expect(FIB_TIME_ZONE_LEVELS.map((l) => l.value)).toEqual([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89])
    expect(TREND_BASED_FIB_TIME_LEVELS.filter((l) => !l.enabled).map((l) => l.value)).toEqual([0.5])
  })
})

describe('cycleIndices', () => {
  it('walks forward from the origin, skipping what is off screen', () => {
    expect(cycleIndices(10, 5, 0, 30)).toEqual([10, 15, 20, 25, 30])
    expect(cycleIndices(0, 5, 12, 26)).toEqual([15, 20, 25])
  })
  it('walks backward for a negative step and never before the origin', () => {
    expect(cycleIndices(20, -5, 0, 40)).toEqual([20, 15, 10, 5, 0])
    expect(cycleIndices(20, 5, 0, 12)).toEqual([])
    expect(cycleIndices(5, 0, 0, 10)).toEqual([])
  })
})

describe('wedge', () => {
  const c = { x: 0, y: 0 }
  it('sweeps the shorter way between the two rays', () => {
    const { from, to } = wedgeSpan(c, { x: 10, y: 0 }, { x: 0, y: 10 })
    expect(from).toBeCloseTo(0)
    expect(to).toBeCloseTo(Math.PI / 2)
  })
  it('wraps through 0 when that is shorter', () => {
    const { from, to } = wedgeSpan(c, { x: 10, y: -1 }, { x: 10, y: 1 })
    expect(to - from).toBeLessThan(0.3)
    expect(to).toBeGreaterThan(2 * Math.PI)
  })
  it('angles are clockwise on screen, 0..2π', () => {
    expect(angleOf(c, { x: 0, y: -1 })).toBeCloseTo(1.5 * Math.PI)
  })
})

describe('arcs', () => {
  it('sample the circle and stay on it', () => {
    for (const p of arcPoints(5, 5, 10, 0, Math.PI)) expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(10)
    const pts = arcPoints(0, 0, 4, 0, Math.PI)
    expect(pts[0].x).toBeCloseTo(4)
    expect(pts[pts.length - 1].x).toBeCloseTo(-4)
    expect(pts.every((p) => p.y >= -1e-9)).toBe(true)
  })
  it('band goes out along the outer radius and back along the inner', () => {
    const band = bandPoints(0, 0, 2, 4, 0, Math.PI)
    expect(Math.hypot(band[0].x, band[0].y)).toBeCloseTo(4)
    expect(Math.hypot(band[band.length - 1].x, band[band.length - 1].y)).toBeCloseTo(2)
  })
})

describe('sine', () => {
  it('runs from p0 (trough) to p1 (crest) over one half period', () => {
    expect(sineY(100, -40, 50, 0)).toBeCloseTo(100)
    expect(sineY(100, -40, 50, 50)).toBeCloseTo(60)
    expect(sineY(100, -40, 50, 100)).toBeCloseTo(100)
  })
  it('samples at 30 per half period, at least 1px apart', () => {
    const s = sineSamples(0, 90, 60)
    expect(s[1] - s[0]).toBeCloseTo(2)
    expect(sineSamples(0, 10, 6)[1]).toBe(1)
  })
})

describe('cycle line dashes', () => {
  it('scale with the width like TV: dotted is w on, 2w off; dashed 5w on, 6w off', () => {
    expect(cycleDash({ lineWidth: 2, lineDashedValue: [1, 3] })).toEqual([2, 4])
    expect(cycleDash({ lineWidth: 4, lineDashedValue: [4, 4] })).toEqual([20, 24])
    expect(cycleDash({})).toEqual([10, 12])
  })
})
