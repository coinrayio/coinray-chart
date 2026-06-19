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
 * Click 1 places an anchor; click 2 places the bubble centre. Output is
 * a rounded-rect bubble with a triangular tail pointing back to the
 * anchor. The tail's base attaches to whichever of eight candidate
 * positions on the bubble's edge is closest to the anchor — four side
 * midpoints (left / right / top / bottom) and four corners — recomputed
 * each render so the bubble looks correct as it resizes around typed
 * content.
 *
 * The bubble reads as a single continuous shape:
 *   • Rect draws fill + border (border defaults to the same colour as
 *     fill so the structural outline is invisible until the user picks
 *     a distinct border colour).
 *   • Triangle fill polygon is INSET 2px inward from the rect edge so
 *     its fill paints over the rect's border segment that lies under
 *     the tail — masking the join line so rect + tail look continuous.
 *   • Two line figures from each base vertex (at the rect edge) to the
 *     apex (anchor) provide the tail's outline; they match the border
 *     colour so they continue the rect's outline seamlessly.
 *
 * The bubble's rect carries `pointIndex: 1`, which (per the new engine
 * convention) makes dragging it translate only the bubble centre — the
 * anchor stays put. Dragging the anchor's default point handle moves
 * only the anchor. This matches the during-drawing behaviour where the
 * two points are independently positioned.
 *
 * The editable-text figure carries the bubble's bg / border / radius /
 * padding so the inline editor's input element looks identical to the
 * canvas-rendered bubble — typing reads as if you're typing into the
 * bubble itself rather than into a separate widget.
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import { calcTextWidth } from '../../common/utils/canvas'

interface CalloutOverlayData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontFamily?: string
  // Style-tab knobs — kept in extendData so they survive round-trips
  // even if the host writes them via overrideOverlay({ styles }) too.
  backgroundColor?: string
  borderColor?: string
}

interface OverlayStyleSlice {
  polygon?: { color?: string, borderColor?: string }
  text?: { color?: string, size?: number, family?: string, weight?: number | string, backgroundColor?: string }
}

// Visual defaults — chosen to match TradingView's Callout tool.
const DEFAULT_FILL = 'rgba(30, 33, 41, 0.95)'
// Border defaults to the same colour as the fill so the outline is
// structurally present but visually invisible — TV's "single blob"
// look. The user picks a distinct colour from the Style tab to make
// the outline appear.
const DEFAULT_BORDER = DEFAULT_FILL
const BORDER_WIDTH = 1
const LABEL_PADDING_H = 8
const LABEL_PADDING_V = 14
const LABEL_BORDER_RADIUS = 4
const TAIL_BASE_WIDTH = 18
// Inset for the triangle fill: the triangle base sits this many pixels
// INSIDE the rect (toward the rect's interior) so its fill paints over
// the rect's border segment running under the tail. Without this, the
// rect's border line where the tail attaches stays visible and the
// join between rect and triangle reads as two separate shapes.
const TAIL_INSET = 2
// Bubble width floor — matches the engine's input-element minimum
// width (also 120) so the inline editor doesn't stick out past the
// bubble for narrow placeholder text on initial draw.
const MIN_BUBBLE_WIDTH = 120
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'

function parseExtendData (extendData: unknown): CalloutOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as CalloutOverlayData
  }
  return {}
}

interface XY { x: number, y: number }

interface TailAttachment {
  /** True base vertices, on the rect's edge — used for the leg lines. */
  base1: XY
  base2: XY
  /** Inset base vertices, INSIDE the rect — used for the fill polygon. */
  fill1: XY
  fill2: XY
}

/**
 * Pick the nearest of eight attachment candidates on the bubble edge
 * (four side midpoints + four corners) and return both the true base
 * vertices (used to draw the two leg lines that complete the outline
 * along the tail) and the inset base vertices (used for the fill
 * polygon, pushed `TAIL_INSET` pixels into the rect's interior so the
 * fill masks the rect's border segment under the tail).
 *
 * For midpoint attachments, the base lies along one edge and the
 * inset moves perpendicular to that edge into the rect (e.g. top
 * midpoint → inset moves downward). For corner attachments, base1
 * sits along one adjacent edge and base2 along the other; their
 * insets each move perpendicular to their own edge.
 */
