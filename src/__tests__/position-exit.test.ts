import { describe, expect, it } from 'vitest'
import { positionExit, positionFill } from '../extension/overlay/position'

const bar = (low: number, high: number): { low: number, high: number } => ({ low, high })

describe('positionExit', () => {
  it('stays open while no bar reaches the stop or the target', () => {
    expect(positionExit([bar(99, 101), bar(98, 103)], 0, 1, 'long', 95, 110)).toBeNull()
  })

  it('locks a long in at the target on the first bar that reaches it', () => {
    // Later bars fall through the stop; the result stays at the target.
    const bars = [bar(99, 101), bar(100, 111), bar(90, 100)]
    expect(positionExit(bars, 0, 2, 'long', 95, 110)).toEqual({ price: 110, hit: 'target' })
  })

  it('locks a long in at the stop on the first bar that reaches it', () => {
    const bars = [bar(99, 101), bar(94, 100), bar(100, 120)]
    expect(positionExit(bars, 0, 2, 'long', 95, 110)).toEqual({ price: 95, hit: 'stop' })
  })

  it('mirrors the levels for a short', () => {
    expect(positionExit([bar(99, 101), bar(89, 100)], 0, 1, 'short', 105, 90)).toEqual({ price: 90, hit: 'target' })
    expect(positionExit([bar(99, 101), bar(100, 106)], 0, 1, 'short', 105, 90)).toEqual({ price: 105, hit: 'stop' })
  })

  it('counts a bar that reaches both as the stop', () => {
    expect(positionExit([bar(99, 101), bar(90, 115)], 0, 1, 'long', 95, 110)).toEqual({ price: 95, hit: 'stop' })
  })

  it('ignores the entry bar and bars past the right edge', () => {
    const bars = [bar(80, 120), bar(99, 101), bar(80, 120)]
    expect(positionExit(bars, 0, 1, 'long', 95, 110)).toBeNull()
  })

  // ALTRADY-WEB-2A9: a point between bars has a fractional dataIndex, and
  // stepping from it read bars[1.4], which is undefined.
  it('snaps fractional indices to whole bars', () => {
    const bars = [bar(99, 101), bar(99, 101), bar(99, 111)]
    expect(positionExit(bars, 0.4, 2.7, 'long', 95, 110)).toEqual({ price: 110, hit: 'target' })
    expect(positionExit(bars, 1.4, 1.9, 'long', 95, 110)).toBeNull()
  })

  it('skips holes in the bar list', () => {
    const bars = [bar(99, 101), undefined, bar(99, 111)]
    expect(positionExit(bars, 0, 2, 'long', 95, 110)).toEqual({ price: 110, hit: 'target' })
  })
})

describe('positionFill', () => {
  it('stays pending while no bar reaches the entry', () => {
    // A long below the market: price never came down to 100.
    expect(positionFill([bar(105, 110), bar(103, 108)], 0, 1, 100)).toBeNull()
    // A short above the market: price never came up to 100.
    expect(positionFill([bar(90, 95), bar(92, 97)], 0, 1, 100)).toBeNull()
  })

  it('fills on the first bar from the entry bar on that reaches the entry', () => {
    expect(positionFill([bar(99, 101), bar(98, 103)], 0, 1, 100)).toBe(0)
    expect(positionFill([bar(105, 110), bar(103, 108), bar(99, 104)], 0, 2, 100)).toBe(2)
  })

  it('ignores bars before the entry bar and past the right edge', () => {
    const bars = [bar(99, 101), bar(105, 110), bar(105, 110), bar(99, 101)]
    expect(positionFill(bars, 1, 2, 100)).toBeNull()
    expect(positionFill(bars, 1.5, 3.2, 100)).toBe(3)
  })

  it('stays pending when the entry lies past the last bar', () => {
    expect(positionFill([bar(99, 101)], 5, 9, 100)).toBeNull()
  })
})
