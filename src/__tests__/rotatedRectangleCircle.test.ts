import { describe, it, expect } from 'vitest'
import { rotatedRectangle } from '../extension/overlay/tv/linesShapes/shapes'
import circle from '../extension/overlay/circle'
import type Coordinate from '../common/Coordinate'
import type Point from '../common/Point'

// Pixels map straight to points and back.
const toPoint = (c: Coordinate): Partial<Point> => ({ timestamp: c.x, dataIndex: c.x, value: c.y })
const toCoordinate = (p: Partial<Point>): Coordinate => ({ x: p.dataIndex as number, y: p.value as number })
const xy = (o: { points: Array<Partial<Point>> }): number[][] => o.points.map(p => [p.dataIndex as number, p.value as number])

describe('rotated rectangle handles (TV)', () => {
  const tool = rotatedRectangle()
  // Axis flat at y 100 from x 0 to 100; half-width 30 (point 2 below the axis).
  const coordinates = [{ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 130 }]
  const drag = (index: number, to: Coordinate): { points: Array<Partial<Point>> } => {
    const o = { points: coordinates.map(toPoint) }
    tool.moveExtraHandle!({ overlay: o as never, index, coordinate: to, coordinates, toPoint, toCoordinate, pressCoordinates: coordinates })
    return o
  }
  const halfWidth = (o: { points: Array<Partial<Point>> }): number => {
    const [a, b, c] = o.points.map(toCoordinate)
    return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y)
  }

  it('shows both axis ends and all four corners, no default dots', () => {
    expect(tool.needDefaultPointFigure).toEqual([])
    const handles = tool.createExtraHandles!({ overlay: {} as never, coordinates })
    expect(handles).toEqual([
      { x: 0, y: 100 }, { x: 100, y: 100 },
      { x: 0, y: 130 }, { x: 100, y: 130 }, { x: 100, y: 70 }, { x: 0, y: 70 }
    ])
  })

  it('an axis end turns the rectangle and keeps its width', () => {
    const o = drag(1, { x: 80, y: 40 })
    expect(xy(o).slice(0, 2)).toEqual([[0, 100], [80, 40]])
    expect(halfWidth(o)).toBeCloseTo(30, 9)
    // Point 2 sits straight under the moved end, on the same side as before.
    expect(o.points[2].dataIndex).toBe(80)
  })

  it('the other axis end does the same', () => {
    const o = drag(0, { x: 20, y: 160 })
    expect(xy(o).slice(0, 2)).toEqual([[20, 160], [100, 100]])
    expect(halfWidth(o)).toBeCloseTo(30, 9)
  })

  it('only the dragged axis end is magnetised; the width point follows it exactly', () => {
    // A magnet that pulls every price to a multiple of 15 unless asked for a free one.
    const magnet = (c: Coordinate, free?: boolean): Partial<Point> => ({ timestamp: c.x, dataIndex: c.x, value: free === true ? c.y : Math.round(c.y / 15) * 15 })
    const o = { points: coordinates.map(toPoint) }
    tool.moveExtraHandle!({ overlay: o as never, index: 1, coordinate: { x: 100, y: 52 }, coordinates, toPoint: magnet, toCoordinate, pressCoordinates: coordinates })
    expect(o.points[1].value).toBe(45)
    expect(halfWidth(o)).toBeCloseTo(30, 9)
  })

  it('keeps the width the press found, not the rounded pixels of the step before', () => {
    // A step later: point 2 rounded a pixel closer to the axis than it was at the press.
    const o = { points: coordinates.map(toPoint) }
    const now = [coordinates[0], coordinates[1], { x: 100, y: 129 }]
    tool.moveExtraHandle!({ overlay: o as never, index: 1, coordinate: { x: 100, y: 60 }, coordinates: now, toPoint, toCoordinate, pressCoordinates: coordinates })
    expect(halfWidth(o)).toBeCloseTo(30, 9)
  })

  it('a corner on either side sets the width and leaves the axis alone', () => {
    const below = drag(2, { x: 10, y: 150 })
    expect(xy(below).slice(0, 2)).toEqual([[0, 100], [100, 100]])
    expect(halfWidth(below)).toBe(50)
    const above = drag(5, { x: 30, y: 80 })
    expect(xy(above).slice(0, 2)).toEqual([[0, 100], [100, 100]])
    expect(halfWidth(above)).toBe(20)
  })
})

describe('circle handles (TV)', () => {
  const tool = circle()

  it('the centre is a handle that moves the whole circle; the edge keeps its own dot', () => {
    expect(tool.needDefaultPointFigure).toEqual([1])
    const handles = tool.createExtraHandles!({ overlay: {} as never, coordinates: [{ x: 50, y: 50 }, { x: 80, y: 50 }] })
    expect(handles).toEqual([{ x: 50, y: 50, movesDrawing: true }])
  })
})
