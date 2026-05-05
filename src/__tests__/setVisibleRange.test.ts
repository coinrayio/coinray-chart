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
import StoreImp from '../Store'
import type { KLineData } from '../common/Data'
import type {
  DataLoader,
  DataLoaderGetBarsParams,
  DataLoaderGetRangeParams
} from '../common/DataLoader'
import type { Period } from '../common/Period'
import type { SymbolInfo } from '../common/SymbolInfo'
import type Chart from '../Chart'

// ---------------------------------------------------------------------------
// Test rig
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000
const BASE = Date.UTC(2026, 3, 2, 0, 0, 0)

function createMockChart (): Chart {
  return {
    layout: () => { /* noop */ },
    updatePane: () => { /* noop */ }
  } as unknown as Chart
}

function candle (timestamp: number, marker = 0): KLineData {
  return { timestamp, open: 100 + marker, high: 101 + marker, low: 99 + marker, close: 100 + marker, volume: 1000 }
}

interface DeferredLoad {
  symbol: SymbolInfo
  period: Period
  resolve: (data: KLineData[]) => void
}

interface DeferredLoaderResult {
  loader: DataLoader
  pending: DeferredLoad[]
  resolveAt: (idx: number, data: KLineData[]) => void
}

/**
 * Data loader that captures every getBars(init) call and resolves them
 * manually via `resolveAt(idx, data)`. Lets tests interleave callback
 * order to simulate the supersede race.
 */
function createDeferredLoader (): DeferredLoaderResult {
  const pending: DeferredLoad[] = []
  const loader: DataLoader = {
    getBars: (params: DataLoaderGetBarsParams) => {
      if (params.type === 'init') {
        pending.push({
          symbol: params.symbol,
          period: params.period,
          resolve: (data: KLineData[]) => params.callback(data, { backward: false, forward: false })
        })
      }
    },
    subscribeBar: () => { /* noop */ },
    unsubscribeBar: () => { /* noop */ },
    getRange: (params: DataLoaderGetRangeParams) => {
      params.callback([])
    }
  }
  return {
    loader,
    pending,
    resolveAt: (idx, data) => {
      const p = pending[idx]
      if (!p) throw new Error(`no pending load at index ${idx}`)
      p.resolve(data)
    }
  }
}

