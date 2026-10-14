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
import { describe, it, expect } from 'vitest'
import YAxisImp from '../component/YAxis'
import IndicatorImp, { getRebaseFactor, isBoundToAxis, isRebased } from '../component/Indicator'
import type DrawPane from '../pane/DrawPane'
import normal from '../extension/y-axis/normal'
import percentage from '../extension/y-axis/percentage'
import type { AxisTemplate } from '../component/Axis'

const HEIGHT = 400

interface FakeIndicator {
  shouldOhlc: boolean
  precision: number
  visible: boolean
  yAxis?: 'primary' | 'secondary'
  rebase?: boolean
  minValue?: number
  maxValue?: number
  figures: Array<{ key: string }>
  result: Array<Record<string, number> | undefined>
}

function indicator (values: Array<number | undefined>, extra: Partial<FakeIndicator> = {}): FakeIndicator {
  return {
    shouldOhlc: false,
    precision: 3,
    visible: true,
    figures: [{ key: 'v' }],
    result: values.map(v => (v === undefined ? undefined : { v })),
    ...extra
  }
}

const CLOSES = [100, 110, 120, 130]

function makeAxis (
  template: AxisTemplate,
  indicators: FakeIndicator[],
  opts: { secondary?: boolean, paneId?: string, from?: number } = {}
): YAxisImp {
  const bars = CLOSES.map((close, i) => ({ timestamp: i, open: close, high: close + 5, low: close - 5, close, volume: 1 }))
  const from = opts.from ?? 0
  const visibleRange = { from, to: bars.length, realFrom: from, realTo: bars.length }
  const chartStore = {
    getIndicatorsByPaneId: () => indicators,
    getSymbol: () => ({ pricePrecision: 2 }),
    getVisibleRangeDataList: () => bars.slice(from).map((data, i) => ({ dataIndex: from + i, x: 0, data: { current: data } })),
    getBarSpace: () => ({ bar: 10 }),
    getStyles: () => ({ xAxis: { tickText: { size: 12 } } }),
    getInnerFormatter: () => ({ formatBigNumber: (v: string) => v }),
    getThousandsSeparator: () => ({ format: (v: string) => v }),
    getDecimalFold: () => ({ format: (v: string) => v })
  }
  const chart = {
    getChartStore: () => chartStore,
    getStyles: () => ({ candle: { type: 'candle_solid', area: { value: 'close' } } }),
    getDataList: () => bars,
    getVisibleRange: () => visibleRange
  }
  const widget = { getBounding: () => ({ height: HEIGHT, width: 60, top: 0, left: 0 }) }
  const parent = {
    getId: () => opts.paneId ?? 'candle_pane',
    getChart: () => chart,
    getYAxisWidget: () => widget,
    getSecondaryYAxisWidget: () => widget
  }
  const axis = new (YAxisImp.extend(template))(parent as unknown as DrawPane)
  axis.secondary = opts.secondary ?? false
  return axis
}

describe('getRebaseFactor', () => {
  const chart = (from: number, to = 4): Parameters<typeof getRebaseFactor>[0] => ({
    getDataList: () => CLOSES.map(close => ({ close })) as never,
    getVisibleRange: () => ({ from, to })
  })

  it('is close[from] over the first figure at from', () => {
    expect(getRebaseFactor(chart(0), indicator([50, 55, 60, 65]))).toBe(2)
    expect(getRebaseFactor(chart(1), indicator([50, 55, 60, 65]))).toBe(2)
    expect(getRebaseFactor(chart(2), indicator([50, 55, 40, 65]))).toBe(3)
  })

  it('uses the first value at or after from when the bar has none', () => {
    expect(getRebaseFactor(chart(0), indicator([undefined, undefined, 60, 65]))).toBe(100 / 60)
  })

  it('is 1 with nothing in view, or a price that is not positive', () => {
    expect(getRebaseFactor(chart(2), indicator([50, 55, undefined, undefined]))).toBe(1)
    expect(getRebaseFactor(chart(0), indicator([]))).toBe(1)
    expect(getRebaseFactor(chart(0), indicator([0, 5]))).toBe(1)
    expect(getRebaseFactor(chart(0), indicator([-3, 5]))).toBe(1)
    expect(getRebaseFactor(chart(9), indicator([50, 55]))).toBe(1)
  })
})

