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
 * Helpers shared by the forecast and data-driven tools: the per-overlay
 * properties store every pro overlay carries, and bar-index lookup for points
 * that were restored with a timestamp only.
 */

import type DeepPartial from '../../../../common/DeepPartial'
import type { KLineData } from '../../../../common/Data'
import { merge, clone } from '../../../../common/utils/typeChecks'
import type ChartImp from '../../../../Chart'
import type { OverlayProperties } from '../../types'

export interface Figure { type: string, key?: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }

export interface PropertyStore {
  get: (id: string) => DeepPartial<OverlayProperties>
  setProperties: (properties: DeepPartial<OverlayProperties>, id: string) => void
  getProperties: (id: string) => DeepPartial<OverlayProperties>
}

export function propertyStore (): PropertyStore {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()
  const get = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}
  const setProperties = (next: DeepPartial<OverlayProperties>, id: string): void => {
    const merged = clone(get(id)) as Record<string, unknown>
    merge(merged, next)
    properties.set(id, merged as DeepPartial<OverlayProperties>)
  }
  return { get, setProperties, getProperties: get }
}

/** Bar index of a point: its dataIndex, else looked up from its timestamp. */
export function barIndex (chart: ChartImp, p: { dataIndex?: number, timestamp?: number }): number | null {
  if (typeof p.dataIndex === 'number') return p.dataIndex
  return typeof p.timestamp === 'number' ? chart.getChartStore().timestampToDataIndex(p.timestamp) : null
}

/** Inclusive, clamped bar range between two indices, in either order; null when there is no data. */
export function barRange (a: number, b: number, length: number): { from: number, to: number } | null {
  if (length === 0) return null
  const from = Math.max(0, Math.round(Math.min(a, b)))
  const to = Math.min(length - 1, Math.round(Math.max(a, b)))
  return from <= to ? { from, to } : null
}

/** Cheap fingerprint of the data a cached calculation depends on. */
export function dataKey (data: KLineData[]): string {
  if (data.length === 0) return '0'
  const last = data[data.length - 1]
  return `${data.length}|${last.timestamp}|${last.close}|${last.volume ?? 0}`
}

export interface Ohlc { open: number, high: number, low: number, close: number }

/**
 * One bar as figures: a bar with open/close ticks (`kind = 'bar'`), or a
 * candle with a wick and an open-close body. `y` maps a price to a pixel.
 */
export function barFigures (kind: 'bar' | 'candle', key: string, x: number, half: number, bar: Ohlc, y: (price: number) => number, color: string, fill: string): Figure[] {
  const [o, h, l, c] = [y(bar.open), y(bar.high), y(bar.low), y(bar.close)]
  const stem: Figure = { type: 'line', key: `${key}_stem`, attrs: { coordinates: [{ x, y: h }, { x, y: l }] }, styles: { color, size: 1, style: 'solid' } }
  if (kind === 'bar') {
    return [
      stem,
      { type: 'line', key: `${key}_open`, attrs: { coordinates: [{ x: x - half, y: o }, { x, y: o }] }, styles: { color, size: 1, style: 'solid' } },
      { type: 'line', key: `${key}_close`, attrs: { coordinates: [{ x, y: c }, { x: x + half, y: c }] }, styles: { color, size: 1, style: 'solid' } }
    ]
  }
  return [stem, { type: 'rect', key: `${key}_body`, attrs: { x: x - half, y: Math.min(o, c), width: half * 2, height: Math.max(1, Math.abs(c - o)) }, styles: { style: 'stroke_fill', color: fill, borderColor: color, borderSize: 1 } }]
}
