import { describe, it, expect } from 'vitest'
import IndicatorImp from '../component/Indicator'

// Each override keeps a snapshot of the previous state for shouldUpdate. The
// snapshot used to include the one before it, so a desktop session that
// re-applied a script indicator every few minutes kept every earlier version,
// result rows and all: ~800 MB after 15 days.
interface Snapshot { _prevIndicator?: Snapshot, result: unknown[] }
const depth = (ind: IndicatorImp): number => {
  let n = 0
  for (let s = (ind as unknown as Snapshot)._prevIndicator; s !== undefined; s = s._prevIndicator) n++
  return n
}

describe('Indicator.override', () => {
  it('keeps only the previous state, however often it is replaced', () => {
    const ind = new IndicatorImp<{ v: number }>({ name: 'X', calc: () => [] })
    for (let i = 0; i < 50; i++) {
      ind.result = [{ v: i }]
      ind.override({ calcParams: [i] })
    }
    expect(depth(ind)).toBe(1)
  })

  it('still compares against the state before the last override', () => {
    const ind = new IndicatorImp<{ v: number }>({ name: 'X', calcParams: [1], calc: () => [] })
    const rows = [{ v: 1 }]
    ind.result = rows
    ind.override({ calcParams: [2] })
    expect(ind.shouldUpdateImp().calc).toBe(true)
    const prev = (ind as unknown as { _prevIndicator: { calcParams: unknown[], result: unknown[] } })._prevIndicator
    expect(prev.calcParams).toEqual([1])
    expect(prev.result).toBe(rows)
  })
})