describe('axis binding', () => {
  it('defaults to the primary axis and rebases only there, on the candle pane', () => {
    expect(isBoundToAxis({ yAxis: 'primary' }, false)).toBe(true)
    expect(isBoundToAxis({ yAxis: 'secondary' }, false)).toBe(false)
    expect(isBoundToAxis({ yAxis: 'secondary' }, true)).toBe(true)
    expect(isRebased({ yAxis: 'primary', rebase: true }, 'candle_pane')).toBe(true)
    expect(isRebased({ yAxis: 'primary', rebase: false }, 'candle_pane')).toBe(false)
    expect(isRebased({ yAxis: 'secondary', rebase: true }, 'candle_pane')).toBe(false)
    expect(isRebased({ yAxis: 'primary', rebase: true }, 'indicator_pane_1')).toBe(false)
  })

  it('is set by create and override, and a change asks for the axes to be re-measured', () => {
    const ind = new IndicatorImp({ name: 'x', calc: () => [] })
    expect(ind.yAxis).toBe('primary')
    expect(ind.rebase).toBe(false)
    ind.override({ yAxis: 'secondary', rebase: true })
    expect(ind.yAxis).toBe('secondary')
    expect(ind.rebase).toBe(true)
    expect(ind.axisLayoutChanged()).toBe(true)
    expect(ind.shouldUpdateImp().draw).toBe(true)
    ind.override({ shortName: 'renamed' })
    expect(ind.yAxis).toBe('secondary')
    expect(ind.axisLayoutChanged()).toBe(false)
    const created = new IndicatorImp({ name: 'y', calc: () => [], yAxis: 'secondary', rebase: true })
    expect(created.yAxis).toBe('secondary')
    expect(created.rebase).toBe(true)
  })
})

describe('y-axis range', () => {
  it('covers a rebased indicator where it is drawn', () => {
    // Own values 1..4 against closes 100..130: factor 100, drawn 100..400.
    const axis = makeAxis(normal, [indicator([1, 2, 3, 4], { rebase: true })])
    axis.buildTicks(true)
    expect(axis.getRange().to).toBeGreaterThanOrEqual(400)
  })

  it('leaves an indicator that is not rebased at its own values', () => {
    const axis = makeAxis(normal, [indicator([1, 2, 3, 4])])
    axis.buildTicks(true)
    expect(axis.getRange().from).toBeLessThan(1)
  })

  it('rebases onto the percentage base: the compare line starts at 0%', () => {
    const axis = makeAxis(percentage, [indicator([50, 60, 70, 80], { rebase: true })])
    axis.buildTicks(true)
    const range = axis.getRange()
    // Drawn 100, 120, 140, 160: a +60% span over a 100 base, candles reach 135.
    expect(range.realTo).toBeGreaterThanOrEqual(60)
    const at = (price: number): number => axis.valueToRealValue(price, { range })
    expect(at(100 * (50 / 50))).toBeCloseTo(0)
  })

  it('re-bases on the first visible bar as the view moves', () => {
    const values = [50, 100, 100, 100]
    const first = makeAxis(normal, [indicator(values, { rebase: true })], { from: 0 })
    first.buildTicks(true)
    // factor 2 at bar 0: drawn 100, 200, 200, 200
    expect(first.getRange().to).toBeGreaterThanOrEqual(200)
    const scrolled = makeAxis(normal, [indicator(values, { rebase: true })], { from: 1 })
    scrolled.buildTicks(true)
    // factor 1.1 at bar 1: drawn 110 at most
    expect(scrolled.getRange().to).toBeLessThan(200)
  })

  it('keeps secondary-bound indicators out of the primary range', () => {
    const far = indicator([5000, 5000, 5000, 5000], { yAxis: 'secondary' })
    const axis = makeAxis(normal, [far])
    axis.buildTicks(true)
    expect(axis.getRange().to).toBeLessThan(200)
  })

  it('ranges the secondary axis over its own indicators only, ignoring candles and visibility', () => {
    const bound = indicator([1, 2, 3, 4], { yAxis: 'secondary', precision: 5 })
    const hidden = indicator([9000, 9000, 9000, 9000], { yAxis: 'secondary', visible: false })
    const onPrimary = indicator([7000, 7000, 7000, 7000])
    const axis = makeAxis(normal, [bound, hidden, onPrimary], { secondary: true })
    axis.buildTicks(true)
    const { from, to } = axis.getRange()
    expect(from).toBeLessThanOrEqual(1)
    expect(to).toBeGreaterThanOrEqual(4)
    expect(to).toBeLessThan(10)
    expect(axis.isSecondary()).toBe(true)
    expect(axis.isInCandle()).toBe(false)
  })

  it('does not rebase on the secondary axis', () => {
    const axis = makeAxis(normal, [indicator([1, 2, 3, 4], { yAxis: 'secondary', rebase: true })], { secondary: true })
    axis.buildTicks(true)
    expect(axis.getRange().to).toBeLessThan(10)
  })
})
