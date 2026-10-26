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
import { registerOverlay } from '../extension/overlay/index'
import type { KLineData } from '../common/Data'
import type { DataLoader } from '../common/DataLoader'
import type { MouseTouchEvent } from '../common/EventHandler'
import type { SymbolInfo } from '../common/SymbolInfo'
import type Chart from '../Chart'
import type OverlayImp from '../component/Overlay'

// Two filled boxes, B under A where they overlap. Selecting B has to make B
// reachable: its handles win over A's body, and clicking the overlap again
// walks down the stack instead of always landing on the top drawing.
registerOverlay({
  name: 'test-box',
  totalStep: 3,
  needDefaultPointFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return []
    const [a, b] = coordinates
    return [{
      type: 'rect',
      attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) },
      styles: { style: 'fill' }
    }]
  }
})

const HOUR_MS = 3_600_000
const BASE = Date.UTC(2026, 3, 2)
const ts = (i: number): number => BASE + i * HOUR_MS

const noopCtx = new Proxy({}, {
  get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : () => {},
  set: () => true
}) as unknown as CanvasRenderingContext2D

// Stroke-mode handles read the container's background.
;(globalThis as { window?: unknown }).window ??= { getComputedStyle: () => ({ backgroundColor: '' }) }

function setup (): { store: StoreImp, view: OverlayView, a: OverlayImp, b: OverlayImp, x: (i: number) => number, draw: () => void } {
  const store = new StoreImp({ layout: () => {}, updatePane: () => {} } as unknown as Chart)
  store.setSymbol({ ticker: 'AAA', pricePrecision: 2, volumePrecision: 0 } as SymbolInfo)
  store.setPeriod({ type: 'hour', span: 1 })
  const data: KLineData[] = []
  for (let i = 0; i < 20; i++) {
    data.push({ timestamp: ts(i), open: 100, high: 101, low: 99, close: 100, volume: 1 })
  }
  const loader: DataLoader = {
    getBars: p => { if (p.type === 'init') p.callback(data, { backward: false, forward: false }) },
    subscribeBar: () => {},
    unsubscribeBar: () => {},
    getRange: p => { p.callback([]) }
  }
  store.setDataLoader(loader)
  store.setTotalBarSpace(400)
  const axis = { convertFromPixel: (v: number) => v, convertToPixel: (v: number) => v }
  const chart = {
    getChartStore: () => store,
    getStyles: () => store.getStyles(),
    getXAxisPane: () => ({ getAxisComponent: () => axis }),
    getContainer: () => ({}),
    updatePane: () => {}
  }
  const pane = { getId: () => 'candle_pane', getChart: () => chart, getAxisComponent: () => axis }
  const widget = { getPane: () => pane, setForceCursor: () => {}, getBounding: () => ({ width: 400, height: 200, left: 0, top: 0 }) }
  const view = new OverlayView(widget as never)
  // Added B first, so A paints (and, unaided, hit-tests) on top.
  const [bId, aId] = store.addOverlays([
    { name: 'test-box', id: 'b', points: [{ timestamp: ts(2), value: 10 }, { timestamp: ts(6), value: 50 }] },
    { name: 'test-box', id: 'a', points: [{ timestamp: ts(4), value: 30 }, { timestamp: ts(8), value: 70 }] }
  ], [false, false])
  const find = (id: unknown): OverlayImp => store.getOverlaysByFilter({ id: id as string })[0]
  const x = (i: number): number => store.dataIndexToCoordinate(store.timestampToFloatIndex(ts(i)) ?? 0)
  return { store, view, a: find(aId), b: find(bId), x, draw: () => { view.draw(noopCtx) } }
}

const at = (x: number, y: number): MouseTouchEvent => ({ x, y, pageX: x, pageY: y })

const select = (store: StoreImp, overlay: OverlayImp): void => {
  store.setClickOverlayInfo(
    { paneId: 'candle_pane', overlay, figureType: 'other', figureIndex: 0, figure: null },
    () => false, () => false
  )
  store.setSelectedOverlayIds([overlay.id])
}

describe('overlapping drawings', () => {
  it('a press on the selected drawing\'s handle grabs that drawing, not the one painted over it', () => {
    const { store, view, b, x, draw } = setup()
    select(store, b)
    draw()
    // B's second point sits inside A's box.
    view.dispatchEvent('mouseDownEvent', at(x(6), 50))
    const pressed = store.getPressedOverlayInfo()
    expect(pressed.overlay?.id).toBe(b.id)
    expect(pressed.figureType).toBe('point')
  })

  it('clicking the overlap again walks down the stack and wraps', () => {
    const { store, view, a, b, x, draw } = setup()
    const overlap = at(x(5), 40)
    draw()
    view.dispatchEvent('mouseClickEvent', overlap)
    expect(store.getClickOverlayInfo().overlay?.id).toBe(a.id)
    draw()
    view.dispatchEvent('mouseClickEvent', overlap)
    expect(store.getClickOverlayInfo().overlay?.id).toBe(b.id)
    draw()
    view.dispatchEvent('mouseClickEvent', overlap)
    expect(store.getClickOverlayInfo().overlay?.id).toBe(a.id)
  })

  it('a click on a single unselected drawing selects it', () => {
    const { store, view, b, x, draw } = setup()
    draw()
    view.dispatchEvent('mouseMoveEvent', at(x(3), 20))
    draw()
    view.dispatchEvent('mouseClickEvent', at(x(3), 20))
    expect(store.getClickOverlayInfo().overlay?.id).toBe(b.id)
  })

  it('a selected overlay covering the pane doesn\'t keep the drawings from being clicked', () => {
    const { store, view, b, x, draw } = setup()
    // Painted under the drawings, as a host's chart UI might be, and held
    // in the selection set.
    const [coverId] = store.addOverlays([
      { name: 'test-box', id: 'cover', zLevel: -1, points: [{ timestamp: ts(0), value: 0 }, { timestamp: ts(19), value: 200 }] }
    ], [false])
    store.setSelectedOverlayIds([coverId as string])
    draw()
    // Only B and the cover are under this point: the click goes to B.
    view.dispatchEvent('mouseClickEvent', at(x(3), 20))
    expect(store.getClickOverlayInfo().overlay?.id).toBe(b.id)
  })

  it('a click outside the overlap keeps plain selection', () => {
    const { store, view, b, x, draw } = setup()
    select(store, b)
    draw()
    view.dispatchEvent('mouseClickEvent', at(x(3), 20))
    expect(store.getClickOverlayInfo().overlay?.id).toBe(b.id)
  })
})
