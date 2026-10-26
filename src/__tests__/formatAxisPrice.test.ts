import { describe, it, expect } from 'vitest'
import { formatAxisPrice } from '../common/utils/axisPrice'
import { formatFoldDecimal } from '../common/utils/format'

// Order and position tags printed 0.000000000358 beside an axis of 0.0₉345:
// they skipped the axis text and the decimal fold the last-price tag uses.
const chart = {
  getSymbol: () => ({ pricePrecision: 12 }),
  getThousandsSeparator: () => ({ format: (v: string) => { const [i, d] = v.split('.'); return [i.replace(/\B(?=(\d{3})+(?!\d))/g, ','), d].filter(x => x !== undefined).join('.') } }),
  getDecimalFold: () => ({ formatPrice: (v: string) => formatFoldDecimal(v, 3) })
}

describe('formatAxisPrice', () => {
  it('folds a tiny price the way the scale does', () => {
    expect(formatAxisPrice(chart, null, 0.000000000358)).toBe('0.0₉358')
  })

  it("starts from the axis's own text, where a host's number format lives", () => {
    const yAxis = { displayValueToText: (v: number, p: number) => v.toFixed(p).replace('.', ',') }
    expect(formatAxisPrice({ ...chart, getDecimalFold: () => ({ formatPrice: (v: string) => v }) }, yAxis, 1.5, 2)).toBe('1,50')
  })
})
