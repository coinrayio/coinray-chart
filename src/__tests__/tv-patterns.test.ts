import { describe, expect, it } from 'vitest'
import { lineCrossesSegment, ratio } from '../extension/overlay/tv/patterns/patternShared'
import { necklineEnds } from '../extension/overlay/tv/patterns/headAndShoulders'
import { triangleWedge } from '../extension/overlay/tv/patterns/trianglePattern'
import { cypherConnectors } from '../extension/overlay/tv/patterns/cypher'
import { ELLIOTT_DEGREES, elliottGlyph, resolveDegree } from '../extension/overlay/tv/patterns/elliottDegree'
import { labelsBelow } from '../extension/overlay/tv/patterns/elliott'

describe('lineCrossesSegment', () => {
  it('returns the unbounded parameter along the line when the crossing is on the segment', () => {
    expect(lineCrossesSegment({ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 0, y: -5 }, { x: 0, y: 5 })).toBeCloseTo(-1, 9)
  })
  it('is null when the crossing falls off the segment, or the lines are parallel', () => {
    expect(lineCrossesSegment({ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 5 }, { x: 0, y: 9 })).toBeNull()
    expect(lineCrossesSegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull()
  })
})

describe('head and shoulders neckline', () => {
  const c = [
    { x: 0, y: 100 }, { x: 20, y: 40 }, { x: 40, y: 80 }, { x: 60, y: 10 },
    { x: 80, y: 80 }, { x: 100, y: 40 }, { x: 120, y: 100 }
  ]
  it('meets the outer legs on both sides', () => {
    const { left, right } = necklineEnds(c)
    expect(left?.y).toBeCloseTo(80, 9)
    expect(right?.y).toBeCloseTo(80, 9)
    expect(left?.x).toBeLessThan(20)
    expect(right?.x).toBeGreaterThan(100)
  })
  it('has no ends before the troughs exist', () => {
    expect(necklineEnds(c.slice(0, 4))).toEqual({ left: null, right: null })
  })
})

describe('triangle pattern wedge', () => {
  it('closes at the apex of a converging pair of edges', () => {
    // Edges 0-2 and 1-3 converge to the right at (300, 100).
    const wedge = triangleWedge([{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 100, y: 33.333333333333336 }, { x: 100, y: 166.66666666666666 }])
    expect(wedge?.[2].x).toBeCloseTo(300, 6)
    expect(wedge?.[2].y).toBeCloseTo(100, 6)
    expect(wedge?.[0].x).toBe(0)
  })
  it('is null for parallel edges', () => {
    expect(triangleWedge([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 0 }, { x: 100, y: 50 }])).toBeNull()
  })
})

describe('cypher ratios', () => {
  it('uses XC/XA for the A-C connector and CD/XC for X-D', () => {
    // X=0, A=100, B=50, C=161.8, D=100
    const byPair = Object.fromEntries(cypherConnectors([0, 100, 50, 161.8, 100]).map(([a, b, r]) => [`${a}-${b}`, r]))
    expect(byPair['0-2']).toBe(0.5)
    expect(byPair['1-3']).toBe(1.618)
    expect(byPair['2-4']).toBe(0.553)
    expect(byPair['0-4']).toBe(0.382)
  })
  it('only reports connectors whose points exist', () => {
    expect(cypherConnectors([0, 100])).toEqual([])
    expect(cypherConnectors([0, 100, 50])).toHaveLength(1)
  })
})

describe('three drives ratio', () => {
  it('is the drive over the pullback, rounded', () => {
    expect(ratio(10, 20, 15, 2)).toBe(0.5)
  })
})

describe('Elliott degree', () => {
  const sets = [['0', 'A'], ['0', 'a'], ['0', 'A'], ['0', 'a'], ['0', 'A']]
  it('has the 15 TV degrees, defaulting to Intermediate', () => {
    expect(ELLIOTT_DEGREES).toHaveLength(15)
    expect(resolveDegree(undefined)).toBe(7)
    expect(resolveDegree('Minor')).toBe(8)
    expect(resolveDegree(99)).toBe(7)
  })
  it('cycles circled, bracketed, plain and steps the label set every 3 degrees', () => {
    // Intermediate (7): t=7 -> set 2 (upper), bracketed.
    expect(elliottGlyph(sets, 7, 1)).toMatchObject({ text: '(A)', circled: false, font: 18, bold: false })
    // Minuscule (14): t=0 -> set 0, plain, small bold.
    expect(elliottGlyph(sets, 14, 1)).toMatchObject({ text: 'A', circled: false, font: 11, bold: true })
    // Micro (12): t=2 -> set 0, circled.
    expect(elliottGlyph(sets, 12, 1)).toMatchObject({ text: 'A', circled: true })
    // Minute (9): t=5 -> set 1 (lower), circled.
    expect(elliottGlyph(sets, 9, 1)).toMatchObject({ text: 'a', circled: true, font: 16 })
    // Supermillennium (0): t=14 -> set 4, circled, biggest.
    expect(elliottGlyph(sets, 0, 1)).toMatchObject({ text: 'A', circled: true, font: 24, bold: true })
  })
})

describe('Elliott label sides', () => {
  it('puts point 2 below when the wave falls into it, and alternates', () => {
    const c = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 10 }, { x: 3, y: 0 }]
    expect(labelsBelow(c)).toEqual([true, false, true, false])
  })
  it('flips when the wave rises into point 2', () => {
    const c = [{ x: 0, y: 0 }, { x: 1, y: 10 }, { x: 2, y: 0 }]
    expect(labelsBelow(c)).toEqual([false, true, false])
  })
})
