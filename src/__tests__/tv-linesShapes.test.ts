import { describe, expect, it } from 'vitest'
import {
  angleArcCoordinates, arcCoordinates, doubleCurveCoordinates, doubleCurveHandles, ellipseCoordinates,
  rotatedRectangleCorners, trendAngle
} from '../extension/overlay/tv/linesShapes/geometry'

describe('ellipse', () => {
  it('spans the major axis and reaches the third point distance on the minor axis', () => {
    const pts = ellipseCoordinates({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: 20 })!
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(0, 6)
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(100, 6)
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeCloseTo(20, 6)
  })
  it('is a plain line while the third point is on the axis', () => {
    expect(ellipseCoordinates({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0.5 })).toBeNull()
  })
})

describe('arc', () => {
  it('runs chord end to chord end and peaks at the third point distance, on its side', () => {
    const up = arcCoordinates({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -30 })!
    expect(up[0].x).toBeCloseTo(100, 6)
    expect(up[up.length - 1].x).toBeCloseTo(0, 6)
    expect(up[0].y).toBeCloseTo(0, 6)
    expect(Math.min(...up.map((p) => p.y))).toBeCloseTo(-30, 6)
    expect(Math.max(...up.map((p) => p.y))).toBeCloseTo(0, 6)
    const down = arcCoordinates({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 30 })!
    expect(Math.max(...down.map((p) => p.y))).toBeCloseTo(30, 6)
  })
})

describe('rotated rectangle', () => {
  it('keeps right angles on a slanted axis', () => {
    const [p, q, r, s] = rotatedRectangleCorners({ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 40, y: 80 })!
    const dot = (a: { x: number, y: number }, b: { x: number, y: number }, c: { x: number, y: number }): number => (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)
    expect(dot(p, q, r)).toBeCloseTo(0, 6)
    expect(dot(q, r, s)).toBeCloseTo(0, 6)
    expect((p.x + r.x) / 2).toBeCloseTo(50, 6)
  })
})

describe('double curve', () => {
  it('starts an S: handles a third and two thirds along the chord, on opposite sides', () => {
    const [m1, m2] = doubleCurveHandles({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(m1.x).toBeCloseTo(33, 6)
    expect(m2.x).toBeCloseTo(67, 6)
    expect(m1.y * m2.y).toBeLessThan(0)
  })
  it('runs from start through both handles to end', () => {
    const start = { x: 0, y: 0 }
    const end = { x: 100, y: 0 }
    const [m1, m2] = doubleCurveHandles(start, end)
    const pts = doubleCurveCoordinates(start, end, m1, m2)
    expect(pts[0]).toEqual(start)
    expect(pts[pts.length - 1]).toEqual(end)
    expect(pts).toContainEqual(m1)
    expect(pts).toContainEqual(m2)
  })
})

describe('trend angle', () => {
  it('measures screen angle counter-clockwise, y up', () => {
    expect(trendAngle({ x: 0, y: 0 }, { x: 10, y: -10 })).toBeCloseTo(Math.PI / 4, 9)
    expect(trendAngle({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(-Math.PI / 4, 9)
  })
  it('draws the dotted arc from the +x axis to the line', () => {
    const arcPts = angleArcCoordinates({ x: 5, y: 5 }, Math.PI / 2)
    expect(arcPts[0].x).toBeCloseTo(55, 6)
    expect(arcPts[arcPts.length - 1].y).toBeCloseTo(-45, 6)
  })
})
