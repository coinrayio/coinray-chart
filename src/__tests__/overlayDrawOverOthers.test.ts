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
import OverlayView from '../view/OverlayView'
import Eventful from '../common/Eventful'
import { registerOverlay } from '../extension/overlay/index'
import type { KLineData } from '../common/Data'
import type { DataLoader } from '../common/DataLoader'
import type { MouseTouchEvent } from '../common/EventHandler'
import type { SymbolInfo } from '../common/SymbolInfo'
import type Chart from '../Chart'

registerOverlay({ name: 'test-draw-seg', totalStep: 3, createPointFigures: () => [] })

const HOUR_MS = 3_600_000
const BASE = Date.UTC(2026, 3, 2)

/** Stands in for a figure of an already-drawn overlay under the cursor. */
class OtherOverlayFigure extends Eventful {
  clicks = 0
  checkEventOn (): boolean { return true }
}

function setup (): { store: StoreImp, view: OverlayView, other: OtherOverlayFigure } {
  const store = new StoreImp({ layout: () => {}, updatePane: () => {} } as unknown as Chart)
  store.setSymbol({ ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo)
  store.setPeriod({ type: 'hour', span: 1 })
  const data: KLineData[] = []
  for (let i = 0; i < 10; i++) {
    data.push({ timestamp: BASE + i * HOUR_MS, open: 100, high: 101, low: 99, close: 100, volume: 1 })
  }
  const loader: DataLoader = {
    getBars: p => { if (p.type === 'init') p.callback(data, { backward: false, forward: false }) },
    subscribeBar: () => {},
    unsubscribeBar: () => {},
    getRange: p => { p.callback([]) }
  }
  store.setDataLoader(loader)
  const axis = { convertFromPixel: (v: number) => v, convertToPixel: (v: number) => v }
  const chart = {
    getChartStore: () => store,
    getStyles: () => ({ overlay: {} }),
    getXAxisPane: () => ({ getAxisComponent: () => axis }),
    updatePane: () => {}
  }
  const pane = { getId: () => 'candle_pane', getChart: () => chart, getAxisComponent: () => axis }
  const widget = { getPane: () => pane, setForceCursor: () => {}, getBounding: () => ({ width: 100, height: 100, left: 0, top: 0 }) }
  const view = new OverlayView(widget as never)
  const other = new OtherOverlayFigure()
  other.registerEvent('mouseClickEvent', () => { other.clicks++; return true })
  other.registerEvent('mouseMoveEvent', () => true)
  view.addChild(other)
  return { store, view, other }
}

const at = (x: number, y: number): MouseTouchEvent => ({ x, y, pageX: x, pageY: y })

describe('drawing over existing overlays', () => {
  it('places every point even when the click lands on another overlay figure', () => {
    const { store, view, other } = setup()
    store.addOverlays([{ name: 'test-draw-seg' }], [false])
    view.dispatchEvent('mouseMoveEvent', at(1, 1))
    view.dispatchEvent('mouseClickEvent', at(1, 1))
    expect(store.isOverlayDrawing()).toBe(true)
    view.dispatchEvent('mouseMoveEvent', at(5, 5))
    view.dispatchEvent('mouseClickEvent', at(5, 5))
    expect(other.clicks).toBe(0)
    expect(store.isOverlayDrawing()).toBe(false)
    const [drawn] = store.getOverlaysByPaneId('candle_pane')
    expect(drawn.points).toHaveLength(2)
  })
})
