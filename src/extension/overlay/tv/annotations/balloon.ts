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
 * Balloon (TradingView `balloon`, LineToolBalloon) — a rounded label whose
 * tail tip sits on the anchor. One point (the tail tip); the label rises from
 * it. Outline, padding and tail curve are TV's BalloonPaneView (see
 * `balloonGeometry`). Border is 2px like TV. Text is `extendData.text`.
 *
 * Colours: `overlay.styles` (settings panel) over `extendData` (migration).
 */

import type { OverlayTemplate } from '../../../../component/Overlay'
import { calcTextWidth } from '../../../../common/utils/canvas'
import { balloonGeometry, readData } from './shared'

export interface BalloonData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  backgroundColor?: string
  borderColor?: string
}

interface StyleSlice {
  polygon?: { color?: string, borderColor?: string }
  text?: { color?: string, size?: number, family?: string, weight?: number | string }
}

// TV's defaults for a new balloon.
const DEFAULT_FILL = 'rgba(156, 39, 176, 0.7)'
const DEFAULT_BORDER = 'rgba(156, 39, 176, 0)'
const DEFAULT_TEXT = '#ffffff'
const DEFAULT_FONT_SIZE = 14

const balloon: OverlayTemplate = {
  name: 'balloon',
  editTextOnCreate: true,
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,

  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 1) return []
    const data = (readData(overlay.extendData) as BalloonData)
    const styles = (overlay.styles ?? {}) as StyleSlice
    const size = styles.text?.size ?? data.fontSize ?? DEFAULT_FONT_SIZE
    const weight = styles.text?.weight ?? data.fontWeight
    const family = styles.text?.family

    // No text yet: size to the editor's placeholder so the balloon isn't a sliver.
    const text = data.text ?? ''
    const textWidth = calcTextWidth(text === '' ? '+ Add text' : text, size, weight, family)
    const g = balloonGeometry(coordinates[0], textWidth, size)

    const textStyles: Record<string, unknown> = { size, color: styles.text?.color ?? data.textColor ?? DEFAULT_TEXT }
    if (weight !== undefined) textStyles.weight = weight
    if (family !== undefined) textStyles.family = family
    return [
      {
        type: 'polygon',
        attrs: { coordinates: g.outline },
        styles: {
          style: 'stroke_fill',
          color: styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_FILL,
          borderColor: styles.polygon?.borderColor ?? data.borderColor ?? DEFAULT_BORDER,
          borderSize: 2
        }
      },
      {
        type: 'editableText',
        attrs: { x: g.left + 15, y: g.top + g.height / 2, text, align: 'left', baseline: 'middle' },
        styles: textStyles
      }
    ]
  },

  onTextChange: ({ overlay, text }) => {
    overlay.extendData = { ...(readData(overlay.extendData) as BalloonData), text }
  }
}

export default balloon
