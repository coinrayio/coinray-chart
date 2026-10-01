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
import type { AxisRange } from '../component/Axis'
import DrawPane from '../pane/DrawPane'
import normal from '../extension/y-axis/normal'
import indexed100 from '../extension/y-axis/indexed100'
import { getYAxisClass } from '../extension/y-axis'

const HEIGHT = 400

interface Fixture {
  axis: YAxisImp
  setBarSpace: (bar: number) => void
}

interface FakeIndicator {
  shouldOhlc: boolean
  precision: number
  minValue?: number
  maxValue?: number
  figures: Array<{ key: string }>
  result: Array<Record<string, number>>
}

function range (from: number, to: number): AxisRange {
  return { from, to, range: to - from, realFrom: from, realTo: to, realRange: to - from, displayFrom: from, displayTo: to, displayRange: to - from }
}

function makeAxis (
  template = normal,
  opts: { closes?: number[], indicators?: FakeIndicator[], paneId?: string } = {}
): Fixture {
  const closes = opts.closes ?? [100, 110, 120, 130]
  const bars = closes.map((close, i) => ({ timestamp: i, open: close, high: close + 5, low: close - 5, close, volume: 1 }))
  let barSpace = 10
  const chartStore = {
    getIndicatorsByPaneId: () => opts.indicators ?? [],
    getSymbol: () => ({ pricePrecision: 2 }),
    getVisibleRangeDataList: () => bars.map((data, dataIndex) => ({ dataIndex, x: 0, data: { current: data } })),
    getBarSpace: () => ({ bar: barSpace }),
    getStyles: () => ({ xAxis: { tickText: { size: 12 } } }),
    getInnerFormatter: () => ({ formatBigNumber: (v: string) => v }),
    getThousandsSeparator: () => ({ format: (v: string) => v }),
    getDecimalFold: () => ({ format: (v: string) => v })
  }
  const chart = {
    getChartStore: () => chartStore,
    getStyles: () => ({ candle: { type: 'candle_solid', area: { value: 'close' } } }),
    getDataList: () => bars,
    getVisibleRange: () => ({ from: 0, to: bars.length, realFrom: 0, realTo: bars.length })
  }
  const parent = {
    getId: () => opts.paneId ?? 'candle_pane',
    getChart: () => chart,
    getYAxisWidget: () => ({ getBounding: () => ({ height: HEIGHT, width: 60, top: 0, left: 0 }) })
  }
  const axis = new (YAxisImp.extend(template))(parent as unknown as DrawPane)
  return { axis, setBarSpace: bar => { barSpace = bar } }
}

describe('setOptions keeps the manual range (E2)', () => {
  function pane (axis: YAxisImp): { fake: { _axis: YAxisImp }, setOptions: (o: object) => void } {
    const fake = {
      _axis: axis,
      _options: { id: '', axis: { name: 'normal', scrollZoomEnabled: true } },
      getId: () => 'candle_pane',
      createAxisComponent: (name: string) => new (getYAxisClass(name))(fake as unknown as DrawPane),
      getYAxisWidget: () => ({ getContainer: () => ({ style: {} }) })
    }
    return { fake, setOptions: o => { DrawPane.prototype.setOptions.call(fake, o) } }
  }

  it('leaves auto off on a reverse change', () => {
    const { axis } = makeAxis()
    const p = pane(axis)
    axis.setRange(range(50, 150))
    p.setOptions({ axis: { reverse: true } })
    expect(p.fake._axis.getAutoCalcTickFlag()).toBe(false)
    expect(p.fake._axis.reverse).toBe(true)
  })

  it('goes back to auto when the axis name changes', () => {
    const { axis } = makeAxis()
    const p = pane(axis)
    axis.setRange(range(50, 150))
    p.setOptions({ axis: { name: 'percentage' } })
    expect(p.fake._axis.name).toBe('percentage')
    expect(p.fake._axis.getAutoCalcTickFlag()).toBe(true)
  })

  it('does not re-apply a price-to-bar lock on later calls', () => {
    const { axis } = makeAxis()
    const p = pane(axis)
    p.setOptions({ axis: { priceToBarRatio: 2 } })
    expect(axis.getPriceToBarRatio()).toBe(2)
    axis.setAutoCalcTickFlag(true)
    p.setOptions({ axis: { reverse: true } })
    expect(axis.getPriceToBarRatio()).toBeNull()
  })
})

