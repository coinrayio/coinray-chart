import { describe, expect, it } from 'vitest'
import { formatBigNumber } from '../common/utils/format'

describe('formatBigNumber', () => {
  it('abbreviates by magnitude, keeping the sign', () => {
    expect(formatBigNumber(800000)).toBe('800K')
    expect(formatBigNumber(-2400000)).toBe('-2.4M')
    expect(formatBigNumber('1500000000')).toBe('1.5B')
    expect(formatBigNumber(-1500)).toBe('-1.5K')
  })

  it('leaves small values alone', () => {
    expect(formatBigNumber(950)).toBe('950')
    expect(formatBigNumber('-12.5')).toBe('-12.5')
  })
})
