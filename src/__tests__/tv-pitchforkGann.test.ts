import { describe, expect, it } from 'vitest'
import { pitchforkGeometry } from '../extension/overlay/tv/pitchforkGann/pitchfork'
import { gannFanEnd, gannFanLabel } from '../extension/overlay/tv/pitchforkGann/gannFan'
import { arcRuns, fanLineEnd, fixedBoxEnd } from '../extension/overlay/tv/pitchforkGann/gannSquare'
import { extendedLine, resolveLevels } from '../extension/overlay/tv/pitchforkGann/shared'

const p0 = { x: 0, y: 100 }
const p1 = { x: 40, y: 20 }
const p2 = { x: 60, y: 60 }

describe('pitchfork geometry', () => {
  it('original: median runs from the handle to the midpoint of 1-2, levels parallel to it', () => {
    const g = pitchforkGeometry('original', p0, p1, p2)
    expect(g.median).toEqual([p0, { x: 50, y: 40 }])
    const [a, b] = g.level(1, 1)
    expect(a).toEqual(p2)
    expect({ x: b.x - a.x, y: b.y - a.y }).toEqual({ x: 50, y: -60 })
    expect(g.level(1, -1)[0]).toEqual(p1)
  })
  it('schiff starts the median at the midpoint of 0-1; modified keeps point 0 x', () => {
    expect(pitchforkGeometry('schiff', p0, p1, p2).median[0]).toEqual({ x: 20, y: 60 })
    expect(pitchforkGeometry('modified', p0, p1, p2).median[0]).toEqual({ x: 0, y: 60 })
  })
  it('inside: center line through the midpoint parallel to base to point 2', () => {
    const g = pitchforkGeometry('inside', p0, p1, p2)
    expect(g.median[0]).toEqual({ x: 50, y: 40 })
    expect(g.segments).toContainEqual([{ x: 20, y: 60 }, p2])
    expect(g.median[1]).toEqual({ x: 50 + 40, y: 40 + 0 })
  })
  it('pitchfan: every level ray starts at point 0', () => {
    const g = pitchforkGeometry('fan', p0, p1, p2)
    expect(g.level(0.5, 1)).toEqual([p0, { x: 55, y: 50 }])
    expect(g.level(0.5, -1)[0]).toEqual(p0)
  })
})

describe('gann fan', () => {
  it('leaves through the far y edge below 1 and the far x edge above it', () => {
    const o = { x: 0, y: 0 }
    const c = { x: 80, y: 40 }
    expect(gannFanEnd(o, c, 0.5)).toEqual({ x: 40, y: 40 })
    expect(gannFanEnd(o, c, 2)).toEqual({ x: 80, y: 20 })
  })
  it('labels ratios as TV does', () => {
    expect([1 / 8, 1 / 3, 1, 4].map(gannFanLabel)).toEqual(['1/8', '1/3', '1/1', '4/1'])
  })
})

describe('gann square', () => {
  it('fixed box is a pixel square five times the anchor distance', () => {
    expect(fixedBoxEnd({ x: 0, y: 0 }, { x: -3, y: 4 })).toEqual({ x: -25, y: 25 })
  })
  it('fan line ratios split the box', () => {
    expect(fanLineEnd({ x: 0, y: 0 }, { x: 100, y: 50 }, 2, 1)).toEqual({ x: 100, y: 25 })
    expect(fanLineEnd({ x: 0, y: 0 }, { x: 100, y: 50 }, 1, 2)).toEqual({ x: 50, y: 50 })
  })
  it('arcs are circles in a square box and are cut at the box edge', () => {
    const [run] = arcRuns({ x: 0, y: 0 }, { x: 100, y: 100 }, 1, 0)
    expect(run[0]).toEqual({ x: 20, y: 0 })
    for (const p of run) expect(Math.hypot(p.x, p.y)).toBeCloseTo(20, 6)
    // 5:1 has radius 102 > box, so only the part inside survives.
    const runs = arcRuns({ x: 0, y: 0 }, { x: 100, y: 100 }, 5, 1)
    for (const p of runs.flat()) expect(p.x).toBeLessThanOrEqual(100 + 1e-6)
  })
})

describe('shared', () => {
  it('extendedLine runs past the pane in the asked direction only', () => {
    const [a, b] = extendedLine({ x: 10, y: 10 }, { x: 20, y: 10 }, false, true, { width: 100, height: 100 })
    expect(a).toEqual({ x: 10, y: 10 })
    expect(b.x).toBeGreaterThan(100)
    expect(b.y).toBe(10)
  })
  it('resolveLevels drops disabled levels and sorts', () => {
    const l = resolveLevels([{ value: 2, enabled: true, color: 'a' }, { value: 1, enabled: true, color: 'b' }, { value: 3, enabled: false }], [])
    expect(l.map((x) => x.value)).toEqual([1, 2])
  })
})
