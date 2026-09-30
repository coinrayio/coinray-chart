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
 * Fixed Range Volume Profile — TradingView's `fixed_range_volume_profile`
 * (LineToolFixedRangeVolumeProfile, and the older LineToolVbPFixed).
 *
 * Two points span the time range. The price range of the bars inside it is
 * cut into `rows` equal rows; each bar's volume is spread over the rows its
 * high-low range covers, split into up (close >= open) and down volume. The
 * histogram grows from one side of the box, the point of control (POC, the
 * busiest row) gets a line, and the value area is the run of rows around the
 * POC holding `vaPercent` of the volume (CME's two-rows-at-a-time rule).
 *
 * Delta mode is TV's (see the row loop): |up - down| then the matched volume twice, fading. Known gap: TV builds the profile from
 * lower-timeframe bars; this only has the chart's own, so a bar's volume is
 * assumed even across its range and counted up or down by its close vs open.
 *
 * Cached per overlay against the bar range, data fingerprint and settings.
 *
 * Properties: lineColor, lineWidth, lineStyle (POC line), backgroundColor (box).
 * extendData: `{ rows = 24 (the row count, or the ticks per row when rowsLayout is
 * 'ticks'), rowsLayout = 'number' | 'ticks', vaPercent = 70, volumeMode = 'upDown' | 'total' | 'delta',
 * widthPercent = 30, direction = 'left' | 'right', showPoc = true,
 * upColor, downColor, vaUpColor, vaDownColor }`.
 */

import type { KLineData } from '../../../../common/Data'
import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { barIndex, barRange, dataKey, propertyStore, scaleAlpha } from './common'
import type { Figure } from './common'

export interface VolumeProfileExtendData {
  rows?: number
  rowsLayout?: 'number' | 'ticks'
  vaPercent?: number
  volumeMode?: 'upDown' | 'total' | 'delta'
  widthPercent?: number
  direction?: 'left' | 'right'
  showPoc?: boolean
  upColor?: string
  downColor?: string
  vaUpColor?: string
  vaDownColor?: string
}

// TV defaults (colour + transparency folded into alpha).
const UP = 'rgba(21, 146, 230, 0.24)'
const DOWN = 'rgba(251, 193, 35, 0.24)'
const VA_UP = 'rgba(21, 146, 230, 0.7)'
const VA_DOWN = 'rgba(251, 193, 35, 0.7)'
const POC = '#ff0000'
const BOX = 'rgba(55, 166, 239, 0.06)'
const MAX_ROWS = 6000

export interface ProfileRow { low: number, high: number, up: number, down: number }

export interface VolumeProfile {
  rows: ProfileRow[]
  /** Index of the point-of-control row. */
  poc: number
  /** First and last row of the value area, inclusive. */
  vaFrom: number
  vaTo: number
}

/** Volume by price over bars `from..to` (inclusive), or null when the range has no price extent. */
/**
 * `tickSize` set means `rowCount` is ticks per row, and the number of rows follows from the price range.
 * TV's layouts: with a row count, rows split the price range evenly from its low; with ticks per row, rows are
 * `ticks × tick` wide and sit on multiples of that width (so the first starts at or below the low).
 */
export function buildProfile (bars: KLineData[], from: number, to: number, rowCount: number, vaPercent: number, tickSize?: number): VolumeProfile | null {
  let low = Infinity
  let high = -Infinity
  for (let i = from; i <= to; i++) {
    low = Math.min(low, bars[i].low)
    high = Math.max(high, bars[i].high)
  }
  if (!(high > low)) return null
  const eps = 1e-9
  const width = tickSize === undefined ? 0 : rowCount * tickSize
  const first = tickSize === undefined ? 0 : Math.floor(low / width + eps)
  const n = Math.min(MAX_ROWS, Math.max(1, tickSize === undefined ? Math.round(rowCount) : Math.ceil(high / width - eps) - first))
  const size = tickSize === undefined ? (high - low) / n : width
  const origin = tickSize === undefined ? low : first * width
  const rows: ProfileRow[] = Array.from({ length: n }, (_, r) => ({ low: origin + r * size, high: origin + (r + 1) * size, up: 0, down: 0 }))

  for (let i = from; i <= to; i++) {
    const bar = bars[i]
    const volume = bar.volume ?? 0
    if (volume <= 0) continue
    const side = bar.close >= bar.open ? 'up' : 'down'
    const r0 = Math.max(0, Math.min(n - 1, Math.floor((bar.low - origin) / size + eps)))
    const r1 = Math.max(r0, Math.min(n - 1, Math.ceil((bar.high - origin) / size - eps) - 1))
    if (bar.high === bar.low) {
      rows[r0][side] += volume
      continue
    }
    const span = bar.high - bar.low
    for (let r = r0; r <= r1; r++) {
      const overlap = Math.min(bar.high, rows[r].high) - Math.max(bar.low, rows[r].low)
      if (overlap > 0) rows[r][side] += (volume * overlap) / span
    }
  }

  const total = rows.map((r) => r.up + r.down)
  // TV's POC: the busiest row; among equals, the one nearest the middle of the profile (the earlier on a tie).
  const busiest = Math.max(...total)
  const middle = (rows[0].low + rows[n - 1].high) / 2
  const centre = (r: number): number => Math.abs((rows[r].low + rows[r].high) / 2 - middle)
  let poc = -1
  for (let r = n - 1; r >= 0; r--) if (total[r] === busiest && (poc === -1 || centre(r) <= centre(poc))) poc = r
  // TV's value area: from the POC, take the bigger of the next row below and above (the nearer to the POC on
  // a tie), and stop before the row that would take it past `vaPercent` of the volume.
  const target = (total.reduce((a, b) => a + b, 0) * vaPercent) / 100
  let start = poc - 1
  let end = poc + 1
  let acc = total[poc]
  let next = 0
  let taken: 'below' | 'above' | null = null
  while (acc + next <= target) {
    acc += next
    if (taken === 'below') start--
    else if (taken === 'above') end++
    if (start === -1 && end === n) break
    if (start > -1 && (end >= n || total[start] > total[end] || (total[start] === total[end] && poc - start < end - poc))) {
      next = total[start]
      taken = 'below'
    } else {
      next = total[end]
      taken = 'above'
    }
  }
  const vaFrom = start + 1
  const vaTo = end - 1
  return { rows, poc, vaFrom, vaTo }
}

interface Cached { key: string, profile: VolumeProfile | null }

export const fixedRangeVolumeProfile = (): ProOverlayTemplate => {
  const store = propertyStore()
  const cache = new WeakMap<object, Cached>()
  return {
    name: 'fixedRangeVolumeProfile',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: (params) => {
      const { chart, overlay, coordinates, yAxis } = params as typeof params & { chart: ChartImp }
      if (coordinates.length < 2 || yAxis === null) return []
      const data = chart.getDataList()
      const i0 = barIndex(chart, overlay.points[0])
      const i1 = barIndex(chart, overlay.points[1])
      const range = i0 !== null && i1 !== null ? barRange(i0, i1, data.length) : null
      if (range === null) return []

      const ext = (overlay.extendData ?? {}) as VolumeProfileExtendData
      const rows = ext.rows ?? 24
      const vaPercent = ext.vaPercent ?? 70
      const tickSize = ext.rowsLayout === 'ticks' ? 10 ** -(chart.getChartStore().getSymbol()?.pricePrecision ?? 2) : undefined
      const key = `${range.from}|${range.to}|${dataKey(data)}|${rows}|${vaPercent}|${tickSize}`
      let cached = cache.get(overlay)
      if (cached?.key !== key) {
        cached = { key, profile: buildProfile(data, range.from, range.to, rows, vaPercent, tickSize) }
        cache.set(overlay, cached)
      }
      const { profile } = cached
      if (profile === null) return []

      const props = store.get(overlay.id)
      const x0 = Math.min(coordinates[0].x, coordinates[1].x)
      const x1 = Math.max(coordinates[0].x, coordinates[1].x)
      const fromRight = ext.direction === 'right'
      const maxLength = ((x1 - x0) * (ext.widthPercent ?? 30)) / 100
      const busiest = profile.rows[profile.poc].up + profile.rows[profile.poc].down
      const mode = ext.volumeMode ?? 'upDown'
      const upDown = mode === 'upDown'
      const figures: Figure[] = []

      const top = yAxis.convertToPixel(profile.rows[profile.rows.length - 1].high)
      const bottom = yAxis.convertToPixel(profile.rows[0].low)
      figures.push({ type: 'rect', key: 'box', attrs: { x: x0, y: Math.min(top, bottom), width: x1 - x0, height: Math.abs(bottom - top) }, styles: { style: 'fill', color: props.backgroundColor ?? BOX, borderSize: 0 } })

      profile.rows.forEach((row, r) => {
        const inside = r >= profile.vaFrom && r <= profile.vaTo
        const y1 = yAxis.convertToPixel(row.high)
        const y2 = yAxis.convertToPixel(row.low)
        const y = Math.min(y1, y2)
        const height = Math.max(1, Math.abs(y2 - y1) - 1)
        const upLength = busiest > 0 ? (maxLength * (upDown ? row.up : row.up + row.down)) / busiest : 0
        const downLength = upDown && busiest > 0 ? (maxLength * row.down) / busiest : 0
        if (mode === 'delta') {
          // TV's Delta (measured on its canvas): the row's whole volume in the colour of its net side, as three
          // runs from the baseline: |up - down| at full alpha, then the matched volume, min(up, down) twice,
          // at half and at a quarter of it.
          const net = row.up - row.down
          const color = net >= 0 ? (inside ? (ext.vaUpColor ?? VA_UP) : (ext.upColor ?? UP)) : (inside ? (ext.vaDownColor ?? VA_DOWN) : (ext.downColor ?? DOWN))
          const lengths = [Math.abs(net), Math.min(row.up, row.down), Math.min(row.up, row.down)].map((v) => (busiest > 0 ? (maxLength * v) / busiest : 0))
          let start = 0
          lengths.forEach((length, k) => {
            if (length > 0) figures.push({ type: 'rect', key: `delta_${r}_${k}`, attrs: { x: fromRight ? x1 - start - length : x0 + start, y, width: length, height }, styles: { style: 'fill', color: scaleAlpha(color, [1, 0.5, 0.25][k]), borderSize: 0 } })
            start += length
          })
          return
        }
        const segment = (start: number, length: number, color: string, k: string): void => {
          if (length <= 0) return
          figures.push({ type: 'rect', key: `${k}_${r}`, attrs: { x: fromRight ? x1 - start - length : x0 + start, y, width: length, height }, styles: { style: 'fill', color, borderSize: 0 } })
        }
        segment(0, upLength, inside ? (ext.vaUpColor ?? VA_UP) : (ext.upColor ?? UP), 'up')
        segment(upLength, downLength, inside ? (ext.vaDownColor ?? VA_DOWN) : (ext.downColor ?? DOWN), 'down')
      })

      if (ext.showPoc !== false) {
        const row = profile.rows[profile.poc]
        const y = (yAxis.convertToPixel(row.high) + yAxis.convertToPixel(row.low)) / 2
        figures.push({ type: 'line', key: 'poc', attrs: { coordinates: [{ x: x0, y }, { x: x1, y }] }, styles: { color: props.lineColor ?? POC, size: props.lineWidth ?? 2, style: props.lineStyle ?? 'solid', dashedValue: props.lineDashedValue ?? [4, 4] }, ignoreEvent: true })
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
