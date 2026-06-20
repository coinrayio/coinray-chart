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
 * Price Note overlay — TradingView-style two-point annotation that
 * pairs a Note-shaped price marker with an inline label on its
 * leader line.
 *
 * Click 1 places an anchor (x snapped to nearest bar, y free). Click
 * 2 places the label box centre. The result has three text-bearing
 * pieces:
 *
 *   • An anchor dot ringed by a light-gray circle, matching Note.
 *   • A leader line from the anchor to whichever of the four label-
 *     edge midpoints is closest; the line carries an inline-editable
 *     annotation at its midpoint (the user's free-form note about
 *     the bar / price).
 *   • A dark rounded label that auto-displays the formatted price at
 *     the anchor's y-value — NOT user-editable.
 *
 * Style controls match Note exactly: leader-line colour, label fill
 * + border, text colour / size / weight (applies to both label and
 * line texts). The Text tab's text-content field edits the LINE
 * annotation — the label price is read-only.
 *
 * Rendering re-uses Note's per-figure-explicit style approach so a
 * user-picked polygon colour can't bleed into the anchor dot (also a
 * polygon-style fill).
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import { calcTextWidth } from '../../common/utils/canvas'
import { formatPrecision } from '../../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'
import { isNumber } from '../../common/utils/typeChecks'

interface PriceNoteOverlayData {
  /** Inline-editable annotation rendered along the leader line. */
  lineText?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontFamily?: string
  lineColor?: string
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
}

interface OverlayStyleSlice {
  line?: { color?: string }
  polygon?: { color?: string, borderColor?: string, borderSize?: number }
  text?: { color?: string, size?: number, family?: string, weight?: number | string, backgroundColor?: string }
}

// Visual defaults — same palette as Note.
const DEFAULT_LINE_COLOR = '#787b86'
const DEFAULT_LABEL_BG = 'rgba(30, 33, 41, 0.95)'
const DEFAULT_RING_COLOR = 'rgba(255, 255, 255, 0.35)'
const ANCHOR_DOT_RADIUS = 3
const ANCHOR_RING_RADIUS = 6
const LABEL_PADDING_H = 8
const LABEL_PADDING_V = 5
const LABEL_BORDER_RADIUS = 4
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'

function parseExtendData (extendData: unknown): PriceNoteOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as PriceNoteOverlayData
  }
  return {}
}

interface XY { x: number, y: number }

/**
 * Return the midpoint of the label-rect edge closest to `anchor` —
 * same nearest-edge picker as Note.
 */
function nearestMidpoint (
  anchor: XY,
  rect: { x: number, y: number, width: number, height: number }
): XY {
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2
  const midpoints: XY[] = [
    { x: rect.x, y: midY },
    { x: rect.x + rect.width, y: midY },
    { x: midX, y: rect.y },
    { x: midX, y: rect.y + rect.height }
  ]
  let best = midpoints[0]
  let bestDist = Infinity
  for (const p of midpoints) {
    const dx = p.x - anchor.x
    const dy = p.y - anchor.y
    const d2 = dx * dx + dy * dy
    if (d2 < bestDist) {
      bestDist = d2
      best = p
    }
  }
  return best
}

