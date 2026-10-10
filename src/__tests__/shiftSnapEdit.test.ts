import { describe, it, expect } from 'vitest'
import OverlayView from '../view/OverlayView'
import type { Overlay } from '../component/Overlay'
import type Coordinate from '../common/Coordinate'

// `_shiftSnapPoint` only needs points mapped to screen; map dataIndex/value
// straight to x/y so the expected geometry reads off directly.
function snapper (): (o: Partial<Overlay>, c: Coordinate, index: number) => Coordinate {
  const view = Object.create(OverlayView.prototype) as Record<string, unknown>
  view._pointToCoordinate = (p?: { dataIndex?: number, value?: number }) =>
    p?.dataIndex === undefined || p.value === undefined ? null : { x: p.dataIndex, y: p.value }
  return (view._shiftSnapPoint as (o: Partial<Overlay>, c: Coordinate, i: number) => Coordinate).bind(view)
}

const line = (name: string): Partial<Overlay> => ({
  name,
  points: [{ dataIndex: 0, value: 0 }, { dataIndex: 100, value: 10 }]
})

describe('Shift snap while editing a handle', () => {
  it('snaps the dragged end of a line to the nearest 45° around the other end', () => {
    const snap = snapper()
    // Dragging point 1 near horizontal from point 0 → flat.
    expect(snap(line('segment'), { x: 100, y: 12 }, 1)).toEqual({ x: 100, y: 0 })
    // Dragging point 0 around point 1 → a 45° diagonal.
    const p = snap(line('segment'), { x: 52, y: -40 }, 0)
    expect(p.x - 100).toBeCloseTo(p.y - 10)
  })

  it('squares a rect around the opposite corner', () => {
    expect(snapper()(line('rect'), { x: 30, y: 10 }, 1)).toEqual({ x: 30, y: 30 })
  })

  it('leaves a circle alone', () => {
    expect(snapper()(line('circle'), { x: 30, y: 10 }, 1)).toEqual({ x: 30, y: 10 })
  })
})
