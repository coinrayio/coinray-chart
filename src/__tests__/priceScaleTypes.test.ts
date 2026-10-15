/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// ALT-34: log labels, decimal fold, percentage rebase.
import { describe, it, expect } from 'vitest'
import YAxisImp from '../component/YAxis'
import type { AxisTemplate } from '../component/Axis'
import DrawPane from '../pane/DrawPane'
import logarithm from '../extension/y-axis/logarithm'
import percentage from '../extension/y-axis/percentage'
import { formatFoldDecimal, formatFoldDecimals } from '../common/utils/format'

const HEIGHT = 400

function makeAxis (template: AxisTemplate, bars: Array<{ high: number, low: number, close: number }>, pricePrecision = 2) {
  const data = bars.map((b, timestamp) => ({ timestamp, open: b.close, volume: 1, ...b }))
  let first = 0
  const chartStore = {
    getIndicatorsByPaneId: () => [],
    getSymbol: () => ({ pricePrecision }),
    getVisibleRangeDataList: () => data.slice(first).map((d, i) => ({ dataIndex: i + first, x: 0, data: { current: d } })),
    getBarSpace: () => ({ bar: 10 }),
    getStyles: () => ({ xAxis: { tickText: { size: 12 } } }),
    getInnerFormatter: () => ({ formatBigNumber: (v: string) => v }),
    getThousandsSeparator: () => ({ format: (v: string) => v }),
    getDecimalFold: () => ({ format: (v: string) => v })
  }
  const chart = {
    getChartStore: () => chartStore,
    getStyles: () => ({ candle: { type: 'candle_solid', area: { value: 'close' } } }),
    getDataList: () => data,
    // `from` held at 0, as the engine holds it once the view is scrolled past
    // the last bar: the first bar on screen is `realFrom`.
    getVisibleRange: () => ({ from: 0, to: data.length, realFrom: first, realTo: data.length })
  }
  const parent = {
    getId: () => 'candle_pane',
    getChart: () => chart,
    getYAxisWidget: () => ({ getBounding: () => ({ height: HEIGHT, width: 60, top: 0, left: 0 }) })
  }
  const axis = new (YAxisImp.extend(template))(parent as unknown as DrawPane) as YAxisImp
  return { axis, scrollTo: (index: number) => { first = index } }
}

const flat = (close: number) => ({ high: close, low: close, close })

describe('logarithm axis', () => {
  it('labels prices below 1 as the prices they are (PSC-003)', () => {
    const closes = [0.00070, 0.00072, 0.00068, 0.00075, 0.00080, 0.00066]
    const { axis } = makeAxis(logarithm, closes.map(c => ({ high: c * 1.02, low: c * 0.98, close: c })), 6)
    axis.buildTicks(true)
    const range = axis.getRange()
    expect(range.from).toBeGreaterThan(0)
    expect(range.from).toBeLessThan(0.00066 * 0.98)
    expect(range.to).toBeGreaterThan(0.00080 * 1.02)
    const values = axis.getTicks().map(t => +t.value)
    expect(values.length).toBeGreaterThan(1)
    values.forEach(v => {
      expect(v).toBeGreaterThan(range.from)
      expect(v).toBeLessThan(range.to)
    })
  })

  it('round-trips value -> real -> value on both sides of 1', () => {
    const { axis } = makeAxis(logarithm, [flat(1)])
    const range = axis.getRange()
    for (const v of [0.0000024, 0.0007, 0.5, 1, 3, 65000]) {
      const real = axis.valueToRealValue(v, { range })
      expect(axis.realValueToValue(real, { range }) / v).toBeCloseTo(1, 12)
      expect(axis.realValueToDisplayValue(real, { range }) / v).toBeCloseTo(1, 12)
    }
  })

  it('keeps a usable range when the low is zero', () => {
    const { axis } = makeAxis(logarithm, [{ high: 10, low: 0, close: 5 }])
    axis.buildTicks(true)
    const { realFrom, realTo } = axis.getRange()
    expect(Number.isFinite(realFrom)).toBe(true)
    expect(realTo - realFrom).toBeLessThan(3)
  })
})

