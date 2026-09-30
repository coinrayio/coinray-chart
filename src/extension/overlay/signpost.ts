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
 * Signpost overlay — TradingView-style single-click bar marker.
 *
 * One click drops a Note-style rounded dark label on the chart;
 * x snaps to the nearest bar, y is free. A vertical line then
 * connects the label to the candle at that bar — stopping just
 * above the candle's high if the label sits above the candle, just
 * below the candle's low if below, and running all the way to the
 * pane's bottom when the click lands past the last bar (where no
 * candle exists). When the label visually overlaps the candle's
 * body, the line is suppressed.
 *
 * The label text is inline-editable (same auto-mount + textarea
 * pipeline as Note / Callout).
 *
 * Optional emoji "pin" — when enabled via extendData, an emoji
 * glyph encircled by a configurable coloured ring is rendered at
 * the midpoint of the vertical line. This pass exposes the engine-
 * level support; the host-side custom editor for the toggle / emoji
 * picker / ring colour is a Pass-2 follow-up.
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import type ChartImp from '../../Chart'
import { calcTextWidth } from '../../common/utils/canvas'
import { wrapText } from '../figure/text'
import { glyphFigure, ICON_SOURCE_VIEWBOX, ICON_VALUE_PREFIX } from './emojiGlyph'
import { isNumber } from '../../common/utils/typeChecks'

interface SignpostOverlayData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  fontFamily?: string
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  /** Emoji "pin" — when true, render `emoji` inside a coloured ring on the line. */
  emojiEnabled?: boolean
  emoji?: string
  emojiRingColor?: string
}

interface OverlayStyleSlice {
  line?: { color?: string }
  polygon?: { color?: string, borderColor?: string, borderSize?: number }
  text?: { color?: string, size?: number, family?: string, weight?: number | string, fontStyle?: string, backgroundColor?: string }
}

// Visual defaults — same palette as Note / Price Note.
const DEFAULT_LINE_COLOR = '#787b86'
const DEFAULT_LABEL_BG = 'rgba(30, 33, 41, 0.95)'
const DEFAULT_LABEL_BORDER = '#2a2e39'
const DEFAULT_TEXT_COLOR = '#d1d4dc'
const DEFAULT_EMOJI_RING_COLOR = '#2962ff'
const DEFAULT_EMOJI = '🙂'
// TV's signpost label: centred text wrapped at ~120px, 15px between lines.
const LABEL_PADDING_H = 15
const LABEL_PADDING_V = 5
const LABEL_WRAP_WIDTH = 120
const LABEL_LINE_HEIGHT = 1.25
const LABEL_BORDER_RADIUS = 4
const DEFAULT_FONT_SIZE = 12
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'
// Gap between the line's end and the candle's high / low so the line
// doesn't visually touch the wick.
const LINE_GAP_TO_CANDLE = 3
const LINE_GAP_TO_PANE_EDGE = 2
// Emoji pin geometry — circle ring + glyph centred at the midpoint
// of the line. Size feels right against a 14-px font label.
// TV's pin: a 70px disc in the plate colour, on the pole right next to the label.
const EMOJI_RING_RADIUS = 35
const EMOJI_FONT_SIZE = 34
const EMOJI_LABEL_GAP = 10

// Render size for the icon-mode pin glyph. ICON_SOURCE_VIEWBOX is
// the source 24×24 grid every Tabler icon uses; shrinking to 75%
// (~18 px) reads roughly the same visual weight as a 14-px emoji
// inside the ring. The shared `glyphFigure` helper handles the
// actual path scaling + figure construction so we keep one
// implementation across overlays.
const ICON_RENDER_SIZE = ICON_SOURCE_VIEWBOX * 1.5

function parseExtendData (extendData: unknown): SignpostOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as SignpostOverlayData
  }
  return {}
}

interface XY { x: number, y: number }

