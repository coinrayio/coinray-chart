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
 * Anchored Note (TradingView `anchored_note`, LineToolNoteAbsolute) — a pin
 * fixed to a spot on the screen with a tooltip box above it that holds the
 * note text. The pin does not move with the chart; the spot is
 * `extendData.anchorX/anchorY` (fractions of the pane, TV's `positionPercents`)
 * and is the pin's tip. See `anchoredHooks` for how it is dragged and restored.
 *
 * Geometry follows TV's NotePaneView: tooltip 236px wide (less on a narrow
 * pane), 12px padding, 5px between lines, 13px above the pin, a 12x10 caret.
 * Like TV, the tooltip shows only while the note is hovered or selected (hover
 * and click state read from the chart store, as `pin` does).
 */

import type { OverlayFigure, OverlayTemplate } from '../../../../component/Overlay'
import type ChartImp from '../../../../Chart'
import { wrapText } from '../../../figure/text'
import { anchoredHooks, anchorPixel, readData, roundedBubble, type AnchorData } from './shared'

export interface AnchoredNoteData extends AnchorData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  backgroundColor?: string
  borderColor?: string
  markerColor?: string
  /** What a saved `note` called its marker colour. */
  lineColor?: string
  /** The settings dialog's flags: the fill is on by default, the border off. */
  backgroundVisible?: boolean
  borderVisible?: boolean
}

interface StyleSlice {
  line?: { color?: string }
  polygon?: { color?: string, borderColor?: string }
  text?: { color?: string, size?: number, family?: string, weight?: number | string, fontStyle?: string }
}

const TOOLTIP_WIDTH = 236
const PADDING = 12
const LINE_GAP = 5
// Measured off TV's pin (23px wide, 26 tall, its tip 4px above the point) and its tooltip.
const PIN_RADIUS = 11.5
const PIN_HEIGHT = 30
const PIN_TIP_GAP = 4
const TOOLTIP_GAP = 14
const CARET_WIDTH = 12
const CARET_HEIGHT = 10

// TV's dark-theme note defaults.
const DEFAULT_TEXT = '#d1d4dc'
const DEFAULT_FILL = '#2a2e39'
const DEFAULT_BORDER = '#434651'
const DEFAULT_MARKER = '#2962FF'

/**
 * The pin-and-tooltip note. `anchoredNote` pins it to the screen; `note` (TV's
 * `LineToolNote`) is the same drawing at a bar and price, so it passes no hooks.
 */
export function noteTemplate (name: string, hooks: Partial<OverlayTemplate> = {}): OverlayTemplate {
  // Only a screen-anchored note (one with hooks) keeps the engine from moving its point on drag.
  const noTranslate = hooks.completeDrawing !== undefined
  return {
    name,
    editTextOnCreate: true,
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    ...hooks,

    createPointFigures: (params) => {
      const { overlay, coordinates, bounding } = params
      if (coordinates.length < 1) return []
      const store = (params.chart as ChartImp).getChartStore()
      const showTooltip = store.getHoverOverlayInfo().overlay?.id === overlay.id || store.getClickOverlayInfo().overlay?.id === overlay.id
      const data = (readData(overlay.extendData) as AnchoredNoteData)
      const styles = (overlay.styles ?? {}) as StyleSlice
      const at = anchorPixel(data, coordinates, bounding)

      const size = styles.text?.size ?? data.fontSize ?? 14
      const weight = styles.text?.weight ?? data.fontWeight
      const family = styles.text?.family
      const text = data.text ?? ''
      const marker = styles.line?.color ?? data.markerColor ?? data.lineColor ?? DEFAULT_MARKER

      // No text yet: size to the editor's placeholder.
      const lines = wrapText(text === '' ? '+ Add text' : text, TOOLTIP_WIDTH - 2 * PADDING, size, weight, family)
      const width = Math.min(TOOLTIP_WIDTH, bounding.width)
      const height = 2 * PADDING + lines.length * size + (lines.length - 1) * LINE_GAP
      const left = Math.min(Math.max(at.x - width / 2, 0), Math.max(0, bounding.width - width))
      const bottom = at.y - PIN_HEIGHT - TOOLTIP_GAP
      const top = bottom - height
      const caret = [
        { x: at.x + CARET_WIDTH / 2, y: bottom },
        { x: at.x, y: bottom + CARET_HEIGHT },
        { x: at.x - CARET_WIDTH / 2, y: bottom }
      ]

      const textStyles: Record<string, unknown> = {
        size,
        color: styles.text?.color ?? data.textColor ?? DEFAULT_TEXT,
        lineHeight: (size + LINE_GAP) / size,
        paddingLeft: PADDING,
        paddingRight: PADDING,
        paddingTop: PADDING,
        // getTextRect adds one trailing line gap that TV's box does not have.
        paddingBottom: PADDING - LINE_GAP
      }
      if (weight !== undefined) textStyles.weight = weight
      if (family !== undefined) textStyles.family = family
      const fontStyle = styles.text?.fontStyle ?? data.fontStyle
      if (fontStyle !== undefined) textStyles.fontStyle = fontStyle

      const pinStyles = { style: 'fill', color: marker, borderSize: 0 }
      const tooltip: OverlayFigure[] = showTooltip
        ? [
            {
              type: 'polygon',
              attrs: { coordinates: roundedBubble(left, top, width, height, 4, caret) },
              styles: {
                style: 'stroke_fill',
                color: data.backgroundVisible === false ? 'transparent' : styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_FILL,
                borderColor: styles.polygon?.borderColor ?? data.borderColor ?? DEFAULT_BORDER,
                borderSize: data.borderVisible ?? (styles.polygon?.borderColor ?? data.borderColor) !== undefined ? 1 : 0
              },
              noTranslate
            },
            {
              type: 'editableText',
              attrs: { x: left, y: top, text, width, wrap: true, align: 'left', baseline: 'top' },
              styles: textStyles,
              noTranslate
            }
          ]
        : []
      return [
        ...tooltip,
        // Pin: a disc on a tapering stem with a dark eye, tip just above the anchor.
        { type: 'circle', attrs: { x: at.x, y: at.y - PIN_HEIGHT + PIN_RADIUS, r: PIN_RADIUS }, styles: pinStyles, noTranslate },
        {
          type: 'polygon',
          attrs: { coordinates: [{ x: at.x - PIN_RADIUS * 0.85, y: at.y - PIN_HEIGHT + PIN_RADIUS * 1.3 }, { x: at.x + PIN_RADIUS * 0.85, y: at.y - PIN_HEIGHT + PIN_RADIUS * 1.3 }, { x: at.x, y: at.y - PIN_TIP_GAP }] },
          styles: pinStyles,
          noTranslate
        },
        { type: 'circle', attrs: { x: at.x, y: at.y - PIN_HEIGHT + PIN_RADIUS, r: PIN_RADIUS * 0.42 }, styles: { style: 'fill', color: 'rgba(19, 23, 34, 0.9)', borderSize: 0 }, noTranslate }
      ]
    },

    onTextChange: ({ overlay, text }) => {
      overlay.extendData = { ...(readData(overlay.extendData) as AnchoredNoteData), text }
    }
  }
}

const anchoredNote = noteTemplate('anchoredNote', anchoredHooks)

export default anchoredNote
