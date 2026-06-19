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
 * Comment overlay — TradingView-style single-click annotation.
 *
 * A single click drops a rounded label whose BOTTOM-LEFT corner sits
 * at the click point — the bubble extends up-and-right from there.
 * Three of the corners (top-left, top-right, bottom-right) are
 * generously rounded (3× Callout's radius); the bottom-left is a
 * sharp 90° corner, which is the visual cue that distinguishes
 * Comment from Callout / a plain text label and points the bubble
 * at the bar.
 *
 * Rendering follows the same single-polygon approach as Callout —
 * one polygon traced clockwise around the bubble, with rounded
 * corners approximated by short line segments — so there's no
 * internal boundary to bleed through at semi-transparent fills.
 *
 * Single-point overlay → no `pointIndex` plumbing needed; dragging
 * anywhere on the bubble translates the (only) point. The engine's
 * default point handle stays visible at the bottom-left while the
 * overlay is hovered or selected, which matches what TV shows.
 *
 * Floating panel + text tab share one source: the bubble's fill
 * lives at `overlay.styles.polygon.color` (same as Callout), so the
 * floating-panel "background colour" and the modal Text tab's
 * background-colour field both route through it and stay in sync.
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import { calcTextWidth } from '../../common/utils/canvas'

interface CommentOverlayData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontFamily?: string
  backgroundColor?: string
}

interface OverlayStyleSlice {
  polygon?: { color?: string }
  text?: { color?: string, size?: number, family?: string, weight?: number | string, backgroundColor?: string }
}

// Visual defaults — tuned to read clearly on a dark candle chart.
const DEFAULT_FILL = 'rgba(30, 33, 41, 0.95)'
const LABEL_PADDING_H = 12
const LABEL_PADDING_V = 14
// 3× Callout's radius (Callout = 7). Three corners use this; the
// bottom-left stays sharp so the bubble "points" at the click target.
const LABEL_BORDER_RADIUS = 21
const MIN_BUBBLE_WIDTH = 120
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'
// Per-corner border-radius for the textarea — CSS shorthand TL TR BR
// BL. Mirrors the canvas polygon's rounded TL/TR/BR + sharp BL.
const EDITOR_BORDER_RADIUS = `${LABEL_BORDER_RADIUS}px ${LABEL_BORDER_RADIUS}px ${LABEL_BORDER_RADIUS}px 0`
// Segments per rounded corner — 12 keeps the larger radius visually
// smooth; the 4px-radius Callout corners get away with 8.
const ARC_SEGMENTS = 12

function parseExtendData (extendData: unknown): CommentOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as CommentOverlayData
  }
  return {}
}

interface XY { x: number, y: number }

/**
 * Push the points along a corner-arc into `out`, sampled clockwise
 * from `startAngle` to `endAngle` at `ARC_SEGMENTS + 1` evenly-spaced
 * angles. Canvas angles: 0° = +x (right), 90° = +y (down), positive
 * direction = clockwise (because y points down).
 */
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
 * Build the polygon vertex list for the bubble outline. Traced
 * clockwise: TL arc → top edge → TR arc → right edge → BR arc →
 * bottom edge → SHARP bottom-left corner → left edge → close to TL.
 * The BL corner is a single vertex with no arc, giving the
 * recognisable "comment" point at the bubble's bottom-left.
 */
function buildBubblePolygon (
  rect: { x: number, y: number, width: number, height: number },
  r: number
): XY[] {
  const path: XY[] = []
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height

  // Top-left arc: from (left, top + r) to (left + r, top).
  pushArc(path, left + r, top + r, r, Math.PI, 1.5 * Math.PI)
  // Top-right arc: from (right - r, top) to (right, top + r).
  pushArc(path, right - r, top + r, r, 1.5 * Math.PI, 2 * Math.PI)
  // Bottom-right arc: from (right, bottom - r) to (right - r, bottom).
  pushArc(path, right - r, bottom - r, r, 0, 0.5 * Math.PI)
  // Sharp BL corner — just the vertex.
  path.push({ x: left, y: bottom })
  // Polygon closes back to TL arc's first point at (left, top + r),
  // i.e. the left edge from (left, bottom) up to TL arc start.
  return path
}

