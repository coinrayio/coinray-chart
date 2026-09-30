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
 * Anchored VWAP — TradingView's `anchored_vwap` (LineToolAnchoredVWAP).
 *
 * One click sets the anchor bar. The volume-weighted average price is
 * accumulated from the anchor to the last bar, so it keeps extending as new
 * bars arrive. Optional bands sit ± multiplier × the volume-weighted standard
 * deviation of price around the VWAP.
 *
 * The cumulative series is cached per overlay against the anchor, the data
 * fingerprint and the source, so a static chart only pays for pixel mapping of
 * the visible bars.
 *
 * Properties: lineColor, lineWidth, lineStyle.
 * extendData: `{ source = 'hlc3', bands = [{ multiplier, color }], bandFillColor }`.
 * TV draws bands off by default; bands lists only the enabled ones.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { KLineData } from '../../../../common/Data'
import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { barIndex, dataKey, propertyStore } from './common'
import type { Figure } from './common'

export type VwapSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4'

export interface VwapBand { multiplier: number, color?: string }

export interface AnchoredVwapExtendData {
  source?: VwapSource
  bands?: VwapBand[]
  bandFillColor?: string
}

// TV defaults.
const LINE_COLOR = '#1e88e5'
const BAND_COLORS = ['#4caf50', '#808000', '#00897b']
const BAND_FILL = 'rgba(76, 175, 80, 0.05)'

export function sourcePrice (bar: KLineData, source: VwapSource): number {
  switch (source) {
    case 'open': return bar.open
    case 'high': return bar.high
    case 'low': return bar.low
    case 'close': return bar.close
    case 'hl2': return (bar.high + bar.low) / 2
    case 'ohlc4': return (bar.open + bar.high + bar.low + bar.close) / 4
    default: return (bar.high + bar.low + bar.close) / 3
  }
}

/**
 * Running VWAP and volume-weighted standard deviation from bar `from` to the
 * end of `bars`; entry k belongs to bar `from + k`. A bar with no volume
 * counts as weight 0, so a volume-less feed yields NaN, not a wrong line.
 */
export function vwapSeries (bars: KLineData[], from: number, source: VwapSource): { vwap: number[], sd: number[] } {
  const vwap: number[] = []
  const sd: number[] = []
  let pv = 0
  let pv2 = 0
  let v = 0
  for (let i = from; i < bars.length; i++) {
    const p = sourcePrice(bars[i], source)
    const w = bars[i].volume ?? 0
    pv += p * w
    pv2 += p * p * w
    v += w
    const mean = v > 0 ? pv / v : NaN
    vwap.push(mean)
    sd.push(v > 0 ? Math.sqrt(Math.max(0, pv2 / v - mean * mean)) : NaN)
  }
  return { vwap, sd }
}

interface Cached { key: string, series: { vwap: number[], sd: number[] } }

export const anchoredVwap = (): ProOverlayTemplate => {
  const store = propertyStore()
  // Keyed by the overlay object so a removed overlay takes its cache with it.
  const cache = new WeakMap<object, Cached>()
  return {
    name: 'anchoredVwap',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: (params) => {
      const { chart, overlay, yAxis } = params as typeof params & { chart: ChartImp }
      if (overlay.points.length === 0 || yAxis === null) return []
      const chartStore = chart.getChartStore()
      const data = chart.getDataList()
      const anchor = barIndex(chart, overlay.points[0])
      if (anchor === null || data.length === 0 || anchor > data.length - 1) return []
      const from = Math.max(0, Math.round(anchor))
      const ext = (overlay.extendData ?? {}) as AnchoredVwapExtendData
      const source = ext.source ?? 'hlc3'

      const key = `${from}|${dataKey(data)}|${source}`
      let cached = cache.get(overlay)
      if (cached?.key !== key) {
        cached = { key, series: vwapSeries(data, from, source) }
        cache.set(overlay, cached)
      }
      const { vwap, sd } = cached.series

      // Only the visible bars (plus one either side) are mapped to pixels.
      const range = chartStore.getVisibleRange()
      const start = Math.max(from, range.from - 1)
      const end = Math.min(data.length - 1, range.to + 1)
      const line = (offset: (k: number) => number): Coordinate[] => {
        const out: Coordinate[] = []
        for (let i = start; i <= end; i++) {
          const value = offset(i - from)
          if (Number.isFinite(value)) out.push({ x: chartStore.dataIndexToCoordinate(i), y: yAxis.convertToPixel(value) })
        }
        return out
      }

      const props = store.get(overlay.id)
      const style = {
        style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
        dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
      }
      const figures: Figure[] = []
      ;(ext.bands ?? []).forEach((band, n) => {
        const upper = line((k) => vwap[k] + band.multiplier * sd[k])
        const lower = line((k) => vwap[k] - band.multiplier * sd[k])
        const color = band.color ?? BAND_COLORS[n % BAND_COLORS.length]
        if (n === 0 && upper.length > 1) {
          figures.push({ type: 'polygon', key: 'band_fill', attrs: { coordinates: [...upper, ...lower.slice().reverse()] }, styles: { style: 'fill', color: ext.bandFillColor ?? BAND_FILL }, ignoreEvent: true })
        }
        figures.push(
          { type: 'line', key: `upper_${n}`, attrs: { coordinates: upper }, styles: { ...style, color, size: 1 } },
          { type: 'line', key: `lower_${n}`, attrs: { coordinates: lower }, styles: { ...style, color, size: 1 } }
        )
      })
      figures.push({ type: 'line', key: 'vwap', attrs: { coordinates: line((k) => vwap[k]) }, styles: { ...style, color: props.lineColor ?? LINE_COLOR, size: props.lineWidth ?? 1 } })
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