const SYMBOL_A: SymbolInfo = { ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo
const SYMBOL_B: SymbolInfo = { ticker: 'BBB', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo
const PERIOD_1H: Period = { type: 'hour', span: 1, text: '1h' }
const PERIOD_4H: Period = { type: 'hour', span: 4, text: '4h' }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('_processDataLoad init-generation gating', () => {
  it('drops superseded callback: setPeriod then setSymbol, period-only callback fires first', () => {
    const chart = createMockChart()
    const store = new StoreImp(chart)
    store.setSymbol(SYMBOL_A)
    store.setPeriod(PERIOD_1H)
    const { loader, pending, resolveAt } = createDeferredLoader()
    store.setDataLoader(loader)

    // Initial setDataLoader fires getBars for (A, 1h)
    expect(pending).toHaveLength(1)
    resolveAt(0, [candle(BASE, 1)])
    expect(store.getDataList()).toHaveLength(1)
    expect(store.getDataList()[0].open).toBe(101)

    // Synchronous switch: 4h then symbol B
    store.setPeriod(PERIOD_4H) // fires getBars for (A, 4h) — gen N+1
    store.setSymbol(SYMBOL_B)  // fires getBars for (B, 4h) — gen N+2

    expect(pending).toHaveLength(3)

    // Period-only (A, 4h) callback fires first — should be dropped (superseded)
    resolveAt(1, [candle(BASE + HOUR_MS, 99)]) // marker 99 — should never appear
    expect(store.getDataList()).toHaveLength(1) // unchanged
    expect(store.getDataList()[0].open).toBe(101) // still original A 1h data

    // Now (B, 4h) callback — current generation, should apply
    resolveAt(2, [candle(BASE + 2 * HOUR_MS, 50)])
    expect(store.getDataList()).toHaveLength(1)
    expect(store.getDataList()[0].open).toBe(150) // B's data
  })

  it('drops superseded callback when newer load resolves first', () => {
    const chart = createMockChart()
    const store = new StoreImp(chart)
    store.setSymbol(SYMBOL_A)
    store.setPeriod(PERIOD_1H)
    const { loader, pending, resolveAt } = createDeferredLoader()
    store.setDataLoader(loader)
    resolveAt(0, [candle(BASE, 1)])

    store.setPeriod(PERIOD_4H)
    store.setSymbol(SYMBOL_B)
    expect(pending).toHaveLength(3)

    // Newest first
    resolveAt(2, [candle(BASE + 2 * HOUR_MS, 50)])
    expect(store.getDataList()[0].open).toBe(150)

    // Stale one arrives later — must not clobber
    resolveAt(1, [candle(BASE + HOUR_MS, 99)])
    expect(store.getDataList()).toHaveLength(1)
    expect(store.getDataList()[0].open).toBe(150)
  })

  it('fires onInitLoadComplete exactly once for the final load', () => {
    const chart = createMockChart()
    const store = new StoreImp(chart)
    store.setSymbol(SYMBOL_A)
    store.setPeriod(PERIOD_1H)
    const { loader, pending, resolveAt } = createDeferredLoader()
    store.setDataLoader(loader)
    resolveAt(0, [candle(BASE, 1)])

    let completeCount = 0
    store.subscribeAction('onInitLoadComplete', () => { completeCount += 1 })

    store.setPeriod(PERIOD_4H)
    store.setSymbol(SYMBOL_B)

    // Stale callback first — must not fire onInitLoadComplete
    resolveAt(1, [candle(BASE + HOUR_MS, 99)])
    expect(completeCount).toBe(0)
    expect(store.isInitLoadInFlight()).toBe(true)

    // Final callback fires it once
    resolveAt(2, [candle(BASE + 2 * HOUR_MS, 50)])
    expect(completeCount).toBe(1)
    expect(store.isInitLoadInFlight()).toBe(false)
  })

  it('single setSymbol path is unchanged', () => {
    const chart = createMockChart()
    const store = new StoreImp(chart)
    store.setSymbol(SYMBOL_A)
    store.setPeriod(PERIOD_1H)
    const { loader, pending, resolveAt } = createDeferredLoader()
    store.setDataLoader(loader)

    let completeCount = 0
    store.subscribeAction('onInitLoadComplete', () => { completeCount += 1 })

    expect(pending).toHaveLength(1)
    resolveAt(0, [candle(BASE, 7)])

    expect(store.getDataList()).toHaveLength(1)
    expect(store.getDataList()[0].open).toBe(107)
    expect(completeCount).toBe(1)
    expect(store.isInitLoadInFlight()).toBe(false)
  })

  it('round-trip switch (A → B → A) applies each direction correctly', () => {
    const chart = createMockChart()
    const store = new StoreImp(chart)
    store.setSymbol(SYMBOL_A)
    store.setPeriod(PERIOD_1H)
    const { loader, pending, resolveAt } = createDeferredLoader()
    store.setDataLoader(loader)
    resolveAt(0, [candle(BASE, 1)])

    // A → B
    store.setSymbol(SYMBOL_B)
    resolveAt(1, [candle(BASE + HOUR_MS, 50)])
    expect(store.getDataList()[0].open).toBe(150)

    // B → A
    store.setSymbol(SYMBOL_A)
    resolveAt(2, [candle(BASE + 2 * HOUR_MS, 1)])
    expect(store.getDataList()[0].open).toBe(101)
  })
})

describe('resetView defaults', () => {
  it('exposes default bar-space and offset-right via Store getters', () => {
    const store = new StoreImp(createMockChart())
    // Constants from Store.ts (DEFAULT_BAR_SPACE = 10, DEFAULT_OFFSET_RIGHT_DISTANCE = 80)
    expect(store.getDefaultBarSpace()).toBe(10)
    expect(store.getDefaultOffsetRightDistance()).toBe(80)
  })

  it('applying defaults restores the freshly-mounted bar-space and offset', () => {
    const store = new StoreImp(createMockChart())
    store.setSymbol(SYMBOL_A)
    store.setPeriod(PERIOD_1H)
    const { loader, resolveAt } = createDeferredLoader()
    store.setDataLoader(loader)
    resolveAt(0, [candle(BASE), candle(BASE + HOUR_MS), candle(BASE + 2 * HOUR_MS)])

    // Simulate user zoom + scroll
    store.setBarSpace(25)
    store.setOffsetRightDistance(200, true)
    expect(store.getBarSpace().bar).toBe(25)
    expect(store.getInitialOffsetRightDistance()).toBe(200)

    // Apply defaults — same primitives that resetView uses
    store.setBarSpace(store.getDefaultBarSpace())
    store.setOffsetRightDistance(store.getDefaultOffsetRightDistance(), true)

    expect(store.getBarSpace().bar).toBe(10)
    expect(store.getInitialOffsetRightDistance()).toBe(80)
  })
})