const priceNote: OverlayTemplate = {
  name: 'priceNote',
  // 2 clicks (anchor + label centre). totalStep = clicks + 1.
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 2) return []

    const data = parseExtendData(overlay.extendData)
    const styles = (overlay.styles ?? {}) as OverlayStyleSlice

    const fontSize = styles.text?.size ?? data.fontSize ?? DEFAULT_FONT_SIZE
    const fontWeight = styles.text?.weight ?? data.fontWeight ?? 'normal'
    const fontFamily = styles.text?.family ?? data.fontFamily ?? DEFAULT_FONT_FAMILY
    const textColor = styles.text?.color ?? data.textColor

    const lineColor = styles.line?.color ?? data.lineColor ?? DEFAULT_LINE_COLOR
    const labelBg = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_LABEL_BG
    const borderColor = styles.polygon?.borderColor ?? data.borderColor
    const borderWidth = styles.polygon?.borderSize ?? data.borderWidth ?? 0

    // Label text is the formatted price at the anchor's y-value —
    // read-only. Falls back to '0.00' for sizing only when no price
    // is available (during the brief drawing window).
    const priceValue = overlay.points[0]?.value
    const priceText = isNumber(priceValue)
      ? formatPrecision(priceValue, chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE)
      : ''
    const labelSizingText = priceText.length > 0 ? priceText : '0.00'
    const labelTextWidth = calcTextWidth(labelSizingText, fontSize, fontWeight, fontFamily)
    const labelWidth = labelTextWidth + LABEL_PADDING_H * 2
    const labelHeight = fontSize + LABEL_PADDING_V * 2

    const anchor = coordinates[0]
    const labelCentre = coordinates[1]
    const labelRect = {
      x: labelCentre.x - labelWidth / 2,
      y: labelCentre.y - labelHeight / 2,
      width: labelWidth,
      height: labelHeight
    }
    const connectionPoint = nearestMidpoint(anchor, labelRect)

    // Per-figure styles — explicit so the engine's overlay-level
    // merge can't paint a user-set polygon colour onto the anchor
    // dot (which is also a polygon fill).
    const leaderStyle: Record<string, unknown> = { color: lineColor, size: 1, style: 'solid' }
    const labelFillStyle: Record<string, unknown> = {
      style: 'fill',
      color: labelBg,
      borderRadius: LABEL_BORDER_RADIUS,
      borderSize: 0
    }
    const anchorDotStyle: Record<string, unknown> = {
      style: 'fill',
      color: lineColor,
      borderSize: 0
    }
    const anchorRingStyle: Record<string, unknown> = {
      style: 'stroke',
      color: 'transparent',
      borderColor: DEFAULT_RING_COLOR,
      borderSize: 1
    }
    // Label price text — plain canvas text, no editor mounting.
    const labelTextStyle: Record<string, unknown> = {
      size: fontSize,
      weight: fontWeight,
      family: fontFamily,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderSize: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0
    }
    if (textColor !== undefined) labelTextStyle.color = textColor
    // Editable text on the leader line — inherits Note's editor look
    // (transparent bg / no border) so it reads as a free-floating
    // annotation rather than a second bubble.
    const lineEditableStyle: Record<string, unknown> = {
      size: fontSize,
      weight: fontWeight,
      family: fontFamily
    }
    if (textColor !== undefined) lineEditableStyle.color = textColor

    // Drag scoping — matches Note's TV semantics:
    //   * Drag the leader line   → whole overlay translates.
    //   * Drag the anchor        → only point 0 moves.
    //   * Drag the label / text  → only point 1 moves.
    // No `ignoreEvent` on any figure so hover / click route through
    // for highlight + selection.
    const figures: OverlayFigure[] = [
      {
        type: 'line',
        attrs: { coordinates: [anchor, connectionPoint] },
        styles: leaderStyle
      },
      {
        type: 'rect',
        attrs: { x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height },
        styles: labelFillStyle,
        pointIndex: 1
      }
    ]

    // Optional border rect — only when the user sets a distinct
    // colour + non-zero width. Same gate as Note.
    if (borderColor !== undefined && borderWidth > 0) {
      figures.push({
        type: 'rect',
        attrs: { x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height },
        styles: {
          style: 'stroke',
          color: 'transparent',
          borderColor,
          borderSize: borderWidth,
          borderRadius: LABEL_BORDER_RADIUS
        },
        pointIndex: 1
      })
    }

    figures.push({
      type: 'text',
      attrs: {
        x: labelCentre.x,
        y: labelCentre.y,
        text: priceText,
        align: 'center',
        baseline: 'middle'
      },
      styles: labelTextStyle,
      pointIndex: 1
    })

    // Editable annotation parallel to the leader line, sitting just
    // above it (perpendicular offset toward the visually-upper side).
    //
    // Rotation:
    //   1. Compute the line's angle. If it points "leftward" (outside
    //      [-π/2, π/2]) the text would render upside-down, so flip by
    //      π — now the angle reads left-to-right.
    //   2. The perpendicular toward the visually-upper side of the
    //      ORIGINAL line is (sin α, -cos α); when we flip α by π, that
    //      perpendicular also flips. So we recompute the perpendicular
    //      from the FLIPPED angle, which gives us the consistent
    //      "above" side after the flip — preventing the text from
    //      ending up below the line at certain orientations.
    const dx = connectionPoint.x - anchor.x
    const dy = connectionPoint.y - anchor.y
    let lineAngle = Math.atan2(dy, dx)
    if (lineAngle > Math.PI / 2 || lineAngle < -Math.PI / 2) {
      lineAngle += lineAngle > 0 ? -Math.PI : Math.PI
    }
    // Perpendicular pointing "up" relative to the (post-flip) reading
    // direction. Canvas y is down, so the upper side has negative y.
    const perpDx = Math.sin(lineAngle)
    const perpDy = -Math.cos(lineAngle)
    // Distance from the line: half the text height + a small margin
    // so descenders don't visually touch the line.
    const perpDistance = fontSize / 2 + 4
    const lineMidX = (anchor.x + connectionPoint.x) / 2 + perpDx * perpDistance
    const lineMidY = (anchor.y + connectionPoint.y) / 2 + perpDy * perpDistance
    figures.push({
      type: 'editableText',
      attrs: {
        x: lineMidX,
        y: lineMidY,
        text: data.lineText ?? '',
        align: 'center',
        baseline: 'middle',
        angle: lineAngle
      },
      styles: lineEditableStyle
    })

    figures.push({
      type: 'circle',
      attrs: { x: anchor.x, y: anchor.y, r: ANCHOR_DOT_RADIUS },
      styles: anchorDotStyle,
      pointIndex: 0
    })

    figures.push({
      type: 'circle',
      attrs: { x: anchor.x, y: anchor.y, r: ANCHOR_RING_RADIUS },
      styles: anchorRingStyle,
      pointIndex: 0
    })

    return figures
  },

  // Inline text edits write to `extendData.lineText` (not `.text`),
  // distinguishing it from the read-only price displayed in the
  // label.
  onTextChange: ({ overlay, text: newText }) => {
    const current = parseExtendData(overlay.extendData)
    overlay.extendData = { ...current, lineText: newText }
  }
}

export type { PriceNoteOverlayData }

export default priceNote