describe('indexed100 (E3)', () => {
  it('maps the first visible close to 100 and double it to 200, without a %', () => {
    const { axis } = makeAxis(indexed100, { closes: [100, 110, 120, 130] })
    axis.buildTicks(true)
    const r = axis.getRange()
    const at = (price: number): number => axis.valueToRealValue(price, { range: r })
    expect(at(100)).toBeCloseTo(100)
    expect(at(200)).toBeCloseTo(200)
    expect(axis.displayValueToText(150, 2)).toBe('150.00')
    expect(axis.getTicks().every(t => !t.text.includes('%'))).toBe(true)
  })
})

describe('scaleSeriesOnly (E4)', () => {
  const far: FakeIndicator = {
    shouldOhlc: false,
    precision: 2,
    maxValue: 1000,
    figures: [{ key: 'v' }],
    result: [{ v: 900 }, { v: 900 }, { v: 900 }, { v: 900 }]
  }

  it('lets a far-away candle-pane indicator widen the range only when off', () => {
    const off = makeAxis(normal, { indicators: [far] })
    off.axis.buildTicks(true)
    expect(off.axis.getRange().to).toBeGreaterThan(900)
    const on = makeAxis(normal, { indicators: [far] })
    on.axis.override({ name: 'normal', scaleSeriesOnly: true })
    on.axis.buildTicks(true)
    expect(on.axis.getRange().to).toBeLessThan(200)
  })

  it('has no effect on an indicator pane', () => {
    const f = makeAxis(normal, { indicators: [far], paneId: 'indicator_pane_1' })
    f.axis.override({ name: 'normal', scaleSeriesOnly: true })
    f.axis.buildTicks(true)
    expect(f.axis.getRange().to).toBeGreaterThan(900)
  })
})

describe('priceToBarRatio (E5)', () => {
  it('rescales the span with barSpace around the same centre and turns auto off', () => {
    const f = makeAxis()
    f.axis.buildTicks(true)
    const before = f.axis.getRange()
    const centre = (before.realFrom + before.realTo) / 2
    f.axis.override({ name: 'normal', priceToBarRatio: null })
    expect(f.axis.getAutoCalcTickFlag()).toBe(false)
    expect(f.axis.getPriceToBarRatio()).toBeCloseTo(before.realRange / HEIGHT * 10)
    f.setBarSpace(20)
    f.axis.buildTicks(true)
    const after = f.axis.getRange()
    expect(after.realRange).toBeCloseTo(before.realRange / 2)
    expect((after.realFrom + after.realTo) / 2).toBeCloseTo(centre)
  })

  it('takes an explicit ratio, and setRange updates it', () => {
    const f = makeAxis()
    f.axis.override({ name: 'normal', priceToBarRatio: 2 })
    f.axis.buildTicks(true)
    expect(f.axis.getRange().realRange).toBeCloseTo(2 / 10 * HEIGHT)
    f.axis.setRange(range(0, 80))
    expect(f.axis.getPriceToBarRatio()).toBeCloseTo(80 / HEIGHT * 10)
  })

  it('is released by turning auto on', () => {
    const f = makeAxis()
    f.axis.override({ name: 'normal', priceToBarRatio: 2 })
    f.axis.setAutoCalcTickFlag(true)
    expect(f.axis.getPriceToBarRatio()).toBeNull()
    expect(f.axis.getAutoCalcTickFlag()).toBe(true)
  })
})