const comment: OverlayTemplate = {
  name: 'comment',
  // One click — engine convention is `clicks + 1`.
  totalStep: 2,
  // Single-point overlay → the engine's default circle handle at the
  // click coordinate (the bubble's bottom-left) is what the user
  // grabs to drag.
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 1) return []

    const data = parseExtendData(overlay.extendData)
    const styles = (overlay.styles ?? {}) as OverlayStyleSlice

    const textValue = data.text ?? ''
    const fontSize = styles.text?.size ?? data.fontSize ?? DEFAULT_FONT_SIZE
    const fontWeight = styles.text?.weight ?? data.fontWeight ?? 'normal'
    const fontFamily = styles.text?.family ?? data.fontFamily ?? DEFAULT_FONT_FAMILY
    const textColor = styles.text?.color ?? data.textColor

    // Bubble fill — reads from polygon.color so the floating-panel
    // "background colour" control and the modal Text tab's background
    // field both route here through the standard
    // overlayPropertiesToKlineStyles bridge (backgroundColor → polygon.color).
    const fill = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_FILL

    // Measure: widest line × line count, floored at the engine's
    // 120px input minimum so the textarea doesn't stick out past
    // the bubble at initial placeholder size.
    const sizingText = textValue.length > 0 ? textValue : '+ Add text'
    const lines = sizingText.split('\n')
    const maxLineWidth = lines.length === 1
      ? calcTextWidth(sizingText, fontSize, fontWeight, fontFamily)
      : Math.max(...lines.map(l => calcTextWidth(l, fontSize, fontWeight, fontFamily)))
    const bubbleWidth = Math.max(maxLineWidth + LABEL_PADDING_H * 2, MIN_BUBBLE_WIDTH)
    const bubbleHeight = lines.length * fontSize + LABEL_PADDING_V * 2

    // Anchor is at the bubble's BOTTOM-LEFT. The rect extends
    // up-and-right from there.
    const anchor = coordinates[0]
    const rect = {
      x: anchor.x,
      y: anchor.y - bubbleHeight,
      width: bubbleWidth,
      height: bubbleHeight
    }

    const polygonCoords = buildBubblePolygon(rect, LABEL_BORDER_RADIUS)

    const bubbleStyle: Record<string, unknown> = {
      style: 'fill',
      color: fill,
      borderSize: 0
    }

    // EditableText carries the bubble's fill + per-corner radius +
    // padding so the textarea visually blends into the bubble. No
    // border (per the engine's borderless-by-default editor look —
    // the polygon underneath has no border either).
    const editableTextStyle: Record<string, unknown> = {
      size: fontSize,
      weight: fontWeight,
      family: fontFamily,
      backgroundColor: fill,
      borderRadius: EDITOR_BORDER_RADIUS,
      paddingLeft: LABEL_PADDING_H,
      paddingRight: LABEL_PADDING_H,
      paddingTop: LABEL_PADDING_V,
      paddingBottom: LABEL_PADDING_V
    }
    if (textColor !== undefined) editableTextStyle.color = textColor

    const figures: OverlayFigure[] = [
      {
        type: 'polygon',
        attrs: { coordinates: polygonCoords },
        styles: bubbleStyle
      },
      {
        type: 'editableText',
        attrs: {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          width: bubbleWidth,
          height: bubbleHeight,
          text: textValue,
          align: 'center',
          baseline: 'middle'
        },
        styles: editableTextStyle
      }
    ]

    return figures
  },

  onTextChange: ({ overlay, text: newText }) => {
    const current = parseExtendData(overlay.extendData)
    overlay.extendData = { ...current, text: newText }
  }
}

export type { CommentOverlayData }

export default comment
