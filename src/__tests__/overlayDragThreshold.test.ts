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

// Dragging an existing drawing, as on TradingView: a press must travel a few
// pixels before the drawing moves, and on touch a drawing has to be selected
// (tapped) before a finger can drag it; otherwise the finger pans the chart.
registerOverlay({
  name: 'test-drag-box',
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

function setup (): { store: StoreImp, view: OverlayView, a: OverlayImp, x: (i: number) => number, draw: () => void } {
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
  const [, aId] = store.addOverlays([
    { name: 'test-drag-box', id: 'b', points: [{ timestamp: ts(2), value: 10 }, { timestamp: ts(6), value: 50 }] },
    { name: 'test-drag-box', id: 'a', points: [{ timestamp: ts(4), value: 30 }, { timestamp: ts(8), value: 70 }] }
  ], [false, false])
  const find = (id: unknown): OverlayImp => store.getOverlaysByFilter({ id: id as string })[0]
  const x = (i: number): number => store.dataIndexToCoordinate(store.timestampToFloatIndex(ts(i)) ?? 0)
  return { store, view, a: find(aId), x, draw: () => { view.draw(noopCtx) } }
}

const at = (x: number, y: number): MouseTouchEvent => ({ x, y, pageX: x, pageY: y })

const touch = (x: number, y: number): MouseTouchEvent => ({ ...at(x, y), isTouch: true })
const valueOf = (o: OverlayImp): number => o.points[0].value as number

describe('dragging an existing drawing', () => {
  it('a mouse press on an unselected drawing grabs it', () => {
    const { store, view, a, x, draw } = setup()
    draw()
    expect(view.dispatchEvent('mouseDownEvent', at(x(5), 40))).toBe(true)
    expect(store.getPressedOverlayInfo().overlay?.id).toBe(a.id)
  })

  it('a mouse press does not move the drawing until it travels past the threshold', () => {
    const { view, a, x, draw } = setup()
    draw()
    const before = valueOf(a)
    view.dispatchEvent('mouseDownEvent', at(x(5), 40))
    // Consumed, so the chart doesn't pan under a press that stays put.
    expect(view.dispatchEvent('pressedMouseMoveEvent', at(x(5), 42))).toBe(true)
    expect(view.dispatchEvent('pressedMouseMoveEvent', at(x(5) + 2, 42))).toBe(true)
    expect(valueOf(a)).toBe(before)
  })

  it('past the threshold the drawing jumps to the full offset from the press', () => {
    const { view, a, x, draw } = setup()
    draw()
    const before = valueOf(a)
    view.dispatchEvent('mouseDownEvent', at(x(5), 40))
    view.dispatchEvent('pressedMouseMoveEvent', at(x(5), 42))
    view.dispatchEvent('pressedMouseMoveEvent', at(x(5), 50))
    expect(valueOf(a) - before).toBeCloseTo(10)
    // Once moving, it follows every pixel, back inside the threshold too.
    view.dispatchEvent('pressedMouseMoveEvent', at(x(5), 41))
    expect(valueOf(a) - before).toBeCloseTo(1)
  })

  it('the threshold resets with the next press', () => {
    const { view, a, x, draw } = setup()
    draw()
    view.dispatchEvent('mouseDownEvent', at(x(5), 40))
    view.dispatchEvent('pressedMouseMoveEvent', at(x(5), 50))
    view.dispatchEvent('mouseUpEvent', at(x(5), 50))
    draw()
    const before = valueOf(a)
    view.dispatchEvent('mouseDownEvent', at(x(5), 50))
    view.dispatchEvent('pressedMouseMoveEvent', at(x(5), 52))
    expect(valueOf(a)).toBe(before)
  })

  it('a finger on an unselected drawing is left to pan the chart', () => {
    const { store, view, x, draw } = setup()
    draw()
    expect(view.dispatchEvent('mouseDownEvent', touch(x(5), 40))).toBe(false)
    expect(store.getPressedOverlayInfo().overlay).toBeNull()
  })

  it('a tap selects the drawing, then a finger drags it past a wider threshold', () => {
    const { store, view, a, x, draw } = setup()
    draw()
    expect(view.dispatchEvent('mouseClickEvent', touch(x(5), 40))).toBe(true)
    expect(store.getClickOverlayInfo().overlay?.id).toBe(a.id)
    draw()
    const before = valueOf(a)
    expect(view.dispatchEvent('mouseDownEvent', touch(x(5), 40))).toBe(true)
    // 6px moves a mouse drag but not a finger.
    view.dispatchEvent('pressedMouseMoveEvent', touch(x(5), 46))
    expect(valueOf(a)).toBe(before)
    view.dispatchEvent('pressedMouseMoveEvent', touch(x(5), 52))
    expect(valueOf(a) - before).toBeCloseTo(12)
  })

  it('a chart control that opts in is dragged by a finger without selecting it', () => {
    const { store, view, a, x, draw } = setup()
    store.overrideOverlay({ id: a.id, dragUnselectedOnTouch: true })
    draw()
    expect(view.dispatchEvent('mouseDownEvent', touch(x(5), 40))).toBe(true)
    expect(store.getPressedOverlayInfo().overlay?.id).toBe(a.id)
  })

  it('a finger on a locked drawing still pans, selected or not', () => {
    const { store, view, a, x, draw } = setup()
    store.overrideOverlay({ id: a.id, lock: true })
    draw()
    // Inside A only: B, under A, would otherwise take the press.
    view.dispatchEvent('mouseClickEvent', touch(x(7), 60))
    expect(store.getClickOverlayInfo().overlay?.id).toBe(a.id)
    draw()
    expect(view.dispatchEvent('mouseDownEvent', touch(x(7), 60))).toBe(false)
  })
})
