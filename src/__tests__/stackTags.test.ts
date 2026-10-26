import { describe, it, expect } from 'vitest'
import { stackTags, type TagBox } from '../view/OverlayYAxisView'

const finalY = (boxes: TagBox[]): Record<string, number> => {
  const shifts = stackTags(boxes)
  return Object.fromEntries(boxes.map(b => [b.key, b.y + (shifts.get(b.key) ?? 0)]))
}

describe('stackTags', () => {
  // The QA screenshot: a long's tags crowded just above the last price.
  // Pushed up off the fixed last-price tag, TP1 used to jump past Break even.
  it('keeps tags in price order when a fixed tag pushes them', () => {
    const boxes: TagBox[] = [
      { key: 'level', y: 100, height: 16, fixed: false },
      { key: 'breakEven', y: 112, height: 16, fixed: false },
      { key: 'tp1', y: 118, height: 16, fixed: false },
      { key: '__last_price__', y: 124, height: 16, fixed: true }
    ]
    const y = finalY(boxes)
    expect(y.__last_price__).toBe(124)
    expect(y.level).toBeLessThan(y.breakEven)
    expect(y.breakEven).toBeLessThan(y.tp1)
    expect(y.tp1).toBeLessThan(y.__last_price__)
    const order = ['level', 'breakEven', 'tp1', '__last_price__']
    for (let i = 1; i < order.length; i++) {
      expect(y[order[i]] - y[order[i - 1]]).toBeGreaterThanOrEqual(16)
    }
  })

  it('keeps order around a fixed tag in the middle of a cluster', () => {
    const boxes: TagBox[] = [
      { key: 'a', y: 200, height: 16, fixed: false },
      { key: 'b', y: 203, height: 16, fixed: false },
      { key: '__last_price__', y: 205, height: 16, fixed: true },
      { key: 'c', y: 206, height: 16, fixed: false },
      { key: 'd', y: 208, height: 16, fixed: false }
    ]
    const y = finalY(boxes)
    const order = ['a', 'b', '__last_price__', 'c', 'd']
    for (let i = 1; i < order.length; i++) {
      expect(y[order[i]] - y[order[i - 1]]).toBeGreaterThanOrEqual(16)
    }
  })

  it('leaves tags that do not touch alone', () => {
    expect(stackTags([
      { key: 'a', y: 0, height: 16, fixed: false },
      { key: 'b', y: 40, height: 16, fixed: false }
    ]).size).toBe(0)
  })
})
