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
 * Price Label overlay — TradingView-style single-click price marker.
 *
 * One click places a small rounded label whose tail-tip sits at the
 * click point. The x-coord snaps to the nearest bar (via the engine's
 * step-based draw flow); y is free. The label text is the formatted
 * price at the click's y-value — read off the chart's symbol
 * precision, NOT user-editable.
 *
 * Shape is Callout-shaped — rounded rect + triangular tail — but the
 * tail is FIXED at the bottom edge near the left, not nearest-edge.
 * The tail's apex is at the click point, its base sits on the
 * bubble's bottom edge offset 14px from the bubble's left edge. The
 * bubble extends up-and-mostly-right from the click point.
 *
 * Single-point overlay → dragging anywhere on the bubble translates
 * the one point. The engine's default point handle stays visible at
 * the click coord (tail tip) when hovered or selected.
 *
 * Rendered as one polygon traced clockwise around the combined
 * bubble + tail outline, so the rect ↔ tail boundary disappears at
 * any fill alpha (same approach Callout uses).
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import { calcTextWidth } from '../../common/utils/canvas'
import { formatPrecision } from '../../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'
import { isNumber } from '../../common/utils/typeChecks'

interface PriceLabelOverlayData {
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontFamily?: string
  backgroundColor?: string
  borderColor?: string
}

interface OverlayStyleSlice {
  polygon?: { color?: string, borderColor?: string }
  text?: { color?: string, size?: number, family?: string, weight?: number | string }
}

// Visual defaults — tuned to match TradingView's Price Label.
const DEFAULT_FILL = 'rgba(30, 33, 41, 0.95)'
const DEFAULT_BORDER = DEFAULT_FILL
const BORDER_WIDTH = 1
const LABEL_PADDING_H = 10
const LABEL_PADDING_V = 9
const LABEL_BORDER_RADIUS = 4
// Tail attachment — base centre sits this many pixels right of the
// bubble's left edge. "Near, but not at" the bottom-left corner.
const TAIL_LEFT_OFFSET = 10
// The bubble's left edge sits this many pixels RIGHT of the click
// point, so the tail tip lands slightly OUTSIDE the bubble's left
// side — matching TV's Price Label where the V-protrusion juts down-
// and-left of the label's bottom-left corner.
const BUBBLE_LEFT_OUTSET = 8
const TAIL_BASE_WIDTH = 10
const TAIL_HEIGHT = 14
const DEFAULT_FONT_SIZE = 12
// Price Label text is bold per TV — distinguishes it from Comment /
// Note's regular weight.
const DEFAULT_FONT_WEIGHT = 'bold' as const
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'
const ARC_SEGMENTS = 6

function parseExtendData (extendData: unknown): PriceLabelOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as PriceLabelOverlayData
  }
  return {}
}

interface XY { x: number, y: number }

function pushArc (
  out: XY[],
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number
): void {
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS
    const angle = startAngle + (endAngle - startAngle) * t
    out.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  }
}

/**
 * Trace the bubble + tail outline clockwise. Tail interrupts the
 * bottom edge between `base1` (rightward) and `base2` (leftward) —
 * matching Callout's edge-bottom clockwise convention.
 */
function buildBubblePolygon (
  rect: { x: number, y: number, width: number, height: number },
  r: number,
  base1: XY,
  base2: XY,
  apex: XY
): XY[] {
  const path: XY[] = []
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height

  // TL arc (left edge → top edge).
  pushArc(path, left + r, top + r, r, Math.PI, 1.5 * Math.PI)
  // TR arc (top edge → right edge).
  pushArc(path, right - r, top + r, r, 1.5 * Math.PI, 2 * Math.PI)
  // BR arc (right edge → bottom edge).
  pushArc(path, right - r, bottom - r, r, 0, 0.5 * Math.PI)
  // Bottom edge clockwise is right → left. Insert detour at the tail
  // attachment: base1 (right of tail) → apex → base2 (left of tail).
  path.push(base1, apex, base2)
  // BL arc (bottom edge → left edge).
  pushArc(path, left + r, bottom - r, r, 0.5 * Math.PI, Math.PI)
  // Left edge implicit on close.
  return path
}

