import { describe, expect, it } from 'vitest'
import { positionExit } from '../extension/overlay/position'

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
})
