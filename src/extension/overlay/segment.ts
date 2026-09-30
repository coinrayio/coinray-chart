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

import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import type ChartImp from '../../Chart'
import { isNumber, merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { getLinearYFromCoordinates } from '../figure/line'
import { computeTextPosition } from './textUtils'
import { lineEndCoordinates } from './endCaps'
import { getTextRect } from '../figure/text'
import { statsIconFigures } from './statsIcons'
import type { StatsIcon } from './statsIcons'
import { formatPrecision } from '../../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'
import { TV_BLUE, axisLabelStyles, lineAroundText, tvDashedValue } from './tvLine'

/** End-cap kind for either anchor of a segment. */
type EndCap = 'normal' | 'arrow'

/** Where the stats box sits: its left edge at the left anchor, the middle or the right
 *  anchor. TV's Auto lands in the middle here. */
type StatsPos = 'left' | 'center' | 'right' | 'auto'

/** Stat keys the Style-tab Stats multi-select surfaces, in the order they are laid out in the box. */
type StatKey = 'priceRange' | 'percentRange' | 'pipsChange' | 'barsRange' | 'timeRange' | 'distance' | 'angle'

/** Duration string like "3d 4h 12m". Zero-slots collapse so short
 *  ranges don't render as "0d 0h 3m". Anchors on ms — pass a
 *  positive difference; the renderer wraps this with `|Δt|`. */
const formatDuration = (ms: number): string => {
  const abs = Math.abs(ms)
  const days = Math.floor(abs / 86400000)
  const hours = Math.floor((abs % 86400000) / 3600000)
  const minutes = Math.floor((abs % 3600000) / 60000)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)
  return parts.join(' ')
}

/** TradingView's trend line thickness and label size, where ours were 1 and 12. */
export const SEGMENT_DEFAULT_WIDTH = 2
export const SEGMENT_DEFAULT_TEXT_SIZE = 14

