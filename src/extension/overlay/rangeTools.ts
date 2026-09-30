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
 * Styling via properties: lineColor, lineWidth, lineStyle, backgroundColor
 * (drawn unless `style` is 'stroke'), textColor, textFontSize,
 * textBackgroundColor. extendData: textBackgroundVisible (default true), and for
 * dateAndPriceRange an outline (borderVisible + borderDashedValue, properties borderColor / borderStyle /
 * borderWidth). Own text: `text` shown when customTextVisible, in
 * customTextColor / customTextFontSize with textFontWeight / textFontStyle.
 * priceRange honours `extendData.{extendLeft,extendRight}` for its bound
 * lines and fill, dateRange `extendTop` / `extendBottom`. The date tools' label
 * ends with the range's volume, as TV's does; the own text sits at the centre.
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'
import type ChartImp from '../../Chart'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { pipValue } from './measure'
import { calcTextWidth } from '../../common/utils/canvas'
import { timeSpan } from './tv/forecastData/common'

export type RangeKind = 'price' | 'date' | 'dateAndPrice'

const NAMES: Record<RangeKind, string> = { price: 'priceRange', date: 'dateRange', dateAndPrice: 'dateAndPriceRange' }

// TV defaults for all three tools.
const LINE_COLOR = '#2962FF'
const BACKGROUND = 'rgba(41, 98, 255, 0.15)'
const LABEL_BACKGROUND = 'rgba(42, 46, 57, 0.4)'
const LABEL_TEXT = '#ffffff'
const ARROW_HEAD = 10
/** TV draws an arrow's head only once the arrow is this many line widths long. */
const ARROW_MIN = { price: 15, date: 15, dateAndPrice: 25 }
const LABEL_GAP = 6

interface Figure { type: string, key?: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }

/** A gap in the axis-aligned line `from`-`to`: the part of it that lies outside `hole`, as the piece or pieces left. */
function lineAroundBox (from: Coordinate, to: Coordinate, hole: { cx: number, cy: number, halfW: number, halfH: number }): Coordinate[][] {
  const horizontal = from.y === to.y
  const across = horizontal ? Math.abs(from.y - hole.cy) < hole.halfH : Math.abs(from.x - hole.cx) < hole.halfW
  if (!across) return [[from, to]]
  const [lo, hi] = horizontal ? [hole.cx - hole.halfW, hole.cx + hole.halfW] : [hole.cy - hole.halfH, hole.cy + hole.halfH]
  const [a, b] = horizontal ? [from.x, to.x] : [from.y, to.y]
  const at = (t: number): Coordinate => (horizontal ? { x: t, y: from.y } : { x: from.x, y: t })
  const min = Math.min(a, b)
  const max = Math.max(a, b)
  if (hi <= min || lo >= max) return [[from, to]]
  const pieces: Coordinate[][] = []
  if (lo > min) pieces.push([at(min), at(lo)])
  if (hi < max) pieces.push([at(hi), at(max)])
  // Keep the pieces in drawing order.
  return a <= b ? pieces : pieces.reverse().map((piece) => piece.slice().reverse())
}

/** TV's arrow: the line (broken around the own text, if any) and an open chevron at its end. */
function arrow (from: Coordinate, to: Coordinate, color: string, size: number, key: string, dash: object, minLength: number, hole: Parameters<typeof lineAroundBox>[2] | null): Figure[] {
  const pieces = hole === null ? [[from, to]] : lineAroundBox(from, to, hole)
  const figures: Figure[] = pieces.map((coordinates, i) => ({ type: 'line', key: i === 0 ? key : `${key}_${i}`, attrs: { coordinates }, styles: { color, size, ...dash } }))
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length < minLength * size) return figures
  const ux = (to.x - from.x) / length
  const uy = (to.y - from.y) / length
  const back = ARROW_HEAD + Math.max(0, size - 2) * 3
  const bx = to.x - ux * back
  const by = to.y - uy * back
  figures.push({ type: 'line', key: `${key}_head`, attrs: { coordinates: [{ x: bx - uy * back, y: by + ux * back }, to, { x: bx + uy * back, y: by - ux * back }] }, styles: { color, size, style: 'solid' } })
  return figures
}

