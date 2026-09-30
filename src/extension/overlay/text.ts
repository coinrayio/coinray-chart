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
 * Text overlay — single-click text annotation.
 *
 * One click places an editable text figure at the cursor; the engine's
 * `editableText` figure handles the "+ Add text" placeholder + inline
 * editing automatically. On commit (Enter / blur), `onTextChange`
 * fires and we persist the new text into `extendData.text` so it
 * survives re-renders and round-trips through StorageAdapter.
 *
 * Styling resolves in this order so both the inline editor and the
 * floating-settings panel converge on the same canvas output:
 *   1. `overlay.styles.text.*`   — written by the settings panel via
 *      the standard-overlay properties → klinecharts styles bridge.
 *   2. `extendData.*`            — written at creation time by the
 *      drawing-bar item (defaults for the tool).
 *   3. Engine defaults (theme)   — only kick in when neither of the
 *      above sets a value; reached because we omit undefined keys
 *      from `figure.styles` (spread-merging `undefined` would clobber
 *      the engine's defaults and paint the text/cursor black).
 *
 * Text content is sourced from `extendData.text` exclusively (the
 * inline editor writes there via `onTextChange`, and the settings
 * panel writes there too via `modifyOverlayProperties` in the host).
 */

import type { OverlayFigure, OverlayTemplate } from '../../component/Overlay'
import { getTextRect, type TextAttrs } from '../figure/text'

interface TextOverlayData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
  fontStyle?: 'normal' | 'italic'
  /** TV `drawBorder`/`borderColor`: a 1px box around the text. `borderVisible` is the settings dialog's flag for it. */
  drawBorder?: boolean
  borderVisible?: boolean
  borderColor?: string
  /** TV `fillBackground`/`backgroundColor`: a filled box behind the text. */
  backgroundVisible?: boolean
  backgroundColor?: string
  /** TV `wordWrap`/`wordWrapWidth`: wrap the text at this width (text area, excludes padding). */
  wordWrap?: boolean
  wordWrapWidth?: number
}

// TV's defaults for a new text.
const DEFAULT_COLOR = '#2962FF'
const DEFAULT_SIZE = 14
const DEFAULT_BACKGROUND = 'rgba(91, 133, 191, 0.3)'
const DEFAULT_BORDER = '#667b8b'
const DEFAULT_WRAP_WIDTH = 200

interface TextStyleLike {
  color?: string
  size?: number
  family?: string
  weight?: number | string
  fontStyle?: string
  backgroundColor?: string
}

interface PolygonStyleLike {
  color?: string
  borderColor?: string
}

function parseExtendData (extendData: unknown): TextOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as TextOverlayData
  }
  return {}
}

const text: OverlayTemplate = {
  // `totalStep: 2` = single-click drawing (engine convention is
  // N + 1 for an N-click overlay; see view/OverlayView.ts → nextStep).
  name: 'text',
  editTextOnCreate: true,
  totalStep: 2,
  // No default point figure — the text itself is the drag handle and
  // hit target. The default circle handle looks out of place under a
  // text annotation.
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 1) return []

    const data = parseExtendData(overlay.extendData)
    const styleText = (overlay.styles?.text ?? {}) as TextStyleLike
    const stylePolygon = (overlay.styles?.polygon ?? {}) as PolygonStyleLike

    const textValue = data.text ?? ''
    const color = styleText.color ?? data.textColor ?? DEFAULT_COLOR
    const size = styleText.size ?? data.fontSize ?? DEFAULT_SIZE
    const family = styleText.family
    const weight = styleText.weight ?? data.fontWeight
    const fillColor = styleText.backgroundColor ?? stylePolygon.color ?? data.backgroundColor
    const lineColor = stylePolygon.borderColor ?? data.borderColor

    // Build figure.styles excluding undefined keys so spread-merging
    // against the engine's text-style defaults (white, 12px, Helvetica
    // Neue, etc.) doesn't get clobbered. Including `color: undefined`
    // here would override the default white and paint the text black.
    const figureStyles: Record<string, unknown> = {}
    figureStyles.color = color
    figureStyles.size = size
    if (family !== undefined) figureStyles.family = family
    if (weight !== undefined) figureStyles.weight = weight

    const fontStyle = styleText.fontStyle ?? data.fontStyle
    if (fontStyle !== undefined) figureStyles.fontStyle = fontStyle

    // TV pads a bordered or wrapped text box by fontSize / 6 and wraps at
    // `wordWrapWidth` of text area. Plain text keeps today's unpadded layout.
    const wrap = data.wordWrap === true
    const wrapWidth = typeof data.wordWrapWidth === 'number' && data.wordWrapWidth > 0 ? data.wordWrapWidth : DEFAULT_WRAP_WIDTH
    const border = data.borderVisible ?? data.drawBorder ?? lineColor !== undefined
    const filled = data.backgroundVisible ?? fillColor !== undefined
    const pad = wrap || border || filled ? size / 6 : 0
    const attrs: TextAttrs = {
      x: coordinates[0].x,
      y: coordinates[0].y,
      text: textValue,
      // TV pins the box's top-left corner to the point; `align` only remains for saved charts that set it.
      align: data.align ?? 'left',
      baseline: 'top'
    }
    if (pad > 0) Object.assign(figureStyles, { paddingLeft: pad, paddingRight: pad, paddingTop: pad, paddingBottom: pad })
    if (wrap) Object.assign(attrs, { width: wrapWidth + 2 * pad, wrap: true })

    const figures: OverlayFigure[] = []
    if ((border || filled) && textValue !== '') {
      // editableText forces a transparent box, so the box is its own rect.
      figures.push({
        type: 'rect',
        attrs: getTextRect(attrs, figureStyles),
        styles: {
          style: border ? (filled ? 'stroke_fill' : 'stroke') : 'fill',
          color: filled ? fillColor ?? DEFAULT_BACKGROUND : 'transparent',
          borderColor: lineColor ?? DEFAULT_BORDER,
          borderSize: border ? 1 : 0
        },
        ignoreEvent: true
      })
    }
    figures.push({ type: 'editableText', attrs, styles: figureStyles })
    return figures
  },

  // Persist inline-edited text back into extendData so it survives
  // re-renders + StorageAdapter round-trips.
  onTextChange: ({ overlay, text: newText }) => {
    const current = parseExtendData(overlay.extendData)
    overlay.extendData = { ...current, text: newText }
  }
}

export type { TextOverlayData }

export default text
