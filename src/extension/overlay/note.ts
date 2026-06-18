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
 * Note overlay — TradingView-style two-point annotation.
 *
 * Click 1 places an anchor (tiny dot encircled by a light-gray ring).
 * Click 2 places a label (rounded dark box with editable text inside).
 * A leader line connects the anchor to the midpoint of the label's
 * nearest edge — the connection point is recomputed every render so
 * it stays clean as the label grows with typed content.
 *
 * Both clicks are stored as `{ timestamp, value }` so the overlay
 * tracks bars on pan/zoom. After the second click the engine's
 * auto-mount-after-draw patch (shipped in 1.1) fires on the empty
 * `editableText` figure and the user can type immediately.
 *
 * Styling resolves per-figure to avoid the engine's overlay-level
 * style merge applying one user-set polygon/circle colour to every
 * shape (the anchor dot is also a polygon-style fill; we don't want
 * the user's label-background pick to recolour it).
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import { calcTextWidth } from '../../common/utils/canvas'

interface NoteOverlayData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontFamily?: string
  // Style-tab knobs — kept in extendData so they survive round-trips
  // even if the host writes them via overrideOverlay({ styles }) too.
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

// Visual defaults — chosen to match TradingView's Note tool.
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

function parseExtendData (extendData: unknown): NoteOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as NoteOverlayData
  }
  return {}
}

interface XY { x: number, y: number }

/**
 * Return the midpoint of the label-rect edge closest to `anchor`.
 * We pick whichever of the four border midpoints (left / right /
 * top / bottom of the rect) is geometrically closest, recomputed
 * each render so the connection stays clean as the label grows.
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

const note: OverlayTemplate = {
  // 2 clicks (anchor + label position). totalStep = clicks + 1.
  name: 'note',
  totalStep: 3,
  needDefaultPointFigure: false,
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

    // Style-tab knobs — the settings panel writes to
    // overlay.styles.line / overlay.styles.polygon via the
    // props→styles bridge, so we read there first, then fall through
    // to per-instance extendData, then a TV-style default.
    const lineColor = styles.line?.color ?? data.lineColor ?? DEFAULT_LINE_COLOR
    const labelBg = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_LABEL_BG
    const borderColor = styles.polygon?.borderColor ?? data.borderColor
    const borderWidth = styles.polygon?.borderSize ?? data.borderWidth ?? 0

    // Measure label using the same font we'll render with. When the
    // text is empty we size to the placeholder so the box doesn't
    // collapse — `editableText`'s placeholder ("+ Add text") is what
    // the user will see until they type.
    const sizingText = textValue.length > 0 ? textValue : '+ Add text'
    const textWidth = calcTextWidth(sizingText, fontSize, fontWeight, fontFamily)
    const labelWidth = textWidth + LABEL_PADDING_H * 2
    const labelHeight = fontSize + LABEL_PADDING_V * 2

    const anchor = coordinates[0]
    const labelCenter = coordinates[1]
    const labelRect = {
      x: labelCenter.x - labelWidth / 2,
      y: labelCenter.y - labelHeight / 2,
      width: labelWidth,
      height: labelHeight
    }

    const connectionPoint = nearestMidpoint(anchor, labelRect)

    // Style objects — explicit per-figure so the engine's overlay-
    // level style merge doesn't apply one user setting to every
    // shape (e.g. user picking a label background must not recolour
    // the anchor dot, which is also a circle/polygon figure).
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

    const editableTextStyle: Record<string, unknown> = {
      size: fontSize,
      weight: fontWeight,
      family: fontFamily
    }
    if (textColor !== undefined) editableTextStyle.color = textColor

    const figures: OverlayFigure[] = [
      {
        type: 'line',
        attrs: { coordinates: [anchor, connectionPoint] },
        styles: leaderStyle,
        ignoreEvent: true
      },
      {
        type: 'rect',
        attrs: { x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height },
        styles: labelFillStyle
      }
    ]

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
        ignoreEvent: true
      })
    }

    figures.push({
      type: 'editableText',
      attrs: {
        x: labelCenter.x,
        y: labelCenter.y,
        text: textValue,
        align: 'center',
        baseline: 'middle'
      },
      styles: editableTextStyle
    })

    figures.push({
      type: 'circle',
      attrs: { x: anchor.x, y: anchor.y, r: ANCHOR_DOT_RADIUS },
      styles: anchorDotStyle,
      ignoreEvent: true
    })

    figures.push({
      type: 'circle',
      attrs: { x: anchor.x, y: anchor.y, r: ANCHOR_RING_RADIUS },
      styles: anchorRingStyle,
      ignoreEvent: true
    })

    return figures
  },

  // Persist inline-edited text back into extendData so re-renders
  // and StorageAdapter round-trips keep the typed content.
  onTextChange: ({ overlay, text: newText }) => {
    const current = parseExtendData(overlay.extendData)
    overlay.extendData = { ...current, text: newText }
  }
}

export type { NoteOverlayData }

export default note
