import { describe, expect, it } from 'vitest'
import { curveCoordinates } from '../extension/overlay/curve'
import { arrowMarkerOutline } from '../extension/overlay/arrowMarker'

describe('curve', () => {
  it('runs from start, through the handle, to end', () => {
    const pts = curveCoordinates({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -40 })
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 })
    expect(pts).toContainEqual({ x: 50, y: -40 })
  })
  it('is straight when the handle sits on the chord', () => {
    for (const p of curveCoordinates({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 50 })) expect(p.y).toBeCloseTo(p.x, 9)
  })
})

describe('arrow marker', () => {
  it('ends on the tip, starts on the tail, and is symmetric about the shaft', () => {
    const outline = arrowMarkerOutline({ x: 0, y: 0 }, { x: 200, y: 0 })
    expect(outline[0]).toEqual({ x: 0, y: 0 })
    expect(outline).toContainEqual({ x: 200, y: 0 })
    const ys = outline.map((p) => p.y).filter((y) => y !== 0).sort((a, b) => a - b)
    expect(ys.map(Math.abs)).toEqual([...ys].reverse().map(Math.abs))
    // 200 px long: head is a quarter of it, 1.22× as wide.
    expect(Math.max(...outline.map((p) => Math.abs(p.y)))).toBeCloseTo(1.22 * 50 / 2, 9)
  })
  it('stretches a very short arrow back to 22 px from the tip', () => {
    const outline = arrowMarkerOutline({ x: 95, y: 0 }, { x: 100, y: 0 })
    expect(Math.min(...outline.map((p) => p.x))).toBeCloseTo(78, 9)
  })
})
