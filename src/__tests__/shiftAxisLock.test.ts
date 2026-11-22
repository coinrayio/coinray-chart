import { describe, it, expect } from 'vitest'
import OverlayImp from '../component/Overlay'
import type ChartStore from '../Store'
import type Point from '../common/Point'
import parallelChannel from '../extension/overlay/parallelChannel'
import type Coordinate from '../common/Coordinate'

// Points map straight back to pixels.
const toCoordinate = (p: Partial<Point>): Coordinate => ({ x: p.dataIndex as number, y: p.value as number })

// Index and timestamp the same number, so a translation reads off directly.
const store = {
  timestampToFloatIndex: (t: number) => t,
  floatIndexToTimestamp: (i: number) => i
} as unknown as ChartStore

function grabbed (points: Array<Partial<Point>>, at: Partial<Point>): OverlayImp {
  const Ctor = OverlayImp.extend({ name: 'probe', totalStep: 3 })
  const o = new Ctor()
  o.points = points.map(p => ({ ...p }))
  o.startPressedMove(at, store)
  return o
}

const pts = (o: OverlayImp): number[][] => o.points.map(p => [p.dataIndex as number, p.value as number])

describe('Shift drag keeps the locked axis where the press left it', () => {
  // The magnet re-snaps the price at every candle, so a sideways Shift drag
  // arrives here with a price that is not the grabbed one.
  const line = [{ timestamp: 10, dataIndex: 10, value: 100 }, { timestamp: 20, dataIndex: 20, value: 110 }]

  it('a body drag moved sideways changes no price', () => {
    const o = grabbed(line, { timestamp: 15, dataIndex: 15, value: 105 })
    o.eventPressedOtherMove({ timestamp: 25, dataIndex: 25, value: 107.5 }, store, 'price')
    expect(pts(o)).toEqual([[20, 100], [30, 110]])
  })

  it('a body drag moved up or down changes no time', () => {
    const o = grabbed(line, { timestamp: 15, dataIndex: 15, value: 105 })
    o.eventPressedOtherMove({ timestamp: 16, dataIndex: 16, value: 125 }, store, 'time')
    expect(pts(o)).toEqual([[10, 120], [20, 130]])
  })

  it('without Shift both axes still move', () => {
    const o = grabbed(line, { timestamp: 15, dataIndex: 15, value: 105 })
    o.eventPressedOtherMove({ timestamp: 25, dataIndex: 25, value: 107.5 }, store)
    expect(pts(o)).toEqual([[20, 102.5], [30, 112.5]])
  })

  it('a handle keeps its own price or time from the press', () => {
    const o = grabbed(line, { timestamp: 10, dataIndex: 10, value: 101 })
    o.eventPressedPointMove({ timestamp: 14, dataIndex: 14, value: 103 }, 0, 'price')
    expect(pts(o)[0]).toEqual([14, 100])
    o.eventPressedPointMove({ timestamp: 12, dataIndex: 12, value: 95 }, 0, 'time')
    expect(pts(o)[0]).toEqual([10, 95])
  })
})

describe('parallel channel ends with Shift', () => {
  const tool = parallelChannel()
  const toPoint = (c: Coordinate): Partial<Point> => ({ timestamp: c.x, dataIndex: c.x, value: c.y })
  // Base line flat at y 0 from x 0 to 100, parallel line 40 below.
  const coordinates = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 40 }]
  const channel = (): { points: Array<Partial<Point>> } => ({ points: coordinates.map(toPoint) })

  it('snaps the channel\'s angle around its other end and keeps the width', () => {
    const o = channel()
    // The far line's right end, dragged a little off flat.
    tool.moveExtraHandle!({ overlay: o as never, index: 3, coordinate: { x: 120, y: 46 }, coordinates, shiftKey: true, toPoint, toCoordinate, pressCoordinates: coordinates })
    expect(o.points[1]).toMatchObject({ dataIndex: 120, value: 0 })
    expect(o.points[2].value).toBe(40)
  })

  it('follows the cursor without Shift', () => {
    const o = channel()
    tool.moveExtraHandle!({ overlay: o as never, index: 3, coordinate: { x: 120, y: 46 }, coordinates, toPoint, toCoordinate, pressCoordinates: coordinates })
    expect(o.points[1]).toMatchObject({ dataIndex: 120, value: 6 })
  })
})

