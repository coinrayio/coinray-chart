import { describe, it, expect, vi } from 'vitest'
import ChartImp from '../Chart'

interface StubPane {
  id: string
  height: number
  options: { state: string, minHeight: number }
}

function stub (p: StubPane): unknown {
  return {
    getId: () => p.id,
    getOptions: () => p.options,
    setOptions: (o: Partial<StubPane['options']>) => { Object.assign(p.options, o) },
    getBounding: () => ({ height: p.height }),
    setBounding: (b: { height?: number }) => { if (b.height !== undefined) p.height = b.height },
    setOriginalBounding: () => {},
    getVisible: () => true
  }
}

/**
 * Setting a pane's height hands the difference to the price pane. Upstream
 * passed the whole new height instead, so re-applying a pane's own height
 * (a saved layout, put back once per script as each starts) took it from the
 * price pane every time and, once that hit its minimum, grew the pane.
 */
describe('setPaneOptions height', () => {
  function setup (): { chart: ChartImp, candle: StubPane, rsi: StubPane, macd: StubPane } {
    const candle = { id: 'candle_pane', height: 534, options: { state: 'normal', minHeight: 30 } }
    const rsi = { id: 'rsi', height: 384, options: { state: 'normal', minHeight: 30 } }
    const macd = { id: 'macd', height: 230, options: { state: 'normal', minHeight: 30 } }
    const chart = Object.create(ChartImp.prototype) as ChartImp
    Object.assign(chart, {
      _candlePane: stub(candle),
      _drawPanes: [stub(candle), stub(rsi), stub(macd)],
      layout: vi.fn()
    })
    return { chart, candle, rsi, macd }
  }

  it('changes nothing when a pane is given the height it has', () => {
    const { chart, candle, rsi, macd } = setup()
    for (let i = 0; i < 3; i++) {
      chart.setPaneOptions({ id: 'rsi', height: 384 })
      chart.setPaneOptions({ id: 'macd', height: 230 })
    }
    expect([candle.height, rsi.height, macd.height]).toEqual([534, 384, 230])
  })

  it('moves only the difference to or from the price pane', () => {
    const { chart, candle, macd } = setup()
    chart.setPaneOptions({ id: 'macd', height: 300 })
    expect([candle.height, macd.height]).toEqual([464, 300])
    chart.setPaneOptions({ id: 'macd', height: 200 })
    expect([candle.height, macd.height]).toEqual([564, 200])
  })
})
