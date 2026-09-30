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
 * Price Range, Date Range and Date & Price Range — TradingView's
 * `price_range`, `date_range` and `date_and_price_range`.
 *
 * Persistent, selectable cousins of the transient `measure` tool: two points
 * span a zone, an arrow runs through it in the drag direction, and a label
 * past the end point reads out the move.
 *
 *   priceRange        horizontal bounds, vertical arrow, `Δ (pct%) pips`
 *   dateRange         vertical bounds, horizontal arrow, `N bars, duration`
 *   dateAndPriceRange box, both arrows, both lines of the label
 *
 * Styling via properties: lineColor, lineWidth, backgroundColor, textColor,
 * textFontSize, textBackgroundColor. priceRange honours
 * `extendData.{extendLeft,extendRight}` for its bound lines.
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'
import type ChartImp from '../../Chart'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { formatDuration, pipValue } from './measure'
import { arrowHeadCoordinates } from './utils'

export type RangeKind = 'price' | 'date' | 'dateAndPrice'

const NAMES: Record<RangeKind, string> = { price: 'priceRange', date: 'dateRange', dateAndPrice: 'dateAndPriceRange' }

// TV defaults for all three tools.
const LINE_COLOR = '#2962FF'
const BACKGROUND = 'rgba(41, 98, 255, 0.2)'
const LABEL_BACKGROUND = 'rgba(41, 98, 255, 0.9)'
const LABEL_TEXT = '#ffffff'
const ARROW_HEAD = 7
const LABEL_GAP = 6

interface Figure { type: string, key?: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }

function arrow (from: Coordinate, to: Coordinate, color: string, size: number, key: string): Figure[] {
  if (Math.hypot(to.x - from.x, to.y - from.y) < ARROW_HEAD * 2) return []
  return [
    { type: 'line', key, attrs: { coordinates: [from, to] }, styles: { color, size, style: 'solid' } },
    { type: 'polygon', key: `${key}_head`, attrs: { coordinates: arrowHeadCoordinates(from, to, ARROW_HEAD) }, styles: { style: 'fill', color } }
  ]
}

export const rangeTool = (kind: RangeKind) => (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const newProps = clone(properties.get(id) ?? {}) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }
  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: NAMES[kind],
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: (params) => {
      const { chart, coordinates, bounding, overlay } = params as typeof params & { chart: ChartImp }
      if (coordinates.length < 2) return []
      const [p0, p1] = overlay.points
      const [a, b] = coordinates
      if (typeof p0.value !== 'number' || typeof p1.value !== 'number') return []

      const props = properties.get(overlay.id) ?? {}
      const lineColor = props.lineColor ?? LINE_COLOR
      const lineWidth = props.lineWidth ?? 1
      const ext = (overlay.extendData ?? {}) as { extendLeft?: boolean, extendRight?: boolean }

      const left = Math.min(a.x, b.x)
      const right = Math.max(a.x, b.x)
      const top = Math.min(a.y, b.y)
      const bottom = Math.max(a.y, b.y)
      const cx = (left + right) / 2
      const cy = (top + bottom) / 2
      const figures: Figure[] = [{
        type: 'rect',
        key: 'background',
        attrs: { x: left, y: top, width: right - left, height: bottom - top },
        styles: { style: 'fill', color: props.backgroundColor ?? BACKGROUND, borderSize: 0 }
      }]

      const lines = { color: lineColor, size: lineWidth, style: 'solid' }
      if (kind === 'price') {
        const x0 = ext.extendLeft === true ? 0 : left
        const x1 = ext.extendRight === true ? bounding.width : right
        figures.push({ type: 'line', key: 'bound_0', attrs: { coordinates: [{ x: x0, y: a.y }, { x: x1, y: a.y }] }, styles: lines })
        figures.push({ type: 'line', key: 'bound_1', attrs: { coordinates: [{ x: x0, y: b.y }, { x: x1, y: b.y }] }, styles: lines })
      } else if (kind === 'date') {
        figures.push({ type: 'line', key: 'bound_0', attrs: { coordinates: [{ x: a.x, y: top }, { x: a.x, y: bottom }] }, styles: lines })
        figures.push({ type: 'line', key: 'bound_1', attrs: { coordinates: [{ x: b.x, y: top }, { x: b.x, y: bottom }] }, styles: lines })
      }
      if (kind !== 'date') figures.push(...arrow({ x: cx, y: a.y }, { x: cx, y: b.y }, lineColor, lineWidth, 'arrow_price'))
      if (kind !== 'price') figures.push(...arrow({ x: a.x, y: cy }, { x: b.x, y: cy }, lineColor, lineWidth, 'arrow_date'))

      // Label, past the end point in the price direction (TV's placement).
      const store = chart.getChartStore()
      const precision = store.getSymbol()?.pricePrecision ?? 2
      const delta = p1.value - p0.value
      const pct = p0.value !== 0 ? (delta / p0.value) * 100 : 0
      const priceLine = `${delta.toFixed(precision)} (${pct.toFixed(2)}%) ${pipValue(delta, precision).toFixed(1)}`
      // Restored and programmatic points often carry only a timestamp.
      const index = (p: typeof p0): number | null =>
        typeof p.dataIndex === 'number' ? p.dataIndex : typeof p.timestamp === 'number' ? store.timestampToDataIndex(p.timestamp) : null
      const i0 = index(p0)
      const i1 = index(p1)
      const bars = i0 !== null && i1 !== null ? Math.round(i1 - i0) : 0
      const ms = typeof p0.timestamp === 'number' && typeof p1.timestamp === 'number' ? p1.timestamp - p0.timestamp : 0
      const dateLine = `${bars} bars, ${formatDuration(ms)}`
      const text = kind === 'price' ? priceLine : kind === 'date' ? dateLine : `${priceLine}\n${dateLine}`
      const up = b.y <= a.y
      figures.push({
        type: 'text',
        key: 'label',
        attrs: { x: cx, y: up ? top - LABEL_GAP : bottom + LABEL_GAP, text, align: 'center', baseline: up ? 'bottom' : 'top' },
        styles: {
          color: props.textColor ?? LABEL_TEXT,
          size: props.textFontSize ?? 12,
          family: 'Helvetica Neue',
          weight: 'normal',
          backgroundColor: props.textBackgroundColor ?? LABEL_BACKGROUND,
          borderSize: 0,
          borderColor: 'transparent',
          borderRadius: 4,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          lineHeight: 1.35
        },
        ignoreEvent: true
      })
      return figures
    },
    setProperties,
    getProperties
  }
}
