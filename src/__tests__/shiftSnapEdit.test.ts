import { describe, it, expect } from 'vitest'
import OverlayView, { shiftLocksAxis } from '../view/OverlayView'
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

  // The Shift measure starts with Shift held. Snapping it to 45° made its box
  // a square beside the cursor; tradingview.com's follows the cursor.
  it('leaves the measure alone', () => {
    expect(snapper()(line('measure'), { x: 30, y: 10 }, 1)).toEqual({ x: 30, y: 10 })
    expect(snapper()(line('measure'), { x: 52, y: -40 }, 0)).toEqual({ x: 52, y: -40 })
  })
})

describe('Shift locks an axis where there is no angle to snap', () => {
  it('locks every handle of the position tools', () => {
    expect(shiftLocksAxis({ name: 'longPosition' }, 0)).toBe(true)
    expect(shiftLocksAxis({ name: 'shortPosition' }, 3)).toBe(true)
  })

  it('locks a channel\'s width point, but not its base line', () => {
    for (const name of ['parallelChannel', 'parallelStraightLine', 'priceChannelLine', 'fibonacciLine', 'flatBottom', 'disjointAngle']) {
      expect(shiftLocksAxis({ name }, 2)).toBe(true)
      expect(shiftLocksAxis({ name }, 1)).toBe(false)
    }
    expect(shiftLocksAxis({ name: 'triangle' }, 2)).toBe(false)
  })

  it('leaves a locked point where the cursor is instead of snapping it around its neighbour', () => {
    const channel: Partial<Overlay> = { name: 'parallelChannel', points: [{ dataIndex: 0, value: 0 }, { dataIndex: 100, value: 10 }, { dataIndex: 50, value: 40 }] }
    expect(snapper()(channel, { x: 60, y: 47 }, 2)).toEqual({ x: 60, y: 47 })
  })
})

describe('A level Shift snap takes its anchor\'s exact price', () => {
  // The axis rounds a price to a whole pixel, so converting the snapped pixel
  // back lands a fraction of a pixel off the anchor's price.
  it('copies the anchor\'s price when the snap is flat, and its time when vertical', () => {
    const view = Object.create(OverlayView.prototype) as Record<string, unknown>
    view._pointToCoordinate = (p?: { dataIndex?: number, value?: number }) =>
      p?.dataIndex === undefined || p.value === undefined ? null : { x: Math.round(p.dataIndex), y: Math.round(p.value) }
    const align = (view._alignToAnchor as (o: Partial<Overlay>, i: number, c: Coordinate, p: Record<string, number>) => void).bind(view)
    const o: Partial<Overlay> = { name: 'segment', points: [{ dataIndex: 0.4, timestamp: 4, value: 10.3 }, { dataIndex: 100, value: 20 }] }
    const flat = { dataIndex: 100, value: 10 }
    align(o, 1, { x: 100, y: 10 }, flat)
    expect(flat.value).toBe(10.3)
    const vertical = { dataIndex: 0, timestamp: 0, value: 50 }
    align(o, 1, { x: 6e-17, y: 50 }, vertical)
    expect(vertical).toEqual({ dataIndex: 0.4, timestamp: 4, value: 50 })
  })
})
