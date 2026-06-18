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

import type { OverlayTemplate } from '../../component/Overlay'

interface TextOverlayData {
  text?: string
  fontSize?: number
  textColor?: string
  fontWeight?: number | 'normal' | 'bold'
  align?: 'left' | 'center' | 'right'
}

interface TextStyleLike {
  color?: string
  size?: number
  family?: string
  weight?: number | string
  backgroundColor?: string
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

    const textValue = data.text ?? ''
    const color = styleText.color ?? data.textColor
    const size = styleText.size ?? data.fontSize
    const family = styleText.family
    const weight = styleText.weight ?? data.fontWeight
    const backgroundColor = styleText.backgroundColor

    // Build figure.styles excluding undefined keys so spread-merging
    // against the engine's text-style defaults (white, 12px, Helvetica
    // Neue, etc.) doesn't get clobbered. Including `color: undefined`
    // here would override the default white and paint the text black.
    const figureStyles: Record<string, unknown> = {}
    if (color !== undefined) figureStyles.color = color
    if (size !== undefined) figureStyles.size = size
    if (family !== undefined) figureStyles.family = family
    if (weight !== undefined) figureStyles.weight = weight
    if (backgroundColor !== undefined) figureStyles.backgroundColor = backgroundColor

    return [
      {
        type: 'editableText',
        attrs: {
          x: coordinates[0].x,
          y: coordinates[0].y,
          text: textValue,
          align: data.align ?? 'center',
          baseline: 'middle'
        },
        styles: figureStyles
      }
    ]
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