const segment = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    const size = props.lineWidth ?? SEGMENT_DEFAULT_WIDTH
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? TV_BLUE,
      size,
      dashedValue: tvDashedValue(props.lineDashedValue, size)
    }
  }

  // Arrowheads are solid strokes in the line colour and width, even on a dashed line:
  // a dashed arrowhead reads as noise.
  const arrowheadStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: 'solid',
      color: props.lineColor ?? TV_BLUE,
      size: props.lineWidth ?? SEGMENT_DEFAULT_WIDTH
    }
  }

  const textStyle = (id: string, overrides?: Partial<TextStyle>): Partial<TextStyle> => {
    const props = properties.get(id) ?? {}
    return {
      color: props.textColor ?? TV_BLUE,
      size: props.textFontSize ?? SEGMENT_DEFAULT_TEXT_SIZE,
      weight: props.textFontWeight ?? DEFAULT_OVERLAY_PROPERTIES.textFontWeight,
      // Italic flows through `fontStyle`. The shared textStyle
      // builder previously dropped this, so toggling Italic in
      // the Style tab had no visible effect.
      fontStyle: props.textFontStyle ?? DEFAULT_OVERLAY_PROPERTIES.textFontStyle,
      family: props.textFont ?? DEFAULT_OVERLAY_PROPERTIES.textFont,
      paddingLeft: props.textPaddingLeft ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingLeft,
      paddingRight: props.textPaddingRight ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingRight,
      paddingTop: props.textPaddingTop ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingTop,
      paddingBottom: props.textPaddingBottom ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingBottom,
      backgroundColor: props.textBackgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.textBackgroundColor,
      ...overrides
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const current = properties.get(id) ?? {}
    const newProps = clone(current) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }

  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: 'segment',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay, chart }) => {
      if (coordinates.length !== 2) {
        return []
      }

      const id = overlay.id
      // `extendData` carries the trend-line variant flags (extend
      // toggles + end-cap kinds + Style-tab booleans). All are
      // optional; absent means the legacy finite-segment behaviour.
      const ext = overlay.extendData as {
        extendLeft?: boolean
        extendRight?: boolean
        endCapLeft?: EndCap
        endCapRight?: EndCap
        showMidPoint?: boolean
        stats?: StatKey[]
        statsPosition?: StatsPos
        statsOnSelect?: boolean
      } | undefined
      const extendLeft = ext?.extendLeft === true
      const extendRight = ext?.extendRight === true
      const endCapLeft: EndCap = ext?.endCapLeft ?? 'normal'
      const endCapRight: EndCap = ext?.endCapRight ?? 'normal'
      const showMidPoint = ext?.showMidPoint === true
      const statsSelected: StatKey[] = Array.isArray(ext?.stats) ? ext.stats : []
      const statsPosition: StatsPos = ext?.statsPosition ?? 'right'

      // `lineCoordinates` is always sorted so [0] is the visually
      // left (or top, for vertical) end and [1] is the right
      // (bottom). End-cap rendering relies on that order — left
      // cap fires at [0], right cap at [1] — and so does any
      // future midpoint / stats label work that wants to anchor
      // off a canonical end.
      let lineCoordinates: Array<{ x: number; y: number }> = coordinates

      if (coordinates[0].x === coordinates[1].x) {
        // Vertical line. With no extend flags we still sort by Y
        // so endCap targeting is deterministic; with extend flags
        // we push each end to the chart edge.
        const [topPt, bottomPt] = coordinates[0].y <= coordinates[1].y
          ? [coordinates[0], coordinates[1]]
          : [coordinates[1], coordinates[0]]
        lineCoordinates = [
          { x: coordinates[0].x, y: extendLeft ? 0 : topPt.y },
          { x: coordinates[0].x, y: extendRight ? bounding.height : bottomPt.y }
        ]
      } else {
        const [leftPt, rightPt] = coordinates[0].x <= coordinates[1].x
          ? [coordinates[0], coordinates[1]]
          : [coordinates[1], coordinates[0]]

        const startX = extendLeft ? 0 : leftPt.x
        const endX = extendRight ? bounding.width : rightPt.x
        lineCoordinates = [
          { x: startX, y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: startX, y: leftPt.y }) },
          { x: endX, y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: endX, y: rightPt.y }) }
        ]
      }

      const figures: Array<{
        type: string
        attrs: unknown
        styles?: Partial<LineStyle> | Partial<TextStyle> | Partial<PolygonStyle>
      }> = [
        {
          type: 'line',
          attrs: { coordinates: lineCoordinates },
          styles: lineStyle(id)
        }
      ]

      // TV's arrowhead is two strokes at the end, open, sized by the line width.
      const lineWidth = properties.get(id)?.lineWidth ?? SEGMENT_DEFAULT_WIDTH
      if (endCapRight === 'arrow') {
        figures.push({
          type: 'line',
          attrs: { coordinates: lineEndCoordinates(lineCoordinates[0], lineCoordinates[1], lineWidth) },
          styles: arrowheadStyle(id)
        })
      }
      if (endCapLeft === 'arrow') {
        figures.push({
          type: 'line',
          attrs: { coordinates: lineEndCoordinates(lineCoordinates[1], lineCoordinates[0], lineWidth) },
          styles: arrowheadStyle(id)
        })
      }

      // Like TV, the middle point and the stats are for a line you are pointing at.
      const chartStore = (chart as ChartImp).getChartStore()
      const pointedAt = chartStore.getHoverOverlayInfo().overlay?.id === id ||
        chartStore.getClickOverlayInfo().overlay?.id === id

      const props = properties.get(id) ?? {}
      const text = props.text ?? ''
      const midX = (coordinates[0].x + coordinates[1].x) / 2
      const midY = (coordinates[0].y + coordinates[1].y) / 2

      // Middle-point marker — a stroke-mode ring matching the
      // visual language of the default anchor point figures
      // (`OverlayPointStyle.mode: 'stroke'`, line-colour border,
      // bg-coloured fill), just at ~⅔ the radius so the user
      // reads it as a derived/midpoint marker rather than a
      // draggable anchor. Painted while the line is hovered or
      // selected, as TV does.
      if (showMidPoint && pointedAt) {
        const midColor = props.lineColor ?? TV_BLUE
        figures.push({
          type: 'circle',
          attrs: { x: midX, y: midY, r: 4 },
          styles: {
            style: 'stroke',
            color: midColor,
            borderColor: midColor,
            borderSize: 1.5
          }
        })
      }

      // Text orientation — rotate the label so it reads along
      // the line, then offset perpendicular to the line based on
      // textAlignVertical so "top" stays above the line and
      // "bottom" stays below regardless of rotation. The
      // horizontal align value moves the anchor along the line
      // itself (left = near anchor 0, right = near anchor 1,
      // center = midpoint).
      //
      // Vertical lines fall back to the previous axis-aligned
      // logic via `computeTextPosition` — "above the line" has
      // no useful meaning when the line points straight up.
      const dx = lineCoordinates[1].x - lineCoordinates[0].x
      const dy = lineCoordinates[1].y - lineCoordinates[0].y
      const isVertical = Math.abs(dx) < 0.5
      const hAlign = props.textAlignHorizontal ?? 'center'
      const vAlign = props.textAlignVertical ?? 'top'

      if (isVertical) {
        figures.push({
          type: 'editableText',
          attrs: { ...computeTextPosition(midX, midY, props, bounding.width, 'center', 'top'), text },
          styles: textStyle(id)
        })
      } else {
        const angle = Math.atan2(dy, dx)
        const len = Math.hypot(dx, dy)
        // Position along the line: left/right anchor the label to the
        // endpoint itself, centre to the midpoint. `align` does the work —
        // the label grows inward from the end it's anchored to.
        const t = hAlign === 'left' ? 0 : hAlign === 'right' ? 1 : 0.5
        let ax = lineCoordinates[0].x + dx * t
        let ay = lineCoordinates[0].y + dy * t
        const align = hAlign === 'left' ? 'start' : hAlign === 'right' ? 'end' : 'center'

        // Along-line padding of the label box, which is also the shape of the
        // hole it knocks in the stroke: none on the outward side, so the first
        // glyph lands exactly on the endpoint, and a hair on the inward side
        // so the line resumes just clear of the text rather than touching it.
        const INWARD_GAP = 2
        const boxPadding = {
          paddingLeft: hAlign === 'left' ? 0 : INWARD_GAP,
          paddingRight: hAlign === 'right' ? 0 : INWARD_GAP
        }

        // Perpendicular offset for vAlign. Since lineCoordinates
        // is sorted left→right (dx >= 0), the CW perpendicular
        // (sin θ, -cos θ) = (dy/|d|, -dx/|d|) always points to
        // the "top" side in screen terms; CCW to "bottom".
        if (vAlign !== 'middle') {
          if (len > 0) {
            const fontSize = props.textFontSize ?? SEGMENT_DEFAULT_TEXT_SIZE
            const offsetMag = fontSize * 0.6 + 6
            const sign = vAlign === 'top' ? 1 : -1
            ax += sign * (dy / len) * offsetMag
            ay += sign * (-dx / len) * offsetMag
          }
        }

        const labelStyle = textStyle(id, boxPadding)
        // Sitting on the line, the label leaves a gap in the stroke, as in TV.
        if (vAlign === 'middle') {
          figures[0] = { ...figures[0], attrs: lineAroundText(lineCoordinates, { x: ax, y: ay, align, angle }, text, labelStyle).map((coordinates) => ({ coordinates })) }
        }
        figures.push({
          type: 'editableText',
          attrs: {
            x: ax,
            y: ay,
            text,
            align,
            baseline: 'middle',
            angle
          },
          styles: labelStyle
        })
      }

      // Stats: TV's grey box of up to three rows (price / percent / pips, then bars / time / distance,
      // then angle), shown while the line is pointed at unless "Always show stats" is on.
      const active = ext?.statsOnSelect === false || pointedAt
      if (active && statsSelected.length > 0 && overlay.points.length === 2) {
        const p0 = overlay.points[0]
        const p1 = overlay.points[1]
        const v0 = p0.value
        const v1 = p1.value
        const priceDiff = (isNumber(v0) && isNumber(v1)) ? (v1 - v0) : null
        const precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
        const thousands = chart.getThousandsSeparator()
        // TV signs with a true minus, except on the angle.
        const signed = (value: number, text: string): string => (value < 0 ? '\u2212' : '') + text

        const price = (): string | null => priceDiff !== null
          ? signed(priceDiff, thousands.format(formatPrecision(Math.abs(priceDiff), precision)))
          : null
        const percent = (): string | null => {
          if (priceDiff === null || v0 === 0 || !isNumber(v0)) return null
          const pct = (priceDiff / v0) * 100
          return signed(pct, `${Math.abs(pct).toFixed(2)}%`)
        }
        // A pip here is the smallest price step, so it is the difference in units of the last decimal.
        const pips = (): string | null => {
          if (priceDiff === null) return null
          const n = Math.round(priceDiff * Math.pow(10, precision))
          return signed(n, thousands.format(String(Math.abs(n))))
        }
        const bars = (): string | null => isNumber(p0.dataIndex) && isNumber(p1.dataIndex) ? `${Math.abs(p1.dataIndex - p0.dataIndex)} bars` : null
        const time = (): string | null => isNumber(p0.timestamp) && isNumber(p1.timestamp) ? formatDuration(p1.timestamp - p0.timestamp) : null
        // Both are of the line between the anchors, not of the part of it that is drawn when it is extended.
        const [leftEnd, rightEnd] = coordinates[0].x <= coordinates[1].x ? [coordinates[0], coordinates[1]] : [coordinates[1], coordinates[0]]
        const distance = (): string => `distance: ${Math.round(Math.hypot(rightEnd.x - leftEnd.x, rightEnd.y - leftEnd.y))} px`
        const angle = (): string => `${Math.round(Math.atan2(leftEnd.y - rightEnd.y, rightEnd.x - leftEnd.x) * 180 / Math.PI)}\u00B0`

        const wanted = (key: StatKey): boolean => statsSelected.includes(key)
        const pick = (key: StatKey, make: () => string | null): string | null => wanted(key) ? make() : null
        const joined = (parts: Array<string | null>, separator: string): string => parts.filter((part): part is string => part !== null).join(separator)

        // 17.63 (11.32%), 1,763 -- the percent sits in brackets after the price, when both are shown.
        const priceText = pick('priceRange', price)
        const percentText = pick('percentRange', percent)
        const main = priceText !== null && percentText !== null ? `${priceText} (${percentText})` : priceText ?? percentText
        // 75 bars (107d), distance: 511 px
        const barsText = pick('barsRange', bars)
        const timeText = pick('timeRange', time)
        const span = barsText !== null && timeText !== null ? `${barsText} (${timeText})` : barsText ?? timeText
        const rows: Array<{ icon: StatsIcon, text: string }> = [
          { icon: 'price' as const, text: joined([main, pick('pipsChange', pips)], ', ') },
          { icon: 'bars' as const, text: joined([span, wanted('distance') ? distance() : null], ', ') },
          { icon: 'angle' as const, text: wanted('angle') ? angle() : '' }
        ].filter((row) => row.text !== '')

        if (rows.length > 0) {
          // Left, centre and right put the box's left edge at the left anchor, the middle, or the right anchor.
          // It sits on the empty side of the line: under a rising one, over a falling one.
          const [leftPt, rightPt] = coordinates[0].x <= coordinates[1].x ? [coordinates[0], coordinates[1]] : [coordinates[1], coordinates[0]]
          const t = statsPosition === 'left' ? 0 : statsPosition === 'right' ? 1 : 0.5
          const sx = leftPt.x + (rightPt.x - leftPt.x) * t
          const sy = leftPt.y + (rightPt.y - leftPt.y) * t
          const rising = rightPt.y < leftPt.y
          const boxAttrs = {
            x: sx,
            y: rising ? sy + 10 : sy - 10,
            text: rows.map((row) => row.text).join('\n'),
            align: 'left' as const,
            baseline: rising ? 'top' as const : 'bottom' as const
          }
          const boxStyles = {
            color: '#FFFFFF',
            size: 13,
            weight: 500,
            lineHeight: 2,
            // Room on the left for the row icons.
            paddingLeft: 36,
            paddingRight: 12,
            paddingTop: 7,
            paddingBottom: 7,
            backgroundColor: 'rgba(67, 70, 81, 0.9)',
            borderSize: 0,
            borderRadius: 4
          }
          figures.push({ type: 'text', attrs: boxAttrs, styles: boxStyles })
          const box = getTextRect(boxAttrs, boxStyles)
          rows.forEach((row, i) => {
            figures.push(...statsIconFigures(row.icon, box.x + 17, box.y + boxStyles.paddingTop + i * boxStyles.size * boxStyles.lineHeight + boxStyles.size / 2 + 1))
          })
        }
      }

      return figures
    },
    // Per-endpoint price labels on the Y-axis. Only rendered when
    // the Style-tab Price Labels checkbox is on — the engine's
    // built-in `needDefaultYAxisFigure` handles the selected-state
    // label automatically, so this hook covers the "always-on,
    // even when deselected" case the spec asks for. Two labels:
    // one per anchor, each using the underlying overlay.point's
    // value (which round-trips through `setVisibleRange`).
    createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
      const ext = overlay.extendData as { showPriceLabels?: boolean } | undefined
      if (ext?.showPriceLabels !== true) return []
      if (coordinates.length !== 2) return []

      const isFromZero = yAxis?.isFromZero() ?? false
      const textAlign: CanvasTextAlign = isFromZero ? 'left' : 'right'
      const x = isFromZero ? 0 : bounding.width

      const precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
      // Match the built-in selected-state label's full format
      // chain — `formatPrecision` → thousands separator → decimal
      // fold (`OverlayYAxisView` uses the same three layers).
      // Without the latter two, the numbers render without commas
      // and without the chart-wide decimal-fold setting, which is
      // visibly different from every other y-axis label.
      const decimalFold = chart.getDecimalFold()
      const thousandsSeparator = chart.getThousandsSeparator()

      // Plain text figures with no explicit style — the Y-axis
      // pane's theme paints them at the same size / weight /
      // padding as the built-in selected-state label (and the
      // crosshair label), so all three labels read as one
      // family. Anything explicit here would shrink-mismatch
      // against the default label and the user noticed.
      return overlay.points.map((point, i) => {
        const value = point.value
        const labelText = isNumber(value)
          ? decimalFold.format(thousandsSeparator.format(formatPrecision(value, precision)))
          : ''
        return {
          type: 'text',
          attrs: {
            x,
            y: coordinates[i].y,
            text: labelText,
            align: textAlign,
            baseline: 'middle' as CanvasTextBaseline
          },
          // TV's axis label is white on the line's colour.
          styles: axisLabelStyles(lineStyle(overlay.id).color ?? TV_BLUE),
          ignoreEvent: true
        }
      })
    },
    setProperties,
    getProperties
  }
}

export default segment