const priceLabel: OverlayTemplate = {
  name: 'priceLabel',
  // Single-click overlay (clicks + 1).
  totalStep: 2,
  // Engine's default point handle at the click coord (tail tip)
  // gives the user something to grab on hover / select.
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) return []

    const data = parseExtendData(overlay.extendData)
    const styles = (overlay.styles ?? {}) as OverlayStyleSlice

    const fontSize = styles.text?.size ?? data.fontSize ?? DEFAULT_FONT_SIZE
    const fontWeight = styles.text?.weight ?? data.fontWeight ?? DEFAULT_FONT_WEIGHT
    const fontFamily = styles.text?.family ?? data.fontFamily ?? DEFAULT_FONT_FAMILY
    const textColor = styles.text?.color ?? data.textColor

    const fill = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_FILL
    const border = styles.polygon?.borderColor ?? data.borderColor ?? DEFAULT_BORDER

    // Auto-derive text from the point's y-value using the chart's
    // configured price precision. Falls back to '' when there's no
    // value (shouldn't happen post-draw but keeps the figure list
    // safe during partial states).
    const priceValue = overlay.points[0]?.value
    const text = isNumber(priceValue)
      ? formatPrecision(priceValue, chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE)
      : ''

    const textWidth = calcTextWidth(text.length > 0 ? text : '0.00', fontSize, fontWeight, fontFamily)
    const bubbleWidth = textWidth + LABEL_PADDING_H * 2
    const bubbleHeight = fontSize + LABEL_PADDING_V * 2

    // Click point IS the tail tip. Bubble's left edge sits
    // BUBBLE_LEFT_OUTSET pixels RIGHT of the tip so the tip lands
    // outside the bubble's bottom-left corner. The bubble extends
    // up-and-right from there.
    const apex = coordinates[0]
    const rect = {
      x: apex.x + BUBBLE_LEFT_OUTSET,
      y: apex.y - TAIL_HEIGHT - bubbleHeight,
      width: bubbleWidth,
      height: bubbleHeight
    }

    // Tail base on the bottom edge, centred TAIL_LEFT_OFFSET pixels
    // right of the bubble's left edge — i.e. "near the left, not at
    // the midpoint". The tail slants diagonally from there down-and-
    // left to the apex outside the bubble. Clockwise on the bottom
    // edge goes right → left, so base1 is the rightward (encountered
    // first) base vertex.
    const baseCentreX = rect.x + TAIL_LEFT_OFFSET
    const base1: XY = { x: baseCentreX + TAIL_BASE_WIDTH / 2, y: rect.y + rect.height }
    const base2: XY = { x: baseCentreX - TAIL_BASE_WIDTH / 2, y: rect.y + rect.height }

    const polygonCoords = buildBubblePolygon(rect, LABEL_BORDER_RADIUS, base1, base2, apex)

    const bubbleStyle: Record<string, unknown> = {
      style: 'stroke_fill',
      color: fill,
      borderColor: border,
      borderSize: BORDER_WIDTH
    }

    // Plain text figure — not editable. Explicit transparent border /
    // background suppresses the engine's default `overlay.text` style
    // (which would otherwise paint a grey box behind the price).
    const textStyle: Record<string, unknown> = {
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
    if (textColor !== undefined) textStyle.color = textColor

    const figures: OverlayFigure[] = [
      {
        type: 'polygon',
        attrs: { coordinates: polygonCoords },
        styles: bubbleStyle
      },
      {
        type: 'text',
        attrs: {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          text,
          align: 'center',
          baseline: 'middle'
        },
        styles: textStyle
        // Do NOT ignoreEvent — clicking the text needs to route
        // through `onSelected` so the floating-settings panel
        // activates. (`ignoreEvent: true` would silently swallow
        // the click without falling through to the polygon.)
      }
    ]

    return figures
  }
}

export type { PriceLabelOverlayData }

export default priceLabel