describe('decimal fold (PSC-002)', () => {
  it('prints small prices in full below the threshold', () => {
    expect(formatFoldDecimal('0.0009', 5)).toBe('0.0009')
    expect(formatFoldDecimal('0.00009', 5)).toBe('0.00009')
  })

  it('uses TradingView subscript notation and trims padding', () => {
    expect(formatFoldDecimal('0.0000000024', 5)).toBe('0.0₈24')
    expect(formatFoldDecimal('0.0000012000', 5)).toBe('0.0₅12')
    expect(formatFoldDecimal('-0.0000000024', 5)).toBe('-0.0₈24')
    expect(formatFoldDecimal('0,0000000024', 5)).toBe('0,0₈24')
    expect(formatFoldDecimal('0.' + '0'.repeat(12) + '5', 5)).toBe('0.0₁₂5')
  })

  it('prints a long run of padding zeros as 0, short padding as is', () => {
    expect(formatFoldDecimal('0.000000000', 5)).toBe('0')
    expect(formatFoldDecimal('-0.000000000', 5)).toBe('0')
    expect(formatFoldDecimal('0.00', 5)).toBe('0.00')
  })

  it('leaves values of 1 and above alone', () => {
    expect(formatFoldDecimal('12.0000001', 5)).toBe('12.0000001')
    expect(formatFoldDecimal('65,000.00', 5)).toBe('65,000.00')
  })

  it('shares one zero count across a set of labels', () => {
    const ticks = ['0.0000000009000', '0.0000000010000', '0.0000000011000', '0.0000000012500']
    expect(formatFoldDecimals(ticks, 5)).toEqual(['0.0₈090', '0.0₈100', '0.0₈110', '0.0₈125'])
  })

  it('does not fold a set whose largest value is under the threshold', () => {
    // 0.000009 alone would fold, but 0.00001 has only four zeros.
    const ticks = ['0.000009', '0.000010', '0.000011']
    expect(formatFoldDecimals(ticks, 5)).toEqual(ticks)
    expect(formatFoldDecimals(['0.0000009', '0.0000010'], 5)).toEqual(['0.0₅09', '0.0₅10'])
    const wide = ['0.00009', '0.00010', '0.00100']
    expect(formatFoldDecimals(wide, 5)).toEqual(wide)
  })
})

describe('percentage axis rebases on the first visible bar (PSC-004)', () => {
  // Same high and low (80..120) whichever bar is first.
  const closes = [100, 120, 80, 110]

  it('rebuilds the labels when only the base moves', () => {
    const { axis, scrollTo } = makeAxis(percentage, closes.map(flat))
    axis.buildTicks(false)
    const before = axis.getTicks().map(t => t.text)
    scrollTo(1)
    expect(axis.buildTicks(false)).toBe(true)
    const zero = axis.getTicks().find(t => +t.value === 0)
    expect(zero).toBeDefined()
    // 0% now sits at 120, the new first close.
    expect(axis.convertToPixel(120)).toBeCloseTo(zero!.coord, 0)
    expect(axis.getTicks().map(t => t.text)).not.toEqual(before)
  })

  it('rebases a manual range without moving the candles', () => {
    const { axis, scrollTo } = makeAxis(percentage, closes.map(flat))
    axis.buildTicks(false)
    axis.setRange(axis.getRange())
    expect(axis.getAutoCalcTickFlag()).toBe(false)
    const pixelOf110 = axis.convertToPixel(110)
    scrollTo(1)
    axis.buildTicks(false)
    expect(axis.convertToPixel(110)).toBe(pixelOf110)
    const { realFrom, from } = axis.getRange()
    expect(realFrom).toBeCloseTo((from - 120) / 120 * 100, 9)
  })
})
