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
 * On intraday charts the accumulation restarts at each new trading day (the chart's
 * timezone), as TV's does; on daily and longer charts it runs on unbroken.
 *
 * The cumulative series is cached per overlay against the anchor, the data
 * fingerprint and the source, so a static chart only pays for pixel mapping of
 * the visible bars.
 *
 * Properties: lineColor, lineWidth, lineStyle.
 * extendData: `{ source = 'hlc3', bandsMode = 'stdev' | 'percent', bandFillColor,
 * bandFillOn = true, showPriceLabel = true }` and, for n = 1..3, the flat keys
 * `band{n}On` (off unless set; finishing the drawing sets band 1 on, as TV),
 * `band{n}Multiplier` (n), and per side `lower{n}` / `upper{n}` + `On`
 * (true), `Color`, `Width` (1), `Style` ('solid'), `DashedValue`. The older `bands = [{ multiplier, color }]`
 * list (only the enabled bands) is read when none of the flat keys is set.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { KLineData } from '../../../../common/Data'
import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { formatPrecision } from '../../../../common/utils/format'
import { barIndex, dataKey, propertyStore } from './common'
import type { Figure } from './common'

export type VwapSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4'

export interface VwapBand { multiplier: number, color?: string }

export interface AnchoredVwapExtendData {
  source?: VwapSource
  bands?: VwapBand[]
  bandsMode?: 'stdev' | 'percent'
  bandFillColor?: string
  bandFillOn?: boolean
  showPriceLabel?: boolean
}

interface ResolvedBand { multiplier: number, lower: BandLine | null, upper: BandLine | null }
interface BandLine { color: string, width: number, style: string, dash: number[] }

/** The bands to draw, from the flat keys or, absent those, the legacy list. */
export function resolveBands (ext: AnchoredVwapExtendData): ResolvedBand[] {
  const e = ext as Record<string, unknown>
  const flat = [1, 2, 3].some((n) => e[`band${n}On`] !== undefined || e[`band${n}Multiplier`] !== undefined)
  const out: ResolvedBand[] = []
  ;[1, 2, 3].forEach((n) => {
    const legacy = flat ? undefined : ext.bands?.[n - 1]
    if (flat ? e[`band${n}On`] !== true : legacy === undefined) return
    const side = (name: string): BandLine | null => e[`${name}${n}On`] === false
      ? null
      : {
          color: (e[`${name}${n}Color`] as string | undefined) ?? legacy?.color ?? BAND_COLORS[n - 1],
          width: Number(e[`${name}${n}Width`] ?? 1),
          style: (e[`${name}${n}Style`] as string | undefined) ?? 'solid',
          dash: (e[`${name}${n}DashedValue`] as number[] | undefined) ?? [4, 4]
        }
    out.push({ multiplier: Number(e[`band${n}Multiplier`] ?? legacy?.multiplier ?? n), lower: side('lower'), upper: side('upper') })
  })
  return out
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
 * end of `bars`; entry k belongs to bar `from + k`. With `sessionOf`, the sums restart
 * whenever it names a new session, as TV's does on intraday charts. A bar with no volume
 * counts as weight 0, so a volume-less feed yields NaN, not a wrong line.
 */
export function vwapSeries (bars: KLineData[], from: number, source: VwapSource, sessionOf?: (timestamp: number) => string): { vwap: number[], sd: number[] } {
  const vwap: number[] = []
  const sd: number[] = []
  let pv = 0
  let pv2 = 0
  let v = 0
  let session = sessionOf?.(bars[from]?.timestamp ?? 0)
  for (let i = from; i < bars.length; i++) {
    if (sessionOf !== undefined) {
      // TV restarts the sums at the first bar of each trading session (intraday charts only).
      const now = sessionOf(bars[i].timestamp)
      if (now !== session) {
        session = now
        pv = pv2 = v = 0
      }
    }
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
    completeDrawing: ({ overlay }) => {
      const ext = (overlay.extendData ?? {}) as AnchoredVwapExtendData
      if (resolveBands(ext).length === 0 && ext.bands === undefined) overlay.extendData = { ...ext, band1On: true }
    },
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

      // TV resets per trading session on intraday charts; a daily or longer bar is a whole session, so no reset there.
      const intraday = ['second', 'minute', 'hour'].includes(chartStore.getPeriod()?.type ?? 'day')
      const timezone = chart.getTimezone()
      const key = `${from}|${dataKey(data)}|${source}|${intraday ? timezone : ''}`
      let cached = cache.get(overlay)
      if (cached?.key !== key) {
        const day = intraday ? new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }) : null
        cached = { key, series: vwapSeries(data, from, source, day === null ? undefined : (ts) => day.format(ts)) }
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
      const spread = (k: number): number => (ext.bandsMode === 'percent' ? vwap[k] * 0.01 : sd[k])
      resolveBands(ext).forEach((band, n) => {
        const upper = line((k) => vwap[k] + band.multiplier * spread(k))
        const lower = line((k) => vwap[k] - band.multiplier * spread(k))
        if (n === 0 && upper.length > 1 && ext.bandFillOn !== false) {
          figures.push({ type: 'polygon', key: 'band_fill', attrs: { coordinates: [...upper, ...lower.slice().reverse()] }, styles: { style: 'fill', color: ext.bandFillColor ?? BAND_FILL }, ignoreEvent: true })
        }
        if (band.upper !== null) figures.push({ type: 'line', key: `upper_${n}`, attrs: { coordinates: upper }, styles: { color: band.upper.color, size: band.upper.width, style: band.upper.style, dashedValue: band.upper.dash } })
        if (band.lower !== null) figures.push({ type: 'line', key: `lower_${n}`, attrs: { coordinates: lower }, styles: { color: band.lower.color, size: band.lower.width, style: band.lower.style, dashedValue: band.lower.dash } })
      })
      figures.push({ type: 'line', key: 'vwap', attrs: { coordinates: line((k) => vwap[k]) }, styles: { ...style, color: props.lineColor ?? LINE_COLOR, size: props.lineWidth ?? 1 } })
      return figures
    },
    // The VWAP's last value on the price axis, in the line's colour.
    createYAxisFigures: ({ chart, overlay, bounding, yAxis }) => {
      const last = cache.get(overlay)?.series.vwap.at(-1)
      if ((overlay.extendData as AnchoredVwapExtendData | undefined)?.showPriceLabel === false || yAxis === null || last === undefined || !Number.isFinite(last)) return []
      const fromZero = yAxis.isFromZero()
      const text = chart.getDecimalFold().format(chart.getThousandsSeparator().format(formatPrecision(last, chart.getSymbol()?.pricePrecision ?? 2)))
      return [{
        type: 'text',
        attrs: { x: fromZero ? 0 : bounding.width, y: yAxis.convertToPixel(last), text, align: fromZero ? 'left' : 'right', baseline: 'middle' },
        styles: { color: '#ffffff', size: 12, backgroundColor: store.get(overlay.id).lineColor ?? LINE_COLOR, borderRadius: 2, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 },
        ignoreEvent: true
      }]
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
