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
 * Callout overlay — TradingView-style speech-bubble annotation.
 *
 * Click 1 places an anchor; click 2 places the bubble centre. Output
 * is a rounded-rect speech bubble with a triangular tail pointing
 * back to the anchor. The tail's base attaches to whichever of eight
 * candidate positions on the bubble's edge (four side midpoints +
 * four corners) is closest to the anchor — recomputed each render so
 * the bubble looks correct as it auto-grows around typed content.
 *
 * Rendering — single combined polygon:
 *   The bubble + tail is one polygon traced clockwise around the
 *   combined perimeter, with the rounded corners approximated by
 *   short line segments along the corner arcs. The polygon is drawn
 *   stroke + fill in one pass so the rect-meets-tail boundary
 *   disappears completely — even at semi-transparent fills, where
 *   the earlier "rect + separate triangle" approach left a visible
 *   join (the triangle fill couldn't fully opaque-mask the rect's
 *   border line at non-1.0 alpha, and double-painted the overlap).
 *   The border defaults to the same colour as the fill, so the
 *   stroke is visually invisible until the user picks a distinct
 *   border colour from the Style tab.
 *
 * Interaction:
 *   • The polygon carries `pointIndex: 1`, so dragging the bubble
 *     body moves only the bubble centre.
 *   • The anchor is exposed via the engine's default point handle
 *     (`needDefaultPointFigure: [0]`); the bubble centre has no
 *     handle — its rect/polygon IS the handle.
 *   • The editable-text figure also carries `pointIndex: 1` so
 *     dragging the typed text drags the bubble too, not both points.
 *
 * Multi-line text:
 *   The bubble auto-grows both wider (longest line) and taller
 *   (lineCount × fontSize) around `extendData.text`. The engine's
 *   updated `getTextRect` / `drawText` handle `\n`, and the inline
 *   editor is a textarea so Enter inserts a newline.
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import { calcTextWidth } from '../../common/utils/canvas'

interface CalloutOverlayData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontFamily?: string
  backgroundColor?: string
  borderColor?: string
}

interface OverlayStyleSlice {
  polygon?: { color?: string, borderColor?: string }
  text?: { color?: string, size?: number, family?: string, weight?: number | string, backgroundColor?: string }
}

// Visual defaults — chosen to match TradingView's Callout tool.
const DEFAULT_FILL = 'rgba(30, 33, 41, 0.95)'
const DEFAULT_BORDER = DEFAULT_FILL
const BORDER_WIDTH = 1
const LABEL_PADDING_H = 8
const LABEL_PADDING_V = 14
const LABEL_BORDER_RADIUS = 7
const TAIL_BASE_WIDTH = 18
const MIN_BUBBLE_WIDTH = 120
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'
// Number of straight segments approximating each rounded corner.
// 8 is smooth enough at the default 4px radius without bloating the
// polygon's vertex count.
const ARC_SEGMENTS = 8

function parseExtendData (extendData: unknown): CalloutOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as CalloutOverlayData
  }
  return {}
}

interface XY { x: number, y: number }

type AttachKind =
  | 'edge-top' | 'edge-right' | 'edge-bottom' | 'edge-left'
  | 'corner-TL' | 'corner-TR' | 'corner-BR' | 'corner-BL'

interface TailAttachment {
  kind: AttachKind
  /** Where the bubble outline enters the tail detour (clockwise). */
  entry: XY
  /** Where the bubble outline exits the tail detour (clockwise). */
  exit: XY
}

/**
 * Pick the nearest of eight attachment candidates on the bubble edge
 * (four side midpoints + four corners) and return both the attachment
 * kind and the two bubble-edge points where the perimeter splits to
 * insert the tail detour. `entry` is the first point encountered
 * clockwise, `exit` the second — so the detour is always inserted as
 * `entry → anchor → exit` regardless of which side the tail is on.
 */
