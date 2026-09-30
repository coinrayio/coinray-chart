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
 * Anchored Text (TradingView `anchored_text`, LineToolTextAbsolute) — text
 * pinned to a spot on the screen, not to a bar and price, so it stays put
 * while the chart pans and zooms.
 *
 * One click. The spot is `extendData.anchorX/anchorY` (fractions of the pane,
 * TV's `positionPercents`) and is the text box's top-left corner. The single
 * point only carries the overlay through save/restore. Styling resolves like
 * `text`: `overlay.styles` (settings panel) over `extendData` (creation and
 * migration). Fill and border only draw when a colour is set.
 */

import type { OverlayFigure, OverlayTemplate } from '../../../../component/Overlay'
import { getTextRect, type TextAttrs } from '../../../figure/text'
import { anchoredHooks, anchorPixel, readData, type AnchorData } from './shared'

const DEFAULT_TEXT_COLOR = '#2962FF'
// TV's defaults for the optional box and the wrap width.
const DEFAULT_BACKGROUND = 'rgba(155, 190, 213, 0.3)'
const DEFAULT_BORDER = '#667b8b'
const DEFAULT_WRAP_WIDTH = 200

export interface AnchoredTextData extends AnchorData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  backgroundColor?: string
  borderColor?: string
  /** The settings dialog's flags; unset means "on when the colour is set" (saved charts). */
  backgroundVisible?: boolean
  borderVisible?: boolean
  wordWrap?: boolean
  wordWrapWidth?: number
}

interface StyleSlice {
  polygon?: { color?: string, borderColor?: string }
  text?: { color?: string, size?: number, family?: string, weight?: number | string, fontStyle?: string, backgroundColor?: string }
}

const PADDING = 4

const anchoredText: OverlayTemplate = {
  name: 'anchoredText',
  editTextOnCreate: true,
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  ...anchoredHooks,

  createPointFigures: ({ overlay, coordinates, bounding }) => {
    if (coordinates.length < 1) return []
    const data = (readData(overlay.extendData) as AnchoredTextData)
    const styles = (overlay.styles ?? {}) as StyleSlice
    const at = anchorPixel(data, coordinates, bounding)

    const fillColor = styles.text?.backgroundColor ?? styles.polygon?.color ?? data.backgroundColor
    const lineColor = styles.polygon?.borderColor ?? data.borderColor
    const filled = data.backgroundVisible ?? fillColor !== undefined
    const bordered = data.borderVisible ?? lineColor !== undefined
    const figureStyles: Record<string, unknown> = {
      size: styles.text?.size ?? data.fontSize ?? 14,
      paddingLeft: PADDING,
      paddingRight: PADDING,
      paddingTop: PADDING,
      paddingBottom: PADDING,
      // TV's default is its blue; without one the editable text falls back to near-black.
      color: styles.text?.color ?? data.textColor ?? DEFAULT_TEXT_COLOR
    }
    const weight = styles.text?.weight ?? data.fontWeight
    const fontStyle = styles.text?.fontStyle ?? data.fontStyle
    if (weight !== undefined) figureStyles.weight = weight
    if (fontStyle !== undefined) figureStyles.fontStyle = fontStyle
    if (styles.text?.family !== undefined) figureStyles.family = styles.text.family

    const wrap = data.wordWrap ?? data.wordWrapWidth !== undefined
    const attrs: TextAttrs & { wrap?: boolean } = { x: at.x, y: at.y, text: data.text ?? '', align: 'left', baseline: 'top' }
    if (wrap) Object.assign(attrs, { width: data.wordWrapWidth ?? DEFAULT_WRAP_WIDTH, wrap: true })

    const figures: OverlayFigure[] = []
    if ((filled || bordered) && attrs.text !== '') {
      // editableText forces a transparent box, so the box is its own rect.
      figures.push({
        type: 'rect',
        attrs: getTextRect(attrs, figureStyles),
        styles: {
          style: bordered ? (filled ? 'stroke_fill' : 'stroke') : 'fill',
          color: filled ? fillColor ?? DEFAULT_BACKGROUND : 'transparent',
          borderColor: lineColor ?? DEFAULT_BORDER,
          borderSize: bordered ? 1 : 0
        },
        ignoreEvent: true,
        noTranslate: true
      })
    }
    figures.push({ type: 'editableText', attrs, styles: figureStyles, noTranslate: true })
    return figures
  },

  onTextChange: ({ overlay, text }) => {
    overlay.extendData = { ...(readData(overlay.extendData) as AnchoredTextData), text }
  }
}

export default anchoredText