const signpost: OverlayTemplate = {
  name: 'signpost',
  // Single-click overlay; engine convention is clicks + 1.
  totalStep: 2,
  needDefaultPointFigure: false,
  // The default x-axis figure only shows while the overlay is
  // selected (gated by `clickOverlayInfo` in OverlayXAxisView).
  // Signpost wants the bar's time visible at all times — so we
  // disable the default and provide our own via createXAxisFigures
  // below, which is rendered unconditionally per frame.
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []

    const data = parseExtendData(overlay.extendData)
    const styles = (overlay.styles ?? {}) as OverlayStyleSlice

    const textValue = data.text ?? ''
    const fontSize = styles.text?.size ?? data.fontSize ?? DEFAULT_FONT_SIZE
    const fontWeight = styles.text?.weight ?? data.fontWeight ?? 'normal'
    const fontFamily = styles.text?.family ?? data.fontFamily ?? DEFAULT_FONT_FAMILY
    const textColor = styles.text?.color ?? data.textColor ?? DEFAULT_TEXT_COLOR

    const lineColor = styles.line?.color ?? DEFAULT_LINE_COLOR
    const labelBg = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_LABEL_BG
    const borderColor = styles.polygon?.borderColor ?? data.borderColor ?? DEFAULT_LABEL_BORDER
    const borderWidth = styles.polygon?.borderSize ?? data.borderWidth ?? 1

    const emojiEnabled = data.emojiEnabled === true
    const emojiGlyph = data.emoji ?? DEFAULT_EMOJI
    const emojiRingColor = data.emojiRingColor ?? DEFAULT_EMOJI_RING_COLOR

    // Label sized around the typed content (or the placeholder for
    // an empty label so the rect doesn't collapse). Note's MIN width
    // floor wasn't used here because Signpost doesn't pin the editor
    // width — TV's Signpost label hugs its content.
    const sizingText = textValue.length > 0 ? textValue : '+ Add text'
    // Wrapped at TV's width, but never inside a word: a longer one (big font) widens the label.
    const wrapWidth = Math.max(LABEL_WRAP_WIDTH, ...sizingText.split(/\s+/).map(w => Math.ceil(calcTextWidth(w, fontSize, fontWeight, fontFamily)) + 4))
    const lines = wrapText(sizingText, wrapWidth, fontSize, fontWeight, fontFamily)
    const maxLineWidth = Math.max(...lines.map(l => calcTextWidth(l, fontSize, fontWeight, fontFamily)))
    const lineStep = fontSize * LABEL_LINE_HEIGHT
    // +1: the editor re-wraps at width minus padding, which must not come out a hair short.
    const labelWidth = Math.ceil(maxLineWidth) + LABEL_PADDING_H * 2 + 1
    const labelHeight = lines.length * lineStep + LABEL_PADDING_V * 2

    // TV puts the label's bottom edge on the point, with the pin above it.
    const labelCentre = { x: coordinates[0].x, y: coordinates[0].y - labelHeight / 2 }
    const hasPin = emojiEnabled && emojiGlyph.length > 0
    const labelRect = {
      x: labelCentre.x - labelWidth / 2,
      y: labelCentre.y - labelHeight / 2,
      width: labelWidth,
      height: labelHeight
    }
    const labelTop = labelRect.y
    const labelBottom = labelRect.y + labelRect.height
    // Top of everything above the pole's far end: the label, or the pin over it.
    const stackTop = hasPin ? labelTop - EMOJI_LABEL_GAP - 2 * EMOJI_RING_RADIUS : labelTop

    // Determine line direction and endpoint by inspecting the candle
    // at the snapped bar — high / low get translated to screen y via
    // the y-axis. If the click landed beyond the last bar (no candle
    // data), the line runs to the bottom of the pane.
    const point = overlay.points[0]
    const dataList = chart.getDataList()
    const dataIndex = isNumber(point.dataIndex) ? point.dataIndex : null
    const candle = (dataIndex !== null && dataIndex >= 0 && dataIndex < dataList.length)
      ? dataList[dataIndex]
      : null

    let lineStart: XY | null = null
    let lineEnd: XY | null = null

    if (candle !== null && yAxis !== null) {
      const candleHighY = yAxis.convertToPixel(candle.high)
      const candleLowY = yAxis.convertToPixel(candle.low)
      // Label is ENTIRELY above the candle → line down from label's
      // bottom edge to just above the candle's high.
      if (labelBottom < candleHighY - LINE_GAP_TO_CANDLE) {
        lineStart = { x: labelCentre.x, y: labelBottom }
        lineEnd = { x: labelCentre.x, y: candleHighY - LINE_GAP_TO_CANDLE }
      } else if (stackTop > candleLowY + LINE_GAP_TO_CANDLE) {
        // Label is ENTIRELY below → line up from label's top edge to
        // just below the candle's low.
        lineStart = { x: labelCentre.x, y: stackTop }
        lineEnd = { x: labelCentre.x, y: candleLowY + LINE_GAP_TO_CANDLE }
      }
      // else: label overlaps candle vertically → suppress the line.
    } else {
      // No candle at this index (click past the last bar). Draw the
      // line down from the label to the bottom of the pane.
      lineStart = { x: labelCentre.x, y: labelBottom }
      lineEnd = { x: labelCentre.x, y: bounding.height - LINE_GAP_TO_PANE_EDGE }
    }

    // Per-figure explicit styles so the engine's overlay-level merge
    // doesn't paint one user pick onto every shape (the emoji ring
    // and the label rect are both polygon-style fills).
    const leaderStyle: Record<string, unknown> = { color: lineColor, size: 1, style: 'solid' }
    const labelFillStyle: Record<string, unknown> = {
      style: 'fill',
      color: labelBg,
      borderRadius: LABEL_BORDER_RADIUS,
      borderSize: 0
    }
    const editableTextStyle: Record<string, unknown> = {
      size: fontSize,
      weight: fontWeight,
      family: fontFamily,
      backgroundColor: labelBg,
      borderRadius: LABEL_BORDER_RADIUS,
      paddingLeft: LABEL_PADDING_H,
      paddingRight: LABEL_PADDING_H,
      // Glyphs are drawn from the top of a line step; centre them in it.
      paddingTop: LABEL_PADDING_V + (lineStep - fontSize) / 2,
      paddingBottom: LABEL_PADDING_V,
      lineHeight: LABEL_LINE_HEIGHT
    }
    editableTextStyle.color = textColor
    const fontStyle = styles.text?.fontStyle ?? data.fontStyle
    if (fontStyle !== undefined) editableTextStyle.fontStyle = fontStyle

    const figures: OverlayFigure[] = []

    // The pole runs from the label (or the pin above it) to the candle.
    if (hasPin) {
      const pin = { x: labelCentre.x, y: labelTop - EMOJI_LABEL_GAP - EMOJI_RING_RADIUS }
      figures.push({
        type: 'circle',
        attrs: { x: pin.x, y: pin.y, r: EMOJI_RING_RADIUS },
        styles: { style: 'fill', color: emojiRingColor, borderSize: 0 }
      })
      figures.push(glyphFigure({
        x: pin.x,
        y: pin.y,
        value: emojiGlyph,
        size: emojiGlyph.startsWith(ICON_VALUE_PREFIX) ? ICON_RENDER_SIZE : EMOJI_FONT_SIZE,
        color: '#ffffff',
        fontFamily: DEFAULT_FONT_FAMILY
      }))
    }
    if (lineStart !== null && lineEnd !== null) {
      figures.push({ type: 'line', attrs: { coordinates: [lineStart, lineEnd] }, styles: leaderStyle })
    }

    // Label rect.
    figures.push({
      type: 'rect',
      attrs: { x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height },
      styles: labelFillStyle
    })

    // Border around the label: TV's 1px by default, off at width 0.
    if (borderWidth > 0) {
      figures.push({
        type: 'rect',
        attrs: { x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height },
        styles: {
          style: 'stroke',
          color: 'transparent',
          borderColor,
          borderSize: borderWidth,
          borderRadius: LABEL_BORDER_RADIUS
        }
      })
    }

    figures.push({
      type: 'editableText',
      attrs: {
        x: labelCentre.x,
        y: labelCentre.y,
        width: labelWidth,
        height: labelHeight,
        text: textValue,
        align: 'center',
        baseline: 'middle',
        wrap: true
      },
      styles: editableTextStyle
    })

    return figures
  },

  // Always-visible x-axis label — formatted date of the snapped bar.
  // OverlayXAxisView calls this every frame (no selection gate), so
  // the date sits under the vertical line whether the user has the
  // overlay selected or not. The default-figure path is opt-out
  // above to avoid double-drawing on selection.
  createXAxisFigures: (params) => {
    // `getChartStore` (and the inner formatter it exposes) live on
    // the impl class — not the public Chart interface — so we widen
    // just `chart` here. Every other param keeps its inferred type.
    const { chart, overlay, coordinates } = params as typeof params & { chart: ChartImp }
    if (coordinates.length < 1) return []
    const point = overlay.points[0]
    if (!isNumber(point.timestamp)) return []
    const text = chart.getChartStore().getInnerFormatter()
      .formatDate(point.timestamp, 'YYYY-MM-DD HH:mm', 'crosshair')
    return [{
      type: 'text',
      attrs: { x: coordinates[0].x, y: 0, text, align: 'center' },
      ignoreEvent: true
    }]
  },

  onTextChange: ({ overlay, text: newText }) => {
    const current = parseExtendData(overlay.extendData)
    overlay.extendData = { ...current, text: newText }
  }
}

export type { SignpostOverlayData }

export default signpost
