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
import { isNumber, merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { getLinearSlopeIntercept, getLinearYFromCoordinates } from '../figure/line'
import { computeTextPosition } from './textUtils'
import { getRotateCoordinate } from './utils'
import { formatPrecision } from '../../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'

/** End-cap kind for either anchor of a segment. */
type EndCap = 'normal' | 'arrow'

/** Where the stats label sits along the segment. `auto` mirrors
 *  TradingView: pick the side least likely to overlap the price
 *  action (the anchor with the smaller y — i.e. the higher price
 *  on screen). Falls back to center if the two anchors' y match. */
type StatsPos = 'left' | 'center' | 'right' | 'auto'

/** Stat keys the Style-tab Stats multi-select surfaces. The order
 *  here is the row order the spec asks for — index 0..2 sit on
 *  row 1, 3..5 on row 2, 6+ on row 3. Callers pick a subset in
 *  any order; the renderer preserves this canonical row layout
 *  so two overlays with the same subset produce identical labels. */
// row 1: priceRange / percentRange / pipsChange
// row 2: barsRange / timeRange / distance
// row 3: angle
const STAT_KEYS = [
  'priceRange',
  'percentRange',
  'pipsChange',
  'barsRange',
  'timeRange',
  'distance',
  'angle'
] as const
type StatKey = typeof STAT_KEYS[number]

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

/**
 * Build the three points that make up an arrowhead polygon anchored at
 * `anchor`, pointing away from `away`. The 30° spread (`arrowAngle`)
 * and the `arrowSize` ratio are the same shape the dedicated `arrow`
 * overlay uses, so a segment with `endCapRight: 'arrow'` and a plain
 * arrow overlay look identical at equal line widths.
 */
const buildArrowhead = (
  anchor: { x: number; y: number },
  away: { x: number; y: number },
  arrowSize: number
): Array<{ x: number; y: number }> => {
  const kb = getLinearSlopeIntercept(away, anchor)
  let angle = 0
  if (kb !== null) {
    angle = Math.atan(kb[0])
    if (anchor.x < away.x) {
      angle += Math.PI
    }
  } else {
    angle = anchor.y > away.y ? Math.PI / 2 : -Math.PI / 2
  }
  const arrowAngle = Math.PI / 6
  const p1 = getRotateCoordinate(
    { x: anchor.x - arrowSize, y: anchor.y },
    anchor,
    angle + arrowAngle
  )
  const p2 = getRotateCoordinate(
    { x: anchor.x - arrowSize, y: anchor.y },
    anchor,
    angle - arrowAngle
  )
  return [anchor, p1, p2]
}

const segment = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      size: props.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth,
      dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
    }
  }

  // Arrowheads always render as a filled solid triangle in the
  // line colour — regardless of whether the line itself is dashed
  // or dotted, because a dashed arrowhead reads as noise. Matches
  // the dedicated `arrow` overlay's treatment.
  const arrowheadStyle = (id: string): Partial<PolygonStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: 'fill',
      color: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      borderColor: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      borderSize: 0,
      borderStyle: 'solid',
      borderDashedValue: [2, 2]
    }
  }

  const textStyle = (id: string): Partial<TextStyle> => {
    const props = properties.get(id) ?? {}
    return {
      color: props.textColor ?? DEFAULT_OVERLAY_PROPERTIES.textColor,
      size: props.textFontSize ?? DEFAULT_OVERLAY_PROPERTIES.textFontSize,
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
      backgroundColor: props.textBackgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.textBackgroundColor
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
      } | undefined
      const extendLeft = ext?.extendLeft === true
      const extendRight = ext?.extendRight === true
      const endCapLeft: EndCap = ext?.endCapLeft ?? 'normal'
      const endCapRight: EndCap = ext?.endCapRight ?? 'normal'
      const showMidPoint = ext?.showMidPoint === true
      const statsSelected: StatKey[] = Array.isArray(ext?.stats) ? ext.stats : []
      const statsPosition: StatsPos = ext?.statsPosition ?? 'auto'

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

      // Arrowhead size mirrors `arrow.ts`: scales with line width
      // with an 8 px floor so a 1 px line still has a visible head.
      const lineWidth = properties.get(id)?.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth
      const arrowSize = Math.max(8, lineWidth * 4)
      if (endCapRight === 'arrow') {
        figures.push({
          type: 'polygon',
          attrs: { coordinates: buildArrowhead(lineCoordinates[1], lineCoordinates[0], arrowSize) },
          styles: arrowheadStyle(id)
        })
      }
      if (endCapLeft === 'arrow') {
        figures.push({
          type: 'polygon',
          attrs: { coordinates: buildArrowhead(lineCoordinates[0], lineCoordinates[1], arrowSize) },
          styles: arrowheadStyle(id)
        })
      }

      const props = properties.get(id) ?? {}
      const text = props.text ?? ''
      const midX = (lineCoordinates[0].x + lineCoordinates[1].x) / 2
      const midY = (lineCoordinates[0].y + lineCoordinates[1].y) / 2

      // Middle-point marker — a stroke-mode ring matching the
      // visual language of the default anchor point figures
      // (`OverlayPointStyle.mode: 'stroke'`, line-colour border,
      // bg-coloured fill), just at ~⅔ the radius so the user
      // reads it as a derived/midpoint marker rather than a
      // draggable anchor. Stays painted whether the overlay is
      // selected or not so the user sees the midpoint at a
      // glance from the rest of the chart's overlays.
      if (showMidPoint) {
        const midColor = props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
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
        // Position along the line. Pull in ~10% from each end
        // so left/right text sits inside the segment rather than
        // right at the anchor handle.
        const t = hAlign === 'left' ? 0.1 : hAlign === 'right' ? 0.9 : 0.5
        let ax = lineCoordinates[0].x + dx * t
        let ay = lineCoordinates[0].y + dy * t

        // Perpendicular offset for vAlign. Since lineCoordinates
        // is sorted left→right (dx >= 0), the CW perpendicular
        // (sin θ, -cos θ) = (dy/|d|, -dx/|d|) always points to
        // the "top" side in screen terms; CCW to "bottom".
        if (vAlign !== 'middle') {
          const len = Math.hypot(dx, dy)
          if (len > 0) {
            const fontSize = props.textFontSize ?? DEFAULT_OVERLAY_PROPERTIES.textFontSize
            const offsetMag = fontSize * 0.6 + 6
            const sign = vAlign === 'top' ? 1 : -1
            ax += sign * (dy / len) * offsetMag
            ay += sign * (-dx / len) * offsetMag
          }
        }

        figures.push({
          type: 'editableText',
          attrs: {
            x: ax,
            y: ay,
            text,
            align: 'center',
            baseline: 'middle',
            angle
          },
          styles: textStyle(id)
        })
      }

      // Stats label. Each selected key contributes one snippet;
      // snippets are grouped into three rows per spec (row 1:
      // price / percent / pips, row 2: bars / time / distance,
      // row 3: angle). Rows separated by `\n` — the `text` figure
      // splits on newlines and stacks the lines.
      if (statsSelected.length > 0 && overlay.points.length === 2) {
        const p0 = overlay.points[0]
        const p1 = overlay.points[1]
        const v0 = p0.value
        const v1 = p1.value
        const priceDiff = (isNumber(v0) && isNumber(v1)) ? (v1 - v0) : null
        const precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE

        // Pip conversion — TV convention: 1 pip = the last-but-one
        // decimal for FX-like symbols. Falls back to the smallest
        // representable unit at the current precision when the
        // symbol doesn't expose a distinct pip.
        const pipMultiplier = Math.pow(10, Math.max(0, precision - 1))

        const snippetFor = (key: StatKey): string | null => {
          switch (key) {
            case 'priceRange':
              return priceDiff !== null ? formatPrecision(Math.abs(priceDiff), precision) : null
            case 'percentRange':
              if (priceDiff === null || v0 === 0 || !isNumber(v0)) return null
              return `${((priceDiff / v0) * 100).toFixed(2)}%`
            case 'pipsChange':
              return priceDiff !== null ? `${Math.round(priceDiff * pipMultiplier)} pips` : null
            case 'barsRange': {
              const i0 = p0.dataIndex
              const i1 = p1.dataIndex
              if (!isNumber(i0) || !isNumber(i1)) return null
              return `${Math.abs(i1 - i0)} bars`
            }
            case 'timeRange': {
              const t0 = p0.timestamp
              const t1 = p1.timestamp
              if (!isNumber(t0) || !isNumber(t1)) return null
              return formatDuration(t1 - t0)
            }
            case 'distance':
              // Screen-pixel Euclidean distance between the two
              // rendered anchors. Not a chart-domain metric — but
              // TV surfaces the same and it's what users expect
              // "distance" to mean visually.
              return `${Math.round(Math.hypot(dx, dy))}px`
            case 'angle': {
              // Chart-domain angle: dy is inverted because canvas
              // y grows downward. Report degrees so the user gets
              // a familiar number.
              const deg = Math.atan2(-dy, dx) * 180 / Math.PI
              return `${deg.toFixed(1)}°`
            }
          }
        }

        const row1: string[] = []
        const row2: string[] = []
        const row3: string[] = []
        for (const key of STAT_KEYS) {
          if (!statsSelected.includes(key)) continue
          const snippet = snippetFor(key)
          if (snippet === null) continue
          const idx = STAT_KEYS.indexOf(key)
          if (idx < 3) row1.push(snippet)
          else if (idx < 6) row2.push(snippet)
          else row3.push(snippet)
        }
        const rows = [row1, row2, row3].filter(r => r.length > 0).map(r => r.join(' | '))
        if (rows.length > 0) {
          // Anchor along the line. Auto puts the label at the
          // higher-price side of the segment (anchor with smaller
          // y in screen terms) to stay clear of price action;
          // ties fall back to center.
          let posT = 0.5
          if (statsPosition === 'left') {
            posT = 0.1
          } else if (statsPosition === 'right') {
            posT = 0.9
          } else if (statsPosition === 'auto') {
            if (lineCoordinates[0].y < lineCoordinates[1].y) {
              posT = 0.1
            } else if (lineCoordinates[0].y > lineCoordinates[1].y) {
              posT = 0.9
            } else {
              posT = 0.5
            }
          }
          const sx = lineCoordinates[0].x + dx * posT
          const sy = lineCoordinates[0].y + dy * posT

          // Offset perpendicular to the line so the chip doesn't
          // sit on top of the line. Reuse the same CW-perpendicular
          // math as the text label (top side); the stats label is
          // always above so it's consistent with TV.
          //
          // We used to scale the offset with the chip's half-width
          // to keep it clear at tilt (because `align: 'center'`
          // means both left and right edges project onto the
          // line's perpendicular by W·|sin θ|). That worked but
          // pushed the chip far from the line at intermediate
          // angles.
          //
          // Simpler fix: pick `align` dynamically so the chip
          // extends *away* from the line horizontally. Then only
          // the vertical extension matters, and a small constant
          // perpendicular offset (~10 px) hugs the line at every
          // angle without overlap.
          //
          //   * Line going up-right (dy < 0, perp is up-left):
          //     use `align: 'right'` — chip anchor is its right
          //     edge, chip extends left.
          //   * Line going down-right (dy > 0, perp is up-right):
          //     use `align: 'left'` — chip anchor is its left
          //     edge, chip extends right.
          //   * Near-horizontal: `align: 'center'` — either side
          //     works so the chip stays centred on the anchor.
          const lenRaw = Math.hypot(dx, dy)
          const len = lenRaw === 0 ? 1 : lenRaw
          const offsetMag = 10
          const labelX = sx + (dy / len) * offsetMag
          const labelY = sy + (-dx / len) * offsetMag
          const flatnessThreshold = 0.15
          const statsAlign: CanvasTextAlign = Math.abs(dy) / len < flatnessThreshold
            ? 'center'
            : dy < 0 ? 'right' : 'left'

          const statsColor = props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
          figures.push({
            type: 'text',
            attrs: {
              x: labelX,
              y: labelY,
              text: rows.join('\n'),
              align: statsAlign,
              baseline: 'bottom'
            },
            styles: {
              color: '#FFFFFF',
              size: 11,
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 7,
              paddingBottom: 7,
              backgroundColor: statsColor,
              borderColor: statsColor,
              borderRadius: 3
            }
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
          ignoreEvent: true
        }
      })
    },
    setProperties,
    getProperties
  }
}

export default segment
