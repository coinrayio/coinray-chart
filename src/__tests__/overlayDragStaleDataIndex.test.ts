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
import OverlayImp from '../component/Overlay'
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

describe('overlay drag re-derives dataIndex from timestamp at press start', () => {
  it('drags from the bar the timestamp maps to, not a stale stored dataIndex', () => {
    const store = buildStore(10)
    const dataList = store.getDataList()
    const overlay = new OverlayImp({ name: 'test-line' })
    // A forward load that prepended 3 bars would leave this dataIndex behind
    // while the timestamp still resolves to bar 5.
    overlay.points = [{ dataIndex: 2, timestamp: dataList[5].timestamp, value: 100 }]

    overlay.startPressedMove({ dataIndex: 5, timestamp: dataList[5].timestamp, value: 100 }, store)
    expect(overlay.points[0].dataIndex).toBe(5)

    const movedToIndex = 7
    overlay.eventPressedOtherMove(
      { dataIndex: movedToIndex, timestamp: dataList[movedToIndex].timestamp, value: 110 },
      store
    )

    expect(overlay.points[0].dataIndex).toBe(movedToIndex)
    expect(overlay.points[0].timestamp).toBe(dataList[movedToIndex].timestamp)
  })

  it('keeps a continuous-drawing point at its sub-bar fraction through press start', () => {
    const store = buildStore(10)
    const floatIndex = 4.3
    const timestamp = store.floatIndexToTimestamp(floatIndex)
    expect(timestamp).not.toBeNull()

    const overlay = new OverlayImp({ name: 'test-brush' })
    overlay.drawingMode = 'continuous'
    // Stale integer dataIndex, as if left behind before a prepend.
    overlay.points = [{ dataIndex: 1, timestamp: timestamp as number, value: 100 }]

    overlay.startPressedMove({ dataIndex: floatIndex, timestamp: timestamp as number, value: 100 }, store)

    const correctedIndex = overlay.points[0].dataIndex as number
    expect(Math.abs(correctedIndex - floatIndex)).toBeLessThan(1e-6)

    const roundTrippedTimestamp = store.floatIndexToTimestamp(correctedIndex)
    expect(roundTrippedTimestamp).not.toBeNull()
    expect(Math.abs((roundTrippedTimestamp as number) - (timestamp as number))).toBeLessThanOrEqual(1)
  })

  it('keeps a step-drawn point between bars on a higher timeframe instead of snapping it', () => {
    // A trendline end drawn at 14:00 on 1h, viewed on 4h: it sits halfway into
    // the 12:00 bar. Snapping it to the nearest bar (16:00) changed the line's
    // angle on every timeframe switch.
    const store = new StoreImp(createMockChart())
    store.setSymbol(SYMBOL_A)
    store.setPeriod({ type: 'hour', span: 4 })
    const data: KLineData[] = []
    for (let i = 0; i < 10; i++) data.push(candle(BASE + i * 4 * HOUR_MS))
    store.setDataLoader(createSyncLoader(data))

    const timestamp = BASE + 3 * 4 * HOUR_MS + 2 * HOUR_MS
    const overlay = new OverlayImp({ name: 'test-line' })
    overlay.points = [{ dataIndex: 0, timestamp, value: 100 }]
    overlay.startPressedMove({ dataIndex: 3, timestamp, value: 100 }, store)

    expect(overlay.points[0].dataIndex).toBeCloseTo(3.5, 6)
    // A whole-bar drag keeps the offset within the bar.
    overlay.eventPressedOtherMove({ dataIndex: 5, timestamp: data[5].timestamp, value: 100 }, store)
    expect(overlay.points[0].dataIndex).toBeCloseTo(5.5, 6)
    expect(overlay.points[0].timestamp).toBe(timestamp + 2 * 4 * HOUR_MS)
  })
})
