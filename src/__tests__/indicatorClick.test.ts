import { describe, it, expect, vi } from 'vitest'
import IndicatorView, { columnHandleY, isNearPolyline } from '../view/IndicatorView'
import StoreImp from '../Store'
import { handleStep } from '../common/indicatorHandles'

/** A view over a fake pane, with `hits` as what the last frame painted. */
function view (hits: unknown[], listening = true) {
  const executeAction = vi.fn()
  const chartStore = { hasAction: (t: string) => listening && t === 'onIndicatorClick', executeAction }
  const pane = { getId: () => 'pane_rsi', getChart: () => ({ getChartStore: () => chartStore }) }
  const setForceCursor = vi.fn()
  const v = new IndicatorView({ getPane: () => pane, setForceCursor } as never)
  ;(v as unknown as { _indicatorHits: unknown[] })._indicatorHits = hits
  return { v, executeAction, setForceCursor }
}

const rsi = { id: 'i1', name: 'SCRIPT_s1_RSI' }
const ma = { id: 'i2', name: 'SCRIPT_s2' }
const line = (y: number) => [[{ x: 0, y }, { x: 100, y }]]

describe('clicking an indicator', () => {
  it('names the indicator whose line is under the click, and consumes the click', () => {
    const { v, executeAction } = view([{ indicator: rsi, lines: line(50), rects: [], circles: [] }])
    expect(v.checkEventOn({ x: 40, y: 52 } as never)).toBe(true)
    expect(v.dispatchEvent('mouseClickEvent', { x: 40, y: 52 } as never)).toBe(true)
    expect(executeAction).toHaveBeenCalledWith('onIndicatorClick', { id: 'i1', name: 'SCRIPT_s1_RSI', paneId: 'pane_rsi' })
  })

  it('takes the last drawn of two overlapping indicators', () => {
    const { v, executeAction } = view([
      { indicator: rsi, lines: line(50), rects: [], circles: [] },
      { indicator: ma, lines: line(51), rects: [], circles: [] },
    ])
    v.dispatchEvent('mouseClickEvent', { x: 40, y: 50 } as never)
    expect(executeAction).toHaveBeenCalledWith('onIndicatorClick', expect.objectContaining({ name: 'SCRIPT_s2' }))
  })

  it('hits columns and circles too', () => {
    const { v } = view([{ indicator: rsi, lines: [], rects: [{ x: 10, y: 10, width: 6, height: 40 }], circles: [{ x: 80, y: 20, r: 3 }] }])
    expect(v.checkEventOn({ x: 12, y: 30 } as never)).toBe(true)
    expect(v.checkEventOn({ x: 81, y: 21 } as never)).toBe(true)
  })

  it('leaves a click off every line to the chart', () => {
    const { v, executeAction } = view([{ indicator: rsi, lines: line(50), rects: [], circles: [] }])
    expect(v.dispatchEvent('mouseClickEvent', { x: 40, y: 90 } as never)).toBe(false)
    expect(executeAction).not.toHaveBeenCalledWith('onIndicatorClick', expect.anything())
  })

  it('claims nothing when no one listens, so the chart click still happens', () => {
    const { v } = view([{ indicator: rsi, lines: line(50), rects: [], circles: [] }], false)
    expect(v.dispatchEvent('mouseClickEvent', { x: 40, y: 50 } as never)).toBe(false)
  })
})

describe('the other gestures on an indicator', () => {
  const hits = [{ indicator: rsi, lines: line(50), rects: [], circles: [] }]

  it('a double-click and a right-click name it too, the right-click with where on the page', () => {
    const { v, executeAction } = view(hits)
    expect(v.dispatchEvent('mouseDoubleClickEvent', { x: 40, y: 50 } as never)).toBe(true)
    expect(executeAction).toHaveBeenCalledWith('onIndicatorDoubleClick', expect.objectContaining({ name: 'SCRIPT_s1_RSI' }))
    expect(v.dispatchEvent('mouseRightClickEvent', { x: 40, y: 50, pageX: 400, pageY: 300 } as never)).toBe(true)
    expect(executeAction).toHaveBeenCalledWith('onIndicatorRightClick', expect.objectContaining({ name: 'SCRIPT_s1_RSI', pageX: 400, pageY: 300 }))
  })

  it('hovering a plot shows the arrow, as tradingview.com does; elsewhere it leaves the cursor alone', () => {
    const { v, setForceCursor } = view(hits)
    expect(v.dispatchEvent('mouseMoveEvent', { x: 40, y: 51 } as never)).toBe(true)
    expect(setForceCursor).toHaveBeenCalledWith('default')
    setForceCursor.mockClear()
    expect(v.dispatchEvent('mouseMoveEvent', { x: 40, y: 90 } as never)).toBe(false)
    expect(setForceCursor).not.toHaveBeenCalled()
  })
})

describe('isNearPolyline', () => {
  const zig = Array.from({ length: 1000 }, (_, i) => ({ x: i * 4, y: i % 2 === 0 ? 0 : 40 }))

  it('finds a point on a long line by its segments near x', () => {
    expect(isNearPolyline({ x: 2, y: 20 }, zig, 3)).toBe(true)
    expect(isNearPolyline({ x: 2002, y: 20 }, zig, 3)).toBe(true)
    expect(isNearPolyline({ x: 2002, y: 60 }, zig, 3)).toBe(false)
  })

  it('handles a vertical step and the ends', () => {
    const step = [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 20, y: 30 }]
    expect(isNearPolyline({ x: 11, y: 20 }, step, 3)).toBe(true)
    expect(isNearPolyline({ x: -10, y: 10 }, step, 3)).toBe(false)
    expect(isNearPolyline({ x: 5, y: 5 }, [], 3)).toBe(false)
  })
})

describe('handleStep', () => {
  it('spaces handles about 120px apart (12 bars at 10px, measured there) at the zoom the indicator was selected at', () => {
    expect([5.9, 10, 37.7, 80, 200].map(handleStep)).toEqual([20, 12, 3, 2, 1])
    expect(handleStep(0)).toBeGreaterThan(1)
  })
})

describe('columnHandleY', () => {
  it('marks a column at its value end: the top above zero, the bottom below', () => {
    expect(columnHandleY(20, 50, 50)).toBe(20)
    expect(columnHandleY(50, 90, 50)).toBe(90)
    // Volume over the candles: zero is far below the pane, so the top.
    expect(columnHandleY(300, 380, 5000)).toBe(300)
  })
})

describe('the selected indicator\'s handle step', () => {
  const chart = { layout: () => {}, updatePane: () => {}, getDrawPaneById: () => null } as never

  it('is chosen when it is selected and kept through zooming, as on tradingview.com', () => {
    const store = new StoreImp(chart)
    store.setBarSpace(8)
    store.setSelectedIndicator('SCRIPT_s1_MACD')
    expect(store.getSelectedIndicatorHandleStep()).toBe(15)
    store.setBarSpace(4)
    expect(store.getSelectedIndicatorHandleStep()).toBe(15)
    // Selected again at the new zoom: a new step.
    store.setSelectedIndicator(null)
    store.setSelectedIndicator('SCRIPT_s1_MACD')
    expect(store.getSelectedIndicatorHandleStep()).toBe(30)
  })
})
