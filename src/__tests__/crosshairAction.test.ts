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

const HOUR_MS = 3_600_000
const BASE = Date.UTC(2026, 3, 2, 0, 0, 0)

function createMockChart (): Chart {
  return {
    layout: () => { /* noop */ },
    updatePane: () => { /* noop */ }
  } as unknown as Chart
}

function candle (timestamp: number): KLineData {
  return { timestamp, open: 100, high: 101, low: 99, close: 100, volume: 1000 }
}

function createSyncLoader (data: KLineData[]): DataLoader {
  return {
    getBars: (params: DataLoaderGetBarsParams) => {
      if (params.type === 'init') {
        params.callback(data, { backward: false, forward: false })
      }
    },
    subscribeBar: () => { /* noop */ },
    unsubscribeBar: () => { /* noop */ },
    getRange: (params: DataLoaderGetRangeParams) => {
      params.callback([])
    }
  }
}

const SYMBOL_A: SymbolInfo = { ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo
const PERIOD_1H: Period = { type: 'hour', span: 1 }

function buildStore (barCount: number): StoreImp {
  const store = new StoreImp(createMockChart())
  store.setSymbol(SYMBOL_A)
  store.setPeriod(PERIOD_1H)
  const data: KLineData[] = []
  for (let i = 0; i < barCount; i++) {
    data.push(candle(BASE + i * HOUR_MS))
  }
  store.setDataLoader(createSyncLoader(data))
  return store
}

describe('onCrosshairChange', () => {
  it('carries the bar under the pointer, with the pointer\'s own x/y', () => {
    const store = buildStore(10)
    const x = store.dataIndexToCoordinate(5)
    let payload: { kLineData?: KLineData, x?: number, y?: number } | undefined = undefined
    store.subscribeAction('onCrosshairChange', (data) => { payload = data as typeof payload })
    store.setCrosshair({ x, y: 42, paneId: 'candle_pane' })
    expect(payload).toMatchObject({ x, y: 42, kLineData: { timestamp: store.getDataList()[5].timestamp } })
  })

  it('reports a clear once, with no position and no bar', () => {
    const store = buildStore(10)
    const payloads: unknown[] = []
    store.subscribeAction('onCrosshairChange', (data) => { payloads.push(data) })
    store.setCrosshair({ x: store.dataIndexToCoordinate(5), y: 42, paneId: 'candle_pane' })
    store.setCrosshair()
    store.setCrosshair()
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toEqual({})
  })
})
