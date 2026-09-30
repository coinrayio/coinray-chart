import { describe, it, expect } from 'vitest'
import { anchoredHooks, anchorPixel, balloonGeometry, roundedBubble } from '../extension/overlay/tv/annotations/shared'

const bounding = { width: 800, height: 400, left: 0, right: 0, top: 0, bottom: 0 }

describe('roundedBubble', () => {
  it('stays inside its rectangle and splices the tail in', () => {
    const tail = [{ x: 60, y: 50 }, { x: 55, y: 60 }, { x: 50, y: 50 }]
    const out = roundedBubble(10, 10, 100, 40, 15, tail)
    expect(out.length).toBe(4 * 7 + 3)
    for (const p of out.filter(q => !tail.includes(q))) {
      expect(p.x).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(p.x).toBeLessThanOrEqual(110 + 1e-9)
      expect(p.y).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(p.y).toBeLessThanOrEqual(50 + 1e-9)
    }
  })
})

describe('balloonGeometry', () => {
  it('puts the tail tip on the anchor', () => {
    const g = balloonGeometry({ x: 200, y: 300 }, 80, 14)
    // TV: height = size + 2 * round(size / 1.3), width = text + 30, tail 9 high.
    expect(g.height).toBe(14 + 2 * 11)
    expect(g.width).toBe(110)
    expect(g.left).toBe(165)
    const tip = g.outline.reduce((a, b) => (b.y > a.y ? b : a))
    expect(tip.x).toBeCloseTo(200)
    expect(tip.y).toBeCloseTo(300)
  })
})

describe('anchored positioning', () => {
  it('uses fractions of the pane, else the point', () => {
    expect(anchorPixel({ anchorX: 0.25, anchorY: 0.5 }, [{ x: 1, y: 2 }], bounding)).toEqual({ x: 200, y: 200 })
    expect(anchorPixel({}, [{ x: 1, y: 2 }], bounding)).toEqual({ x: 1, y: 2 })
  })

  it('derives fractions on completion and follows a drag without jumping', () => {
    const chart = {
      getSize: () => bounding,
      convertToPixel: () => ({ x: 400, y: 100 })
    }
    const overlay = { id: 'a', paneId: 'candle_pane', points: [{}], extendData: { text: 'hi' } }
    const call = (hook: unknown, extra: object = {}): void => (hook as (p: unknown) => void)({ overlay, chart, ...extra })
    call(anchoredHooks.completeDrawing)
    expect(overlay.extendData).toEqual({ text: 'hi', anchorX: 0.5, anchorY: 0.25 })
    // Grab 10px right of the anchor, drag 80px right and 40px down.
    call(anchoredHooks.onPressedMoveStart, { x: 410, y: 100 })
    call(anchoredHooks.onPressedMoving, { x: 490, y: 140 })
    expect(overlay.extendData).toEqual({ text: 'hi', anchorX: 0.6, anchorY: 0.35 })
    call(anchoredHooks.onPressedMoving, { x: 5000, y: -50 })
    expect(overlay.extendData).toMatchObject({ anchorX: 1, anchorY: 0 })
  })
})