/** `877.912 M`-style volume. */
function fmtVolume (v: number): string {
  const [div, unit] = v >= 1e9 ? [1e9, ' B'] : v >= 1e6 ? [1e6, ' M'] : v >= 1e3 ? [1e3, ' K'] : [1, '']
  return `${Number((v / div).toFixed(3))}${unit}`
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
      const lineWidth = props.lineWidth ?? 2
      const ext = (overlay.extendData ?? {}) as { extendLeft?: boolean, extendRight?: boolean, extendTop?: boolean, extendBottom?: boolean, text?: string, borderVisible?: boolean, borderDashedValue?: number[], textBackgroundVisible?: boolean, customTextVisible?: boolean, customTextColor?: string, customTextFontSize?: number }

      const left = Math.min(a.x, b.x)
      const right = Math.max(a.x, b.x)
      const top = Math.min(a.y, b.y)
      const bottom = Math.max(a.y, b.y)
      const cx = (left + right) / 2
      const cy = (top + bottom) / 2
      const box = { x: left, y: top, width: right - left, height: bottom - top }
      // The fill follows the extends, as the bound lines do.
      const fillLeft = kind === 'price' && ext.extendLeft === true ? 0 : left
      const fillRight = kind === 'price' && ext.extendRight === true ? bounding.width : right
      const fillTop = kind === 'date' && ext.extendTop === true ? 0 : top
      const fillBottom = kind === 'date' && ext.extendBottom === true ? bounding.height : bottom
      const figures: Figure[] = []
      if (props.style !== 'stroke') {
        figures.push({ type: 'rect', key: 'background', attrs: { x: fillLeft, y: fillTop, width: fillRight - fillLeft, height: fillBottom - fillTop }, styles: { style: 'fill', color: props.backgroundColor ?? BACKGROUND, borderSize: 0 } })
      }
      if (kind === 'dateAndPrice' && ext.borderVisible === true) {
        figures.push({ type: 'rect', key: 'border', attrs: box, styles: { style: 'stroke', borderColor: props.borderColor ?? LINE_COLOR, borderSize: Number(props.borderWidth ?? 1), borderStyle: props.borderStyle ?? 'solid', borderDashedValue: ext.borderDashedValue ?? [4, 4] } })
      }

      const dash = { style: props.lineStyle ?? 'solid', dashedValue: props.lineDashedValue ?? [4, 4] }
      const lines = { color: lineColor, size: lineWidth, ...dash }
      if (kind === 'price') {
        const x0 = ext.extendLeft === true ? 0 : left
        const x1 = ext.extendRight === true ? bounding.width : right
        figures.push({ type: 'line', key: 'bound_0', attrs: { coordinates: [{ x: x0, y: a.y }, { x: x1, y: a.y }] }, styles: lines })
        figures.push({ type: 'line', key: 'bound_1', attrs: { coordinates: [{ x: x0, y: b.y }, { x: x1, y: b.y }] }, styles: lines })
      } else if (kind === 'date') {
        const y0 = ext.extendTop === true ? 0 : top
        const y1 = ext.extendBottom === true ? bounding.height : bottom
        figures.push({ type: 'line', key: 'bound_0', attrs: { coordinates: [{ x: a.x, y: y0 }, { x: a.x, y: y1 }] }, styles: lines })
        figures.push({ type: 'line', key: 'bound_1', attrs: { coordinates: [{ x: b.x, y: y0 }, { x: b.x, y: y1 }] }, styles: lines })
      }
      // TV breaks the arrows around its own text, which sits at the centre.
      const ownText = ext.customTextVisible === true && typeof ext.text === 'string' && ext.text !== '' ? ext.text : null
      const ownSize = Number(ext.customTextFontSize ?? 12)
      const hole = ownText === null
        ? null
        : { cx, cy, halfW: Math.max(...ownText.split('\n').map((l) => calcTextWidth(l, ownSize, props.textFontWeight, undefined))) / 2 + 5, halfH: (ownSize * ownText.split('\n').length) / 2 + 5 }
      if (kind !== 'date') figures.push(...arrow({ x: cx, y: a.y }, { x: cx, y: b.y }, lineColor, lineWidth, 'arrow_price', dash, ARROW_MIN[kind], hole))
      if (kind !== 'price') figures.push(...arrow({ x: a.x, y: cy }, { x: b.x, y: cy }, lineColor, lineWidth, 'arrow_date', dash, ARROW_MIN[kind], hole))

      // Label, past the end point in the price direction (TV's placement).
      const store = chart.getChartStore()
      const precision = store.getSymbol()?.pricePrecision ?? 2
      const delta = p1.value - p0.value
      const pct = p0.value !== 0 ? (delta / p0.value) * 100 : 0
      // TV's pip formatter counts ticks (10.93 reads 1,093) below 3 decimals, and pips above.
      const pips = precision >= 3 ? pipValue(delta, precision) : delta * 10 ** precision
      const priceLine = `${delta.toFixed(precision)} (${pct.toFixed(2)}%) ${pips.toLocaleString('en-US', { maximumFractionDigits: 1 })}`
      // Restored and programmatic points often carry only a timestamp.
      const index = (p: typeof p0): number | null =>
        typeof p.dataIndex === 'number' ? p.dataIndex : typeof p.timestamp === 'number' ? store.timestampToDataIndex(p.timestamp) : null
      const i0 = index(p0)
      const i1 = index(p1)
      const bars = i0 !== null && i1 !== null ? Math.round(i1 - i0) : 0
      const ms = typeof p0.timestamp === 'number' && typeof p1.timestamp === 'number' ? p1.timestamp - p0.timestamp : 0
      // Volume over the bars the range covers (TV: `Vol 877.912 M`).
      const data = chart.getDataList()
      const volume = i0 !== null && i1 !== null
        ? data.slice(Math.max(0, Math.round(Math.min(i0, i1))), Math.round(Math.max(i0, i1)) + 1).reduce((sum, d) => sum + (d.volume ?? 0), 0)
        : 0
      const dateLine = `${bars} bars, ${timeSpan(ms)}${volume > 0 ? `\nVol ${fmtVolume(volume)}` : ''}`
      const text = kind === 'price' ? priceLine : kind === 'date' ? dateLine : `${priceLine}\n${dateLine}`
      const up = b.y <= a.y
      figures.push({
        type: 'text',
        key: 'label',
        attrs: { x: cx, y: up ? top - LABEL_GAP : bottom + LABEL_GAP, text, align: 'center', baseline: up ? 'bottom' : 'top' },
        styles: {
          color: props.textColor ?? LABEL_TEXT,
          size: Number(props.textFontSize ?? 12),
          family: 'Helvetica Neue',
          weight: 'normal',
          backgroundColor: ext.textBackgroundVisible === false ? 'transparent' : (props.textBackgroundColor ?? LABEL_BACKGROUND),
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
      if (ext.customTextVisible === true && typeof ext.text === 'string' && ext.text !== '') {
        figures.push({
          type: 'text',
          key: 'custom_text',
          attrs: { x: cx, y: cy, text: ext.text, align: 'center', baseline: 'middle' },
          styles: {
            color: ext.customTextColor ?? LINE_COLOR,
            size: Number(ext.customTextFontSize ?? 12),
            weight: props.textFontWeight ?? 'normal',
            fontStyle: props.textFontStyle ?? 'normal',
            backgroundColor: 'transparent',
            borderSize: 0
          },
          ignoreEvent: true
        })
      }
      return figures
    },
    setProperties,
    getProperties
  }
}
