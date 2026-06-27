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
 * Emoji Marker Overlay — drops a single emoji / sticker / icon at
 * the clicked position. Used by the drawing-bar's emoji group.
 *
 * extendData: `{ text: <pickerValue> }` or the value directly. The
 * value can be a unicode emoji or an `'svg:<d>'` icon string. The
 * shared `glyphFigure` helper picks the right figure type (text
 * vs path) from the prefix — same convention Signpost uses, so
 * any picker value renders identically on both overlays.
 */

import { clone, merge } from '../../common/utils/typeChecks'
import { glyphFigure } from './emojiGlyph'
import type { ProOverlayTemplate } from './types'
import type DeepPartial from '../../common/DeepPartial'

interface EmojiMarkerProperties {
  /** Picker value — unicode emoji or `'svg:<d>'` icon string. */
  text?: string
  /**
   * Render size in pixels — font size for text, edge length for
   * an icon's bounding box.
   *
   * Named to match the standard `OverlayProperties.textFontSize`
   * field. That alignment lets the default settings modal's Text-
   * Font-Size editor write here through setProperties without any
   * per-overlay schema; no rename / bridge needed.
   */
  textFontSize?: number
  /**
   * Render colour — text fill for unicode emoji, stroke colour
   * for the icon-mode path figure. Same `OverlayProperties.textColor`
   * standard naming as above.
   */
  textColor?: string
}

const defaultStyle: Required<EmojiMarkerProperties> = {
  text: '⭐',
  textFontSize: 24,
  // Medium grey — matches Signpost's default line colour and
  // reads on both dark and light themes. `#000000` (the previous
  // default) was invisible on the dark theme and the user couldn't
  // change it because the property name didn't match the schema's
  // field name.
  textColor: '#787b86'
}

const emojiMarker = (): ProOverlayTemplate => {
  let properties: DeepPartial<EmojiMarkerProperties> = {}

  const _extRef: { data: DeepPartial<EmojiMarkerProperties> | null } = { data: null }

  const prop = <K extends keyof EmojiMarkerProperties>(key: K): EmojiMarkerProperties[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defaults = defaultStyle as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defaults[key]) as EmojiMarkerProperties[K]
  }

  return {
    name: 'emojiMarker',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,

    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length === 0) return []

      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<EmojiMarkerProperties>
        : typeof overlay.extendData === 'string'
          ? { text: overlay.extendData }
          : null

      const value = prop('text') ?? defaultStyle.text
      const fontSize = prop('textFontSize') ?? defaultStyle.textFontSize
      const color = prop('textColor') ?? defaultStyle.textColor

      return [
        glyphFigure({
          key: 'emoji',
          x: coordinates[0].x,
          y: coordinates[0].y,
          value,
          size: fontSize,
          color
        })
      ]
    },

    onSelected: ({ overlay }) => {
      overlay.mode = 'normal'
      return false
    },

    onRightClick: (event) => {
      ;(event as unknown as { preventDefault?: () => void }).preventDefault?.()
      return false
    },

    setProperties: (_properties: DeepPartial<EmojiMarkerProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<EmojiMarkerProperties>
    },

    getProperties: (_id: string): DeepPartial<EmojiMarkerProperties> => properties
  }
}

export default emojiMarker
