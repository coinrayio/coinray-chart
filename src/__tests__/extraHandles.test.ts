import { describe, it, expect } from 'vitest'
import { boxHandles } from '../extension/overlay/extraHandles'
import type { Overlay } from '../component/Overlay'
import type Coordinate from '../common/Coordinate'

// Pixels map straight to points, so a handle's move reads off directly.
const toPoint = (c: Coordinate): { timestamp: number, dataIndex: number, value: number } => ({ timestamp: c.x, dataIndex: c.x, value: c.y })
const box = (): Overlay => ({ points: [toPoint({ x: 0, y: 0 }), toPoint({ x: 100, y: 50 })] }) as unknown as Overlay

describe('box handles', () => {
  const hooks = boxHandles(true)
  const coordinates = [{ x: 0, y: 0 }, { x: 100, y: 50 }]

  it('shows the other two corners and four square edge handles', () => {
    const handles = hooks.createExtraHandles!({ overlay: box(), coordinates })
    expect(handles).toEqual([
      { x: 0, y: 50 }, { x: 100, y: 0 },
      { x: 50, y: 0, square: true }, { x: 100, y: 25, square: true },
      { x: 50, y: 50, square: true }, { x: 0, y: 25, square: true }
    ])
    expect(boxHandles(false).createExtraHandles!({ overlay: box(), coordinates })).toHaveLength(2)
  })

  it('a corner moves one point\'s time and the other\'s price', () => {
    const o = box()
    hooks.moveExtraHandle!({ overlay: o, index: 0, coordinate: { x: -10, y: 70 }, coordinates, toPoint })
    expect(o.points.map(p => [p.dataIndex, p.value])).toEqual([[-10, 0], [100, 70]])
  })

  it('an edge moves only its own side', () => {
    const o = box()
    hooks.moveExtraHandle!({ overlay: o, index: 3, coordinate: { x: 130, y: 999 }, coordinates, toPoint })
    expect(o.points.map(p => [p.dataIndex, p.value])).toEqual([[0, 0], [130, 50]])
  })

  it('shows TV\'s resize arrows: diagonals on corners, straight on edges', () => {
    const cursor = (index: number): string | undefined => hooks.handleCursor!({ overlay: box(), coordinates, index })
    // Points 0, 1 are top-left and bottom-right; extras 0, 1 bottom-left and top-right.
    expect([0, 1, 2, 3].map(cursor)).toEqual(['nwse-resize', 'nwse-resize', 'nesw-resize', 'nesw-resize'])
    expect([4, 5, 6, 7].map(cursor)).toEqual(['ns-resize', 'ew-resize', 'ns-resize', 'ew-resize'])
  })
})
