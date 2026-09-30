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
import { lineAroundText } from './tvLine'

interface PriceNoteOverlayData {
  /** Inline-editable annotation rendered along the leader line. */
  lineText?: string
  /** TV's `showLabel`: the annotation only draws while this is on (off by default). */
  lineTextVisible?: boolean
  /** The line text's own style (the label above has fontSize / textColor / fontWeight). */
  lineTextColor?: string
  lineTextSize?: number
  lineTextBold?: boolean
  lineTextItalic?: boolean
  /** TV's Text tab alignment; `bottom` (below the line) and `center` by default. */
  lineTextAlignHorizontal?: 'left' | 'center' | 'right'
  lineTextAlignVertical?: 'top' | 'middle' | 'bottom'
  fontStyle?: 'normal' | 'italic'
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
  text?: { color?: string, size?: number, family?: string, weight?: number | string, fontStyle?: string, backgroundColor?: string }
}

// Visual defaults — same palette as Note.
const DEFAULT_LINE_COLOR = '#2962ff'
const DEFAULT_LABEL_BG = '#2962ff'
const DEFAULT_BORDER_COLOR = '#2962ff'
const DEFAULT_LABEL_TEXT_COLOR = '#ffffff'
const DEFAULT_LINE_TEXT_COLOR = '#2962ff'
const DEFAULT_LINE_TEXT_SIZE = 14
// TV draws the price label at both points, its left edge just right of the point (which
// keeps a small ring), and the line runs from label centre to label centre beneath them.
const ANCHOR_RING_RADIUS = 3
const LABEL_INSET = 6
const LABEL_PADDING_H = 11
const LABEL_PADDING_V = 7
const LABEL_BORDER_RADIUS = 4
const DEFAULT_FONT_SIZE = 12
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'

function parseExtendData (extendData: unknown): PriceNoteOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as PriceNoteOverlayData
  }
  return {}
}

interface XY { x: number, y: number }

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
    const textColor = styles.text?.color ?? data.textColor ?? DEFAULT_LABEL_TEXT_COLOR
    const fontStyle = styles.text?.fontStyle ?? data.fontStyle
    const lineTextSize = data.lineTextSize ?? DEFAULT_LINE_TEXT_SIZE

    const lineColor = styles.line?.color ?? data.lineColor ?? DEFAULT_LINE_COLOR
    const labelBg = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_LABEL_BG
    const borderColor = styles.polygon?.borderColor ?? data.borderColor ?? DEFAULT_BORDER_COLOR
    const borderWidth = styles.polygon?.borderSize ?? data.borderWidth ?? 1

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
    const rectAt = (p: XY): { x: number, y: number, width: number, height: number } =>
      ({ x: p.x + LABEL_INSET, y: p.y - labelHeight / 2, width: labelWidth, height: labelHeight })
    const anchorRect = rectAt(anchor)
    const labelRect = rectAt(labelCentre)
    const anchorCentre = { x: anchorRect.x + labelWidth / 2, y: anchor.y }
    const noteCentre = { x: labelRect.x + labelWidth / 2, y: labelCentre.y }

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
    const anchorRingStyle: Record<string, unknown> = {
      style: 'stroke',
      color: 'transparent',
      borderColor: lineColor,
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
      paddingBottom: 0,
      color: textColor
    }
    if (fontStyle !== undefined) labelTextStyle.fontStyle = fontStyle
    // Editable text on the leader line — inherits Note's editor look
    // (transparent bg / no border) so it reads as a free-floating
    // annotation rather than a second bubble.
    const lineEditableStyle: Record<string, unknown> = {
      size: lineTextSize,
      weight: data.lineTextBold === true ? 'bold' : 'normal',
      family: fontFamily,
      color: data.lineTextColor ?? DEFAULT_LINE_TEXT_COLOR
    }
    if (data.lineTextItalic === true) lineEditableStyle.fontStyle = 'italic'

    // Drag scoping: the line moves the whole overlay, the ring and the first
    // label move point 0, the second label point 1. No `ignoreEvent`, so hover
    // and click route through for highlight and selection.
    const label = (rect: { x: number, y: number, width: number, height: number }, pointIndex: number): OverlayFigure[] => {
      const figs: OverlayFigure[] = [{
        type: 'rect',
        attrs: { ...rect },
        styles: labelFillStyle,
        pointIndex
      }]
      // The border draws whenever it has width; it defaults to TV's 1px.
      if (borderWidth > 0) {
        figs.push({
          type: 'rect',
          attrs: { ...rect },
          styles: { style: 'stroke', color: 'transparent', borderColor, borderSize: borderWidth, borderRadius: LABEL_BORDER_RADIUS },
          pointIndex
        })
      }
      figs.push({
        type: 'text',
        attrs: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: priceText, align: 'center', baseline: 'middle' },
        styles: labelTextStyle,
        pointIndex
      })
      return figs
    }

    const figures: OverlayFigure[] = [
      { type: 'line', attrs: { coordinates: [anchorCentre, noteCentre] }, styles: leaderStyle },
      ...label(anchorRect, 0),
      ...label(labelRect, 1)
    ]

    // The line's own text, TV's `showLabel`. It runs along the line, reading left to right.
    // Horizontal alignment moves it along the line (left = at the start, right = at the end),
    // vertical puts it above (`top`), on or below (`bottom`, TV's default) the line.
    if (data.lineTextVisible === true) {
      const [from, to] = noteCentre.x < anchorCentre.x || (noteCentre.x === anchorCentre.x && noteCentre.y < anchorCentre.y)
        ? [noteCentre, anchorCentre]
        : [anchorCentre, noteCentre]
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      const h = data.lineTextAlignHorizontal ?? 'center'
      const v = data.lineTextAlignVertical ?? 'bottom'
      const t = h === 'left' ? 0 : h === 'right' ? 1 : 0.5
      let x = from.x + dx * t
      let y = from.y + dy * t
      // Perpendicular to the line: (dy, -dx) / len points to its top side once the line is sorted left to right.
      if (v !== 'middle' && len > 0) {
        const gap = (lineTextSize / 2 + 4) * (v === 'top' ? 1 : -1)
        x += (dy / len) * gap
        y += (-dx / len) * gap
      }
      const align = h === 'left' ? 'start' : h === 'right' ? 'end' : 'center'
      // On the line, the text leaves a gap in it, as in TV.
      if (v === 'middle') {
        figures[0] = { ...figures[0], attrs: lineAroundText([anchorCentre, noteCentre], { x, y, align, angle }, data.lineText ?? '', { size: lineTextSize, weight: lineEditableStyle.weight as string, family: fontFamily }).map((coordinates) => ({ coordinates })) }
      }
      figures.push({
        type: 'editableText',
        attrs: { x, y, text: data.lineText ?? '', align, baseline: 'middle', angle },
        styles: lineEditableStyle
      })
    }

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
    overlay.extendData = { ...current, lineText: newText, lineTextVisible: true }
  }
}

export type { PriceNoteOverlayData }

export default priceNote