function nearestTailAttachment (
  anchor: XY,
  rect: { x: number, y: number, width: number, height: number }
): TailAttachment {
  const k = TAIL_BASE_WIDTH / 2
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2

  interface Cand { kind: AttachKind, snap: XY, entry: XY, exit: XY }
  const candidates: Cand[] = [
    {
      kind: 'edge-top',
      snap: { x: midX, y: top },
      entry: { x: midX - k, y: top },
      exit: { x: midX + k, y: top }
    },
    {
      kind: 'edge-right',
      snap: { x: right, y: midY },
      entry: { x: right, y: midY - k },
      exit: { x: right, y: midY + k }
    },
    {
      kind: 'edge-bottom',
      snap: { x: midX, y: bottom },
      entry: { x: midX + k, y: bottom },
      exit: { x: midX - k, y: bottom }
    },
    {
      kind: 'edge-left',
      snap: { x: left, y: midY },
      entry: { x: left, y: midY + k },
      exit: { x: left, y: midY - k }
    },
    {
      kind: 'corner-TL',
      snap: { x: left, y: top },
      entry: { x: left, y: top + k },
      exit: { x: left + k, y: top }
    },
    {
      kind: 'corner-TR',
      snap: { x: right, y: top },
      entry: { x: right - k, y: top },
      exit: { x: right, y: top + k }
    },
    {
      kind: 'corner-BR',
      snap: { x: right, y: bottom },
      entry: { x: right, y: bottom - k },
      exit: { x: right - k, y: bottom }
    },
    {
      kind: 'corner-BL',
      snap: { x: left, y: bottom },
      entry: { x: left + k, y: bottom },
      exit: { x: left, y: bottom - k }
    }
  ]

  let best = candidates[0]
  let bestDist = Infinity
  for (const c of candidates) {
    const dx = c.snap.x - anchor.x
    const dy = c.snap.y - anchor.y
    const d2 = dx * dx + dy * dy
    if (d2 < bestDist) {
      bestDist = d2
      best = c
    }
  }
  return { kind: best.kind, entry: best.entry, exit: best.exit }
}

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
 * Build the polygon vertex list for the combined bubble + tail
 * outline, traced clockwise. For edge attachments all four rounded
 * corners are present and the tail detour splits one straight edge.
 * For corner attachments the tail detour replaces the named arc
 * (and the rect's adjacent edge-tips up to the base points),
 * sketching the corner as a triangle pointing at the anchor.
 */
function buildBubblePolygon (
  rect: { x: number, y: number, width: number, height: number },
  r: number,
  anchor: XY,
  attach: TailAttachment
): XY[] {
  const path: XY[] = []
  const TL = { cx: rect.x + r, cy: rect.y + r, start: Math.PI, end: 1.5 * Math.PI }
  const TR = { cx: rect.x + rect.width - r, cy: rect.y + r, start: 1.5 * Math.PI, end: 2 * Math.PI }
  const BR = { cx: rect.x + rect.width - r, cy: rect.y + rect.height - r, start: 0, end: 0.5 * Math.PI }
  const BL = { cx: rect.x + r, cy: rect.y + rect.height - r, start: 0.5 * Math.PI, end: Math.PI }

  // Clockwise walk starting from the top of the left edge, after TL.
  // For edge attachments: include all four arcs; splice the tail
  // detour into the named edge.
  // For corner attachments: skip the named arc and place the detour
  // where it would have been — the polygon's straight segment from
  // the previous arc's last point to `entry`, then `entry → anchor →
  // exit`, then on to the next arc's first point, naturally forms
  // the tail replacing the corner.
  switch (attach.kind) {
    case 'edge-top':
      pushArc(path, TL.cx, TL.cy, r, TL.start, TL.end)
      path.push(attach.entry, anchor, attach.exit)
      pushArc(path, TR.cx, TR.cy, r, TR.start, TR.end)
      pushArc(path, BR.cx, BR.cy, r, BR.start, BR.end)
      pushArc(path, BL.cx, BL.cy, r, BL.start, BL.end)
      break
    case 'edge-right':
      pushArc(path, TL.cx, TL.cy, r, TL.start, TL.end)
      pushArc(path, TR.cx, TR.cy, r, TR.start, TR.end)
      path.push(attach.entry, anchor, attach.exit)
      pushArc(path, BR.cx, BR.cy, r, BR.start, BR.end)
      pushArc(path, BL.cx, BL.cy, r, BL.start, BL.end)
      break
    case 'edge-bottom':
      pushArc(path, TL.cx, TL.cy, r, TL.start, TL.end)
      pushArc(path, TR.cx, TR.cy, r, TR.start, TR.end)
      pushArc(path, BR.cx, BR.cy, r, BR.start, BR.end)
      path.push(attach.entry, anchor, attach.exit)
      pushArc(path, BL.cx, BL.cy, r, BL.start, BL.end)
      break
    case 'edge-left':
      pushArc(path, TL.cx, TL.cy, r, TL.start, TL.end)
      pushArc(path, TR.cx, TR.cy, r, TR.start, TR.end)
      pushArc(path, BR.cx, BR.cy, r, BR.start, BR.end)
      pushArc(path, BL.cx, BL.cy, r, BL.start, BL.end)
      path.push(attach.entry, anchor, attach.exit)
      break
    case 'corner-TL':
      // Skip TL arc. Detour sits between BL-arc-end (left edge top)
      // and TR-arc-start (top edge left) — but with `entry`/`exit`
      // pulled in by k from those, they naturally interpolate as
      // straight segments along the edges, then the tail leg out
      // to the anchor and back.
      pushArc(path, TR.cx, TR.cy, r, TR.start, TR.end)
      pushArc(path, BR.cx, BR.cy, r, BR.start, BR.end)
      pushArc(path, BL.cx, BL.cy, r, BL.start, BL.end)
      path.push(attach.entry, anchor, attach.exit)
      break
    case 'corner-TR':
      pushArc(path, BR.cx, BR.cy, r, BR.start, BR.end)
      pushArc(path, BL.cx, BL.cy, r, BL.start, BL.end)
      pushArc(path, TL.cx, TL.cy, r, TL.start, TL.end)
      path.push(attach.entry, anchor, attach.exit)
      break
    case 'corner-BR':
      pushArc(path, BL.cx, BL.cy, r, BL.start, BL.end)
      pushArc(path, TL.cx, TL.cy, r, TL.start, TL.end)
      pushArc(path, TR.cx, TR.cy, r, TR.start, TR.end)
      path.push(attach.entry, anchor, attach.exit)
      break
    case 'corner-BL':
      pushArc(path, TL.cx, TL.cy, r, TL.start, TL.end)
      pushArc(path, TR.cx, TR.cy, r, TR.start, TR.end)
      pushArc(path, BR.cx, BR.cy, r, BR.start, BR.end)
      path.push(attach.entry, anchor, attach.exit)
      break
  }
  return path
}

const callout: OverlayTemplate = {
  name: 'callout',
  totalStep: 3,
  // Only the anchor (index 0) gets the engine's default point handle.
  // The bubble centre (index 1) IS the bubble polygon — putting a
  // default circle in the middle of the editing area would just
  // clutter it.
  needDefaultPointFigure: [0],
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 2) return []

    const data = parseExtendData(overlay.extendData)
    const styles = (overlay.styles ?? {}) as OverlayStyleSlice

    const textValue = data.text ?? ''
    const fontSize = styles.text?.size ?? data.fontSize ?? DEFAULT_FONT_SIZE
    const fontWeight = styles.text?.weight ?? data.fontWeight ?? 'normal'
    const fontFamily = styles.text?.family ?? data.fontFamily ?? DEFAULT_FONT_FAMILY
    const textColor = styles.text?.color ?? data.textColor

    const fill = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_FILL
    const border = styles.polygon?.borderColor ?? data.borderColor ?? DEFAULT_BORDER

    // Multi-line-aware measurement: width tracks the widest line,
    // height tracks the line count × fontSize. When empty we size to
    // the placeholder so the bubble doesn't collapse before the user
    // starts typing.
    const sizingText = textValue.length > 0 ? textValue : '+ Add text'
    const lines = sizingText.split('\n')
    const maxLineWidth = lines.length === 1
      ? calcTextWidth(sizingText, fontSize, fontWeight, fontFamily)
      : Math.max(...lines.map(l => calcTextWidth(l, fontSize, fontWeight, fontFamily)))
    const bubbleWidth = Math.max(maxLineWidth + LABEL_PADDING_H * 2, MIN_BUBBLE_WIDTH)
    const bubbleHeight = lines.length * fontSize + LABEL_PADDING_V * 2

    const anchor = coordinates[0]
    const centre = coordinates[1]
    const rect = {
      x: centre.x - bubbleWidth / 2,
      y: centre.y - bubbleHeight / 2,
      width: bubbleWidth,
      height: bubbleHeight
    }

    const attach = nearestTailAttachment(anchor, rect)
    const polygonCoords = buildBubblePolygon(rect, LABEL_BORDER_RADIUS, anchor, attach)

    const bubbleStyle: Record<string, unknown> = {
      style: 'stroke_fill',
      color: fill,
      borderColor: border,
      borderSize: BORDER_WIDTH
    }

    // EditableText carries the bubble's fill / radius / padding so
    // the textarea visually blends into the bubble: same background
    // colour, same rounded corners, same content inset. We
    // deliberately omit borderColor / borderSize — the bubble's
    // polygon underneath provides the visible outline, and we don't
    // want the textarea to draw its own competing border on top of
    // it. (Engine default is borderless anyway; this is explicit
    // about Callout's intent.)
    const editableTextStyle: Record<string, unknown> = {
      size: fontSize,
      weight: fontWeight,
      family: fontFamily,
      backgroundColor: fill,
      borderRadius: LABEL_BORDER_RADIUS,
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
        styles: bubbleStyle,
        pointIndex: 1
      },
      {
        type: 'editableText',
        attrs: {
          x: centre.x,
          y: centre.y,
          // Explicit width / height pin the editor's rect to the
          // bubble's actual size — without these, getTextRect would
          // compute the rect from the natural text width and the
          // textarea would centre on that instead of the (possibly
          // wider) bubble, drifting right until typed content fills
          // the bubble out.
          width: bubbleWidth,
          height: bubbleHeight,
          text: textValue,
          align: 'center',
          baseline: 'middle'
        },
        styles: editableTextStyle,
        pointIndex: 1
      }
    ]

    return figures
  },

  onTextChange: ({ overlay, text: newText }) => {
    const current = parseExtendData(overlay.extendData)
    overlay.extendData = { ...current, text: newText }
  }
}

export type { CalloutOverlayData }

export default callout
