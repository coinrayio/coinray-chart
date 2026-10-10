import { afterEach, describe, it, expect, vi } from 'vitest'
import StoreImp from '../Store'
import type Chart from '../Chart'
import type { DataLoader } from '../common/DataLoader'
import type { SymbolInfo } from '../common/SymbolInfo'

const HOUR_MS = 3_600_000

function storeWithBars (count: number): StoreImp {
  const chart = { layout: () => {}, updatePane: () => {} } as unknown as Chart
  const store = new StoreImp(chart)
  store.setSymbol({ ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo)
  store.setPeriod({ type: 'hour', span: 1 })
  const bars = Array.from({ length: count }, (_, i) => ({ timestamp: i * HOUR_MS, open: 100, high: 101, low: 99, close: 100, volume: 1 }))
  const loader: DataLoader = {
    getBars: (params) => { if (params.type === 'init') params.callback(bars, { backward: false, forward: false }) },
    subscribeBar: () => {},
    unsubscribeBar: () => {},
    getRange: (params) => { params.callback([]) }
  }
  store.setTotalBarSpace(1100)
  store.setDataLoader(loader)
  return store
}

describe('zoom around the last bar', () => {
  it('keeps the last bar on the same pixel, instead of flipping it between two', () => {
    const store = storeWithBars(500)
    store.setZoomAnchor('last_bar')
    const last = store.getDataList().length - 1
    // Start where the app was caught: the last bar's centre a hair past a half pixel.
    const s = store as unknown as { _lastBarRightSideDiffBarCount: number }
    s._lastBarRightSideDiffBarCount = (1100 - 1000.504) / store.getBarSpace().bar - 0.5
    const xs: number[] = []
    for (let i = 0; i < 12; i++) {
      store.zoom(0.25, { x: 300 }, 'main')
      xs.push(store.dataIndexToCoordinate(last))
    }
    expect(new Set(xs).size).toBe(1)
  })
})

describe('zoom around the right edge', () => {
  it('keeps the right edge on the same bar, so the last bar moves when it sits mid-chart', () => {
    const store = storeWithBars(500)
    store.setZoomAnchor('right_edge')
    const last = store.getDataList().length - 1
    store.setLastBarRightSideDiffBarCount(30)
    const edgeIndex = store.coordinateToFloatIndex(1100)
    const lastX = store.dataIndexToCoordinate(last)
    store.zoom(1, { x: 300 }, 'main')
    expect(store.coordinateToFloatIndex(1100)).toBeCloseTo(edgeIndex, 6)
    expect(store.getLastBarRightSideDiffBarCount()).toBeCloseTo(30, 6)
    expect(store.dataIndexToCoordinate(last)).toBeLessThan(lastX)
  })
})

describe('candle spacing while zooming', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it.each([1, 2])('places candles on device pixels, gaps differing by at most one (pixel ratio %i)', (ratio) => {
    vi.stubGlobal('window', { devicePixelRatio: ratio })
    const store = storeWithBars(500)
    store.setZoomAnchor('cursor')
    const last = store.getDataList().length - 1
    for (let i = 0; i < 9; i++) {
      store.zoom(0.37, { x: 537 }, 'main')
      const xs = Array.from({ length: 40 }, (_, k) => store.dataIndexToCoordinate(last - k))
      xs.forEach((x) => { expect((x * ratio) % 1).toBe(0) })
      const gaps = xs.slice(1).map((x, k) => xs[k] - x)
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1 / ratio)
    }
  })

  it('zooms continuously, not in whole-pixel steps', () => {
    const store = storeWithBars(500)
    const start = store.getBarSpace().bar
    store.zoom(0.05, { x: 537 }, 'main')
    expect(store.getBarSpace().bar).toBeGreaterThan(start)
  })
})

describe('candle body width', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it.each([1, 2])('is whole device pixels, shares the wick parity, and grows at most one pixel pair per step (pixel ratio %i)', (ratio) => {
    vi.stubGlobal('window', { devicePixelRatio: ratio })
    const store = storeWithBars(500)
    let prev = store.getBarSpace().gapBar * ratio
    for (let i = 0; i < 30; i++) {
      store.zoom(0.1, { x: 537 }, 'main')
      const { gapBar, halfGapBar, wick, halfWick } = store.getBarSpace()
      const body = gapBar * ratio
      expect(body % 1).toBe(0)
      expect(body % 2).toBe((wick * ratio) % 2)
      // Body and wick share a centre line.
      expect(-halfGapBar + gapBar / 2).toBeCloseTo(-halfWick + wick / 2)
      expect(body - prev).toBeLessThanOrEqual(2)
      prev = body
    }
  })
})

describe('bar space limits, as TradingView', () => {
  it('clamps to the limit instead of refusing a step past it', () => {
    const store = storeWithBars(500)
    store.setBarSpace(0.6)
    store.setBarSpace(0.1)
    expect(store.getBarSpace().bar).toBe(0.5)
  })

  it('never makes a bar wider than half the chart', () => {
    const store = storeWithBars(500)
    store.setBarSpaceLimit({ max: 10_000 })
    store.setBarSpace(5000)
    expect(store.getBarSpace().bar).toBe(550)
  })
})
