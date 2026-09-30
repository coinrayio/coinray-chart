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

/**
 * Bars Pattern — TradingView's `bars_pattern` (LineToolBarsPattern).
 *
 * Two clicks pick a range of candles. `completeDrawing` copies them into
 * `extendData.pattern` (TV stores the copy too, so the pattern survives the
 * source bars scrolling out or the symbol changing) and lifts the copy 5% of
 * the pane above the source. The copy is drawn from point 0's bar onwards, one
 * bar per row, and can be dragged anywhere:
 *
 *   0 anchor — the bar the copy starts at; the first bar's price sits here
 *   1 end    — sets the vertical scale: the last bar's price maps here
 *
 * extendData: `{ pattern: [open, high, low, close][], mode = 'bars', mirrored,
 * flipped }`. Modes follow TV: bars (OHLC bars), candles (open-close bodies),
 * line (close), lineOpen, lineHigh, lineLow, lineHl2. `mirrored` reverses the
 * copy in time, `flipped` turns it upside down.
 * Properties: lineColor, backgroundColor (candle body).
 */

import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { barFigures, barIndex, barRange, propertyStore } from './common'
import type { Figure, Ohlc } from './common'

export type BarsPatternMode = 'bars' | 'candles' | 'line' | 'lineOpen' | 'lineHigh' | 'lineLow' | 'lineHl2'

export interface BarsPatternExtendData {
  pattern?: Array<[number, number, number, number]>
  mode?: BarsPatternMode
  mirrored?: boolean
  flipped?: boolean
}

const COLOR = '#2962FF'
const FILL = 'rgba(41, 98, 255, 0.4)'
/** How far above the source the fresh copy is lifted, as a share of the pane height. */
const LIFT = 0.05

const asBar = (r: [number, number, number, number]): Ohlc => ({ open: r[0], high: r[1], low: r[2], close: r[3] })

/** The pattern with TV's mirror (reverse in time) and flip (invert prices) applied. */
export function orientPattern (pattern: Array<[number, number, number, number]>, mirrored: boolean, flipped: boolean): Ohlc[] {
  let bars = pattern.map(asBar)
  if (mirrored) bars = bars.reverse()
  if (flipped) {
    const top = Math.max(...bars.map((b) => b.high))
    const bottom = Math.min(...bars.map((b) => b.low))
    const flip = (v: number): number => top + bottom - v
    bars = bars.map((b) => ({ open: flip(b.open), high: flip(b.low), low: flip(b.high), close: flip(b.close) }))
  }
  return bars
}

/** Price a bar contributes to the line modes (and the pattern's ends). */
export function patternPrice (bar: Ohlc, mode: BarsPatternMode): number {
  switch (mode) {
    case 'lineOpen': return bar.open
    case 'lineHigh': return bar.high
    case 'lineLow': return bar.low
    case 'lineHl2': return (bar.high + bar.low) / 2
    default: return bar.close
  }
}

/** TV's first / last pattern prices: the anchors the two points pin (bars: first high, last low). */
export function patternEnds (bars: Ohlc[], mode: BarsPatternMode): { first: number, last: number } {
  const first = bars[0]
  const last = bars[bars.length - 1]
  if (mode === 'bars') return { first: first.high, last: last.low }
  if (mode === 'candles') return { first: first.open, last: last.close }
  return { first: patternPrice(first, mode), last: patternPrice(last, mode) }
}

export const barsPattern = (): ProOverlayTemplate => {
  const store = propertyStore()
  return {
    name: 'barsPattern',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    completeDrawing: ({ overlay, chart: raw }) => {
      const chart = raw as ChartImp
      const ext = (overlay.extendData ?? {}) as BarsPatternExtendData
      if (ext.pattern !== undefined || overlay.points.length < 2) return
      const data = chart.getDataList()
      const a = barIndex(chart, overlay.points[0])
      const b = barIndex(chart, overlay.points[1])
      const range = a !== null && b !== null ? barRange(a, b, data.length) : null
      if (range === null) return
      const pattern = data.slice(range.from, range.to + 1).map((d): [number, number, number, number] => [d.open, d.high, d.low, d.close])
      const { first, last } = patternEnds(pattern.map(asBar), ext.mode ?? 'bars')
      // Lift the copy off its source by 5% of the pane height.
      const at = chart.convertToPixel({ value: first }, { paneId: overlay.paneId }) as { y?: number }
      const size = chart.getSize(overlay.paneId, 'main')
      let start = first
      if (typeof at.y === 'number' && size !== null) {
        const lifted = chart.convertFromPixel([{ y: at.y - LIFT * size.height }], { paneId: overlay.paneId }) as Array<{ value?: number }>
        start = lifted[0].value ?? first
      }
      const stamp = (i: number): number => data[Math.min(data.length - 1, i)].timestamp
      overlay.extendData = { ...ext, pattern }
      overlay.points = [
        { timestamp: stamp(range.from), dataIndex: range.from, value: start },
        { timestamp: stamp(range.to), dataIndex: range.to, value: start + (last - first) }
      ]
    },
    createPointFigures: (params) => {
      const { chart, overlay, coordinates, yAxis, bounding } = params as typeof params & { chart: ChartImp }
      if (coordinates.length < 1 || yAxis === null) return []
      const ext = (overlay.extendData ?? {}) as BarsPatternExtendData
      const props = store.get(overlay.id)
      const color = props.lineColor ?? COLOR
      if (ext.pattern === undefined || ext.pattern.length === 0) {
        // Still picking the range: shade it.
        if (coordinates.length < 2) return []
        const [a, b] = coordinates
        return [{ type: 'rect', key: 'range', attrs: { x: Math.min(a.x, b.x), y: 0, width: Math.abs(b.x - a.x), height: bounding.height }, styles: { style: 'fill', color: FILL, borderSize: 0 }, ignoreEvent: true }]
      }
      const i0 = barIndex(chart, overlay.points[0])
      const v0 = overlay.points[0].value
      if (i0 === null || typeof v0 !== 'number') return []

      const mode = ext.mode ?? 'bars'
      const bars = orientPattern(ext.pattern, ext.mirrored === true, ext.flipped === true)
      const { first, last } = patternEnds(bars, mode)
      const v1 = overlay.points[1]?.value
      // The second point scales the pattern vertically; a flat pattern stays 1:1.
      const factor = typeof v1 === 'number' && last !== first ? (v1 - v0) / (last - first) : 1
      const y = (price: number): number => yAxis.convertToPixel(v0 + (price - first) * factor)
      const chartStore = chart.getChartStore()
      const half = Math.max(1, chartStore.getBarSpace().bar * 0.35)
      const fill = props.backgroundColor ?? FILL

      const figures: Figure[] = []
      if (mode === 'bars' || mode === 'candles') {
        bars.forEach((bar, k) => {
          const x = chartStore.dataIndexToCoordinate(i0 + k)
          if (x < -half || x > bounding.width + half) return
          figures.push(...barFigures(mode === 'bars' ? 'bar' : 'candle', `bar_${k}`, x, half, bar, y, color, fill))
        })
      } else {
        figures.push({ type: 'line', key: 'line', attrs: { coordinates: bars.map((bar, k) => ({ x: chartStore.dataIndexToCoordinate(i0 + k), y: y(patternPrice(bar, mode)) })) }, styles: { color, size: 2, style: 'solid' } })
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
