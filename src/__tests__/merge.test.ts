import { describe, it, expect } from 'vitest'
import { merge } from '../common/utils/typeChecks'

describe('merge', () => {
  it('replaces arrays instead of merging them by index', () => {
    const target = { extendData: { stats: ['priceRange', 'percentRange'], keep: 1 } }
    merge(target, { extendData: { stats: ['percentRange'] } })
    expect(target.extendData).toEqual({ stats: ['percentRange'], keep: 1 })
    merge(target, { extendData: { stats: [] } })
    expect(target.extendData.stats).toEqual([])
  })

  it('still merges nested records', () => {
    const target = { line: { color: 'red', size: 1 } }
    merge(target, { line: { size: 2 } })
    expect(target.line).toEqual({ color: 'red', size: 2 })
  })
})