function nearestTailAttachment (
  anchor: XY,
  rect: { x: number, y: number, width: number, height: number }
): TailAttachment {
  const k = TAIL_BASE_WIDTH / 2
  const i = TAIL_INSET
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2

  // Each candidate carries (snap, base1, base2, fill1, fill2). The
  // snap point is only used to pick the nearest candidate.
  interface Cand { snap: XY, base1: XY, base2: XY, fill1: XY, fill2: XY }
  const candidates: Cand[] = [
    // top-mid
    {
      snap: { x: midX, y: top },
      base1: { x: midX - k, y: top },
      base2: { x: midX + k, y: top },
      fill1: { x: midX - k, y: top + i },
      fill2: { x: midX + k, y: top + i }
    },
    // right-mid
    {
      snap: { x: right, y: midY },
      base1: { x: right, y: midY - k },
      base2: { x: right, y: midY + k },
      fill1: { x: right - i, y: midY - k },
      fill2: { x: right - i, y: midY + k }
    },
    // bottom-mid
    {
      snap: { x: midX, y: bottom },
      base1: { x: midX - k, y: bottom },
      base2: { x: midX + k, y: bottom },
      fill1: { x: midX - k, y: bottom - i },
      fill2: { x: midX + k, y: bottom - i }
    },
    // left-mid
    {
      snap: { x: left, y: midY },
      base1: { x: left, y: midY - k },
      base2: { x: left, y: midY + k },
      fill1: { x: left + i, y: midY - k },
      fill2: { x: left + i, y: midY + k }
    },
    // top-left corner
    {
      snap: { x: left, y: top },
      base1: { x: left + k, y: top },
      base2: { x: left, y: top + k },
      fill1: { x: left + k, y: top + i },
      fill2: { x: left + i, y: top + k }
    },
    // top-right corner
    {
      snap: { x: right, y: top },
      base1: { x: right - k, y: top },
      base2: { x: right, y: top + k },
      fill1: { x: right - k, y: top + i },
      fill2: { x: right - i, y: top + k }
    },
    // bottom-right corner
    {
      snap: { x: right, y: bottom },
      base1: { x: right - k, y: bottom },
      base2: { x: right, y: bottom - k },
      fill1: { x: right - k, y: bottom - i },
      fill2: { x: right - i, y: bottom - k }
    },
    // bottom-left corner
    {
      snap: { x: left, y: bottom },
      base1: { x: left + k, y: bottom },
      base2: { x: left, y: bottom - k },
      fill1: { x: left + k, y: bottom - i },
      fill2: { x: left + i, y: bottom - k }
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
  return { base1: best.base1, base2: best.base2, fill1: best.fill1, fill2: best.fill2 }
}

const callout: OverlayTemplate = {
  // 2 clicks (anchor + bubble centre). totalStep = clicks + 1.
  name: 'callout',
  totalStep: 3,
  // Only render the engine's default point handle at index 0 (the
  // anchor). The bubble centre (index 1) is already represented by
  // the rect itself — a circle drawn in the middle of the editing
  // area would just clutter it. The rect declares `pointIndex: 1`
  // below so dragging the rect still translates only the bubble
  // centre, matching what the default handle would have done.
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

    // Style-tab knobs.
    const fill = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_FILL
    const border = styles.polygon?.borderColor ?? data.borderColor ?? DEFAULT_BORDER

    // Measure bubble against the same font we'll render with; auto-
    // grows around typed content. When empty we size to the engine's
    // placeholder so the bubble doesn't collapse. Floored at
    // MIN_BUBBLE_WIDTH so the inline editor's 120px-floor input
    // doesn't stick out past the bubble at initial draw.
    const sizingText = textValue.length > 0 ? textValue : '+ Add text'
    const textWidth = calcTextWidth(sizingText, fontSize, fontWeight, fontFamily)
    const bubbleWidth = Math.max(textWidth + LABEL_PADDING_H * 2, MIN_BUBBLE_WIDTH)
    const bubbleHeight = fontSize + LABEL_PADDING_V * 2

    const anchor = coordinates[0]
    const centre = coordinates[1]
    const rect = {
      x: centre.x - bubbleWidth / 2,
      y: centre.y - bubbleHeight / 2,
      width: bubbleWidth,
      height: bubbleHeight
    }

    const { base1, base2, fill1, fill2 } = nearestTailAttachment(anchor, rect)

    // Figure styling — explicit per-figure so the engine's overlay-
    // level style merge doesn't paint the user's polygon-colour pick
    // onto every shape on the canvas.
    const bubbleRectStyle: Record<string, unknown> = {
      style: 'stroke_fill',
      color: fill,
      borderColor: border,
      borderSize: BORDER_WIDTH,
      borderRadius: LABEL_BORDER_RADIUS
    }

    const tailFillStyle: Record<string, unknown> = {
      style: 'fill',
      color: fill,
      borderSize: 0
    }

    const tailLegStyle: Record<string, unknown> = {
      color: border,
      size: BORDER_WIDTH,
      style: 'solid'
    }

    // EditableText carries the bubble's full styling — the engine's
    // _startTextEdit reads bg / border / borderRadius / padding /
    // text-align off these styles and applies them to the input
    // element so the editing state looks identical to the canvas
    // rendering. Canvas-side, the editableText figure already forces
    // bg + border transparent at draw time so the rect figure stays
    // responsible for the visual shape.
    const editableTextStyle: Record<string, unknown> = {
      size: fontSize,
      weight: fontWeight,
      family: fontFamily,
      backgroundColor: fill,
      borderColor: border,
      borderSize: BORDER_WIDTH,
      borderRadius: LABEL_BORDER_RADIUS,
      paddingLeft: LABEL_PADDING_H,
      paddingRight: LABEL_PADDING_H,
      paddingTop: LABEL_PADDING_V,
      paddingBottom: LABEL_PADDING_V
    }
    if (textColor !== undefined) editableTextStyle.color = textColor

    // Z-order matters:
    //   1. Rect (fill + border) — full bubble shape including border.
    //   2. Tail fill polygon (inset 2px into the rect) — masks the
    //      rect's border segment that lies under the tail.
    //   3. Two leg lines at the true base vertices on the rect edge
    //      — complete the outline along the triangle's outer edges.
    //   4. EditableText on top.
    const figures: OverlayFigure[] = [
      {
        type: 'rect',
        attrs: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: bubbleRectStyle,
        pointIndex: 1
      },
      {
        type: 'polygon',
        attrs: { coordinates: [fill1, fill2, anchor] },
        styles: tailFillStyle,
        ignoreEvent: true
      },
      {
        type: 'line',
        attrs: { coordinates: [base1, anchor] },
        styles: tailLegStyle,
        ignoreEvent: true
      },
      {
        type: 'line',
        attrs: { coordinates: [base2, anchor] },
        styles: tailLegStyle,
        ignoreEvent: true
      },
      {
        type: 'editableText',
        attrs: {
          x: centre.x,
          y: centre.y,
          text: textValue,
          align: 'center',
          baseline: 'middle'
        },
        styles: editableTextStyle,
        // Editable text sits inside the bubble — its drag must move
        // the bubble centre too, not translate both points. Without
        // this, clicking on the rendered text and dragging would slip
        // back to the engine's default of moving every point.
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