describe('parallel channel midpoint handles', () => {
  const tool = parallelChannel()
  const toPoint = (c: Coordinate): Partial<Point> => ({ timestamp: c.x, dataIndex: c.x, value: c.y })
  // Width point placed off-centre, at x 80.
  const coordinates = [{ x: 0, y: 0 }, { x: 100, y: 20 }, { x: 80, y: 56 }]

  it('point 2 has no dot of its own; the parallel line shows one in its middle', () => {
    expect(tool.needDefaultPointFigure).toEqual([])
    const handles = tool.createExtraHandles!({ overlay: {} as never, coordinates })
    expect(handles[5]).toEqual({ x: 50, y: 50, hideWhileDragged: true })
  })

  const drag = (index: number, to: Coordinate, shiftKey?: boolean): { points: number[][], handle: Coordinate } => {
    const o = { points: coordinates.map(toPoint) }
    tool.moveExtraHandle!({ overlay: o as never, index, coordinate: to, coordinates, shiftKey, toPoint, toCoordinate, pressCoordinates: coordinates })
    const after = o.points.map(p => ({ x: p.dataIndex as number, y: p.value as number }))
    return { points: o.points.map(p => [p.dataIndex as number, p.value as number]), handle: tool.createExtraHandles!({ overlay: {} as never, coordinates: after })[index] }
  }

  it('the parallel midpoint, dragged sideways, moves its line through the cursor and its dot stays in the middle', () => {
    const { points, handle } = drag(5, { x: 90, y: 50 })
    expect(points).toEqual([[0, 0], [100, 20], [80, 48]])
    // Line now at y 50 at x 90 (under the cursor); its dot back at x 50.
    expect(handle).toMatchObject({ x: 50, y: 42 })
  })

  it('the base midpoint moves only the base line, through the cursor', () => {
    const { points, handle } = drag(4, { x: 60, y: 30 })
    expect(points).toEqual([[0, 18], [100, 38], [80, 56]])
    expect(handle).toMatchObject({ x: 50, y: 28 })
  })

  it('a base end moves that end of both lines and keeps the width', () => {
    const { points } = drag(0, { x: 10, y: -10 })
    // Base now (10,-10) → (100,20); at x 80 it is at 13.33, so point 2 sits 40 below.
    expect(points[0]).toEqual([10, -10])
    expect(points[2][1]).toBeCloseTo(53.33, 2)
  })

  it('the magnet never tilts the line under a midpoint drag', () => {
    // A magnet that pulls every price to a multiple of 15 unless asked for an exact one.
    const magnet = (c: Coordinate): Partial<Point> => ({ timestamp: c.x, dataIndex: c.x, value: Math.round(c.y / 15) * 15 })
    const o = { points: coordinates.map(c => toPoint(c)) }
    tool.moveExtraHandle!({ overlay: o as never, index: 4, coordinate: { x: 50, y: 17 }, coordinates, toPoint: magnet, toCoordinate, pressCoordinates: coordinates })
    expect((o.points[1].value as number) - (o.points[0].value as number)).toBe(20)
  })

  it('a corner drag snaps only the dragged dot to the magnet', () => {
    const magnet = (c: Coordinate): Partial<Point> => ({ timestamp: c.x, dataIndex: c.x, value: Math.round(c.y / 15) * 15 })
    const o = { points: coordinates.map(c => toPoint(c)) }
    // The parallel line's left end, dropped near 45.
    tool.moveExtraHandle!({ overlay: o as never, index: 2, coordinate: { x: 0, y: 47 }, coordinates, toPoint: magnet, toCoordinate, pressCoordinates: coordinates })
    // It sits on 45; the base end under it moves by the same amount, unsnapped;
    // the right ends stay; the width stays 40.
    expect(o.points.map(p => [p.dataIndex, p.value])).toEqual([[0, 5], [100, 20], [80, 57]])
  })
})
