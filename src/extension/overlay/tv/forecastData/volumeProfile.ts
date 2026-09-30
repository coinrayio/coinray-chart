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
 * Known gap: TV builds the profile from lower-timeframe bars; this only has
 * the chart's own, so a bar's volume is assumed even across its range.
 *
 * Cached per overlay against the bar range, data fingerprint and settings.
 *
 * Properties: lineColor, lineWidth (POC line), backgroundColor (box).
 * extendData: `{ rows = 24, vaPercent = 70, volumeMode = 'upDown' | 'total',
 * widthPercent = 30, direction = 'left' | 'right', showPoc = true,
 * upColor, downColor, vaUpColor, vaDownColor }`.
 */

import type { KLineData } from '../../../../common/Data'
import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { barIndex, barRange, dataKey, propertyStore } from './common'
import type { Figure } from './common'

export interface VolumeProfileExtendData {
  rows?: number
  vaPercent?: number
  volumeMode?: 'upDown' | 'total'
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
export function buildProfile (bars: KLineData[], from: number, to: number, rowCount: number, vaPercent: number): VolumeProfile | null {
  let low = Infinity
  let high = -Infinity
  for (let i = from; i <= to; i++) {
    low = Math.min(low, bars[i].low)
    high = Math.max(high, bars[i].high)
  }
  const n = Math.max(1, Math.round(rowCount))
  if (!(high > low)) return null
  const size = (high - low) / n
  const rows: ProfileRow[] = Array.from({ length: n }, (_, r) => ({ low: low + r * size, high: low + (r + 1) * size, up: 0, down: 0 }))

  for (let i = from; i <= to; i++) {
    const bar = bars[i]
    const volume = bar.volume ?? 0
    if (volume <= 0) continue
    const side = bar.close >= bar.open ? 'up' : 'down'
    const first = Math.min(n - 1, Math.floor((bar.low - low) / size))
    const last = Math.min(n - 1, Math.floor((bar.high - low) / size))
    if (bar.high === bar.low) {
      rows[first][side] += volume
      continue
    }
    const span = bar.high - bar.low
    for (let r = first; r <= last; r++) {
      const overlap = Math.min(bar.high, rows[r].high) - Math.max(bar.low, rows[r].low)
      if (overlap > 0) rows[r][side] += (volume * overlap) / span
    }
  }

  const total = rows.map((r) => r.up + r.down)
  let poc = 0
  for (let r = 1; r < n; r++) if (total[r] > total[poc]) poc = r
  const sum = total.reduce((a, b) => a + b, 0)
  const target = (sum * vaPercent) / 100
  let vaFrom = poc
  let vaTo = poc
  let acc = total[poc]
  const pair = (a: number, b: number): number => (total[a] ?? 0) + (total[b] ?? 0)
  while (acc < target && (vaFrom > 0 || vaTo < n - 1)) {
    const above = vaTo < n - 1 ? pair(vaTo + 1, vaTo + 2) : -1
    const below = vaFrom > 0 ? pair(vaFrom - 1, vaFrom - 2) : -1
    if (above >= below) {
      vaTo++
      acc += total[vaTo]
    } else {
      vaFrom--
      acc += total[vaFrom]
    }
  }
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
      const key = `${range.from}|${range.to}|${dataKey(data)}|${rows}|${vaPercent}`
      let cached = cache.get(overlay)
      if (cached?.key !== key) {
        cached = { key, profile: buildProfile(data, range.from, range.to, rows, vaPercent) }
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
      const upDown = ext.volumeMode !== 'total'
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
        figures.push({ type: 'line', key: 'poc', attrs: { coordinates: [{ x: x0, y }, { x: x1, y }] }, styles: { color: props.lineColor ?? POC, size: props.lineWidth ?? 2, style: 'solid' }, ignoreEvent: true })
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
