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
 * Ghost Feed — TradingView's `ghost_feed` (LineToolGhostFeed).
 *
 * Click a path of points (double-click finishes); between each consecutive
 * pair, one made-up candle per bar is drawn along the straight line between
 * them, for sketching a scenario. Candle shape follows TV's generator: a
 * random centre offset and range scaled by `averageHL` and `variance`.
 *
 * TV draws its candles with Math.random and stores them; here they come from
 * a seeded generator (`extendData.seed`, chosen when drawing finishes) so a
 * reload draws the same candles. TV's stored candles are not carried over.
 *
 * extendData: `{ averageHL, variance = 50, seed, upColor, downColor,
 * transparency = 50 (%, of the candles as a whole: body, border and wick), borderVisible = true, borderUpColor,
 * borderDownColor, wickVisible = true, wickColor }`.
 * averageHL is TV's unit (price × 10^pricePrecision); finishing the drawing
 * sets it to the chart's mean high-low range, as TV does, and absent it is
 * that same mean, taken live.
 */

import type Coordinate from '../../../../common/Coordinate'
import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { barFigures, barIndex, propertyStore, scaleAlpha } from './common'
import type { Figure, Ohlc } from './common'

export interface GhostFeedExtendData {
  averageHL?: number
  variance?: number
  seed?: number
  upColor?: string
  downColor?: string
  transparency?: number
  borderVisible?: boolean
  borderUpColor?: string
  borderDownColor?: string
  wickVisible?: boolean
  wickColor?: string
}

// TV's candleStyle defaults: light bodies, coloured borders, grey wicks and path.
const UP = '#ACE5DC'
const DOWN = '#FAA1A4'
const BORDER_UP = '#089981'
const BORDER_DOWN = '#F23645'
const WICK = '#787B86'
const PATH = '#787B86'
const SAME_VERTEX_PX = 4

/** Deterministic PRNG (mulberry32), so a ghost feed draws the same candles every frame. */
export function seededRandom (seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** TV's candle: offsets from the path price, with `average` in price units and `variance` in percent. */
export function ghostBar (average: number, variance: number, rand: () => number): Ohlc {
  const v = variance / 100
  const centre = average * (1 - 2 * rand()) * v
  const range = average * (1 + (0.5 - rand()) * v)
  const low = centre - range / 2
  return { low, high: low + range, open: low + rand() * range, close: low + rand() * range }
}

export interface GhostPoint { index: number, value: number }

/**
 * Candles along a path, in bar order. Segment 0 includes its first bar; later
 * segments start one bar on, as that bar already ended the previous segment
 * (and a segment leaves out its own last bar), like TV.
 */
export function ghostCandles (points: GhostPoint[], average: number, variance: number, seed: number): Array<{ index: number, bar: Ohlc }> {
  const rand = seededRandom(seed)
  const out: Array<{ index: number, bar: Ohlc }> = []
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s]
    const b = points[s + 1]
    if (a.index === b.index) continue
    const step = Math.sign(b.index - a.index)
    for (let i = s === 0 ? a.index : a.index + step; i !== b.index; i += step) {
      const centre = a.value + ((b.value - a.value) * (i - a.index)) / (b.index - a.index)
      const o = ghostBar(average, variance, rand)
      out.push({ index: i, bar: { open: centre + o.open, high: centre + o.high, low: centre + o.low, close: centre + o.close } })
    }
  }
  return out
}

interface Cached { key: string, candles: Array<{ index: number, bar: Ohlc }> }

export const ghostFeed = (): ProOverlayTemplate => {
  const store = propertyStore()
  const cache = new WeakMap<object, Cached>()
  return {
    name: 'ghostFeed',
    totalStep: Number.MAX_SAFE_INTEGER,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    completeDrawing: ({ overlay, chart }) => {
      // Drop the duplicate vertex a double-click leaves, and fix the seed.
      const points = overlay.points
      const px = chart.convertToPixel(points, { paneId: overlay.paneId }) as Array<Partial<Coordinate>>
      for (let i = points.length - 1; i > 0; i--) {
        if (Math.hypot((px[i].x ?? 0) - (px[i - 1].x ?? 0), (px[i].y ?? 0) - (px[i - 1].y ?? 0)) <= SAME_VERTEX_PX) {
          points.splice(i, 1)
          px.splice(i, 1)
        }
      }
      const ext = (overlay.extendData ?? {}) as GhostFeedExtendData
      const data = (chart as ChartImp).getDataList()
      const precision = (chart as ChartImp).getChartStore().getSymbol()?.pricePrecision ?? 2
      const mean = data.length > 0 ? data.reduce((sum, d) => sum + (d.high - d.low), 0) / data.length : 0
      overlay.extendData = {
        ...ext,
        seed: ext.seed ?? Math.floor(Math.random() * 2 ** 31),
        averageHL: ext.averageHL ?? Math.max(1, Math.round(mean * 10 ** precision))
      }
    },
    createPointFigures: (params) => {
      const { chart, overlay, yAxis, bounding, coordinates } = params as typeof params & { chart: ChartImp }
      if (yAxis === null || overlay.points.length < 2) return []
      const data = chart.getDataList()
      if (data.length === 0) return []
      const ext = (overlay.extendData ?? {}) as GhostFeedExtendData
      const pricePrecision = chart.getChartStore().getSymbol()?.pricePrecision ?? 2

      const path: GhostPoint[] = []
      for (const p of overlay.points) {
        const index = barIndex(chart, p)
        if (index !== null && typeof p.value === 'number') path.push({ index: Math.round(index), value: p.value })
      }
      let average = ext.averageHL !== undefined ? ext.averageHL / 10 ** pricePrecision : NaN
      if (!Number.isFinite(average)) {
        // ponytail: whole-series mean; fine until a chart holds enough bars for it to show.
        average = data.reduce((sum, d) => sum + (d.high - d.low), 0) / data.length
      }
      const variance = ext.variance ?? 50
      const seed = ext.seed ?? 1
      const key = `${path.map((p) => `${p.index}:${p.value}`).join(',')}|${average}|${variance}|${seed}`
      let cached = cache.get(overlay)
      if (cached?.key !== key) {
        cached = { key, candles: ghostCandles(path, average, variance, seed) }
        cache.set(overlay, cached)
      }

      const chartStore = chart.getChartStore()
      const half = Math.max(1, chartStore.getBarSpace().bar * 0.35)
      const y = (price: number): number => yAxis.convertToPixel(price)
      // TV draws the path itself as a thin grey line under the candles.
      const figures: Figure[] = [{ type: 'line', key: 'path', attrs: { coordinates }, styles: { color: PATH, size: 1, style: 'solid' } }]
      const alpha = 1 - (ext.transparency ?? 50) / 100
      for (const { index, bar } of cached.candles) {
        const x = chartStore.dataIndexToCoordinate(index)
        if (x < -half || x > bounding.width + half) continue
        const up = bar.close >= bar.open
        const solid = up ? (ext.upColor ?? UP) : (ext.downColor ?? DOWN)
        const border = ext.borderVisible === false ? null : scaleAlpha(up ? (ext.borderUpColor ?? BORDER_UP) : (ext.borderDownColor ?? BORDER_DOWN), alpha)
        const wick = ext.wickVisible === false ? null : scaleAlpha(ext.wickColor ?? WICK, alpha)
        figures.push(...barFigures('candle', `c_${index}`, x, half, bar, y, solid, scaleAlpha(solid, alpha), border, wick))
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
