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
 * Shared glyph-figure helper for overlays that render an emoji /
 * icon / sticker picked from the host's EmojiPicker.
 *
 * The picker encodes its three modes into a single string value:
 *   * Unicode emoji (`'🚀'`) — rendered as a `text` figure.
 *   * `'svg:<d>'` icon string — SVG path, rendered as a `path` figure
 *     scaled to the requested render size. Stroked by default; a
 *     leading `F` (`'svg:F<d>'`) marks a filled (outlined) glyph.
 *   * Stickers — reserved; current build dispenses unicode glyphs
 *     so they fall into the text branch.
 *
 * Both Signpost (richer pin overlay) and emojiMarker (single glyph
 * dropped on the chart) consume that encoding, so the prefix
 * branching + path scaling live here once instead of being copied.
 */

import type { OverlayFigure } from '../../component/Overlay'

/** Prefix the host attaches to icon-mode picker values. */
export const ICON_VALUE_PREFIX = 'svg:'

/**
 * Marks an icon path as filled: `'svg:F<d>'`. The host's icon library is
 * outlined artwork (shapes, not centre lines), which only reads correctly
 * filled. Paths start with a command letter, so a leading `F` is unambiguous;
 * older stroke-style values (no mark) keep rendering as strokes.
 */
export const FILLED_ICON_MARK = 'F'

/**
 * Tabler-style source icons all use a 24×24 viewBox. The helper
 * scales the path data uniformly so a caller-supplied
 * `size` (target render size in pixels) drops in cleanly.
 */
export const ICON_SOURCE_VIEWBOX = 24

/**
 * Multiply every number in an SVG path `d` attribute by `scale`.
 * The engine's `path` figure has no transform support, so we
 * pre-scale at the data layer. Coordinates with leading dots
 * (`-.5`) and decimals are handled by the regex.
 */
export function scalePath (d: string, scale: number): string {
  return d.replace(/-?\d*\.?\d+/g, (n) => String(parseFloat(n) * scale))
}

/**
 * Rotate an icon path about the centre of its 24 x 24 source box. Only for
 * paths made of absolute coordinate pairs (M/L/C/Q/Z), like the built-in
 * picker icons; the numbers are read pairwise.
 */
export function rotatePath (d: string, angle: number): string {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const c = ICON_SOURCE_VIEWBOX / 2
  const num = '-?\\d*\\.?\\d+'
  return d.replace(new RegExp(`(${num})[\\s,]+(${num})`, 'g'), (_m, a: string, b: string) => {
    const x = parseFloat(a) - c
    const y = parseFloat(b) - c
    return `${(c + x * cos - y * sin).toFixed(2)} ${(c + x * sin + y * cos).toFixed(2)}`
  })
}

export interface GlyphFigureParams {
  /** Centre X of the glyph (or icon bbox centre). */
  x: number
  /** Centre Y. */
  y: number
  /**
   * The picked value — `'svg:<d>'` for icons, anything else
   * (typically a unicode emoji) for text.
   */
  value: string
  /** Render size in pixels (font size for text, edge length for icon). */
  size: number
  /** Fill colour (text) / stroke colour (icon). */
  color: string
  /** Optional figure key (forwarded to the OverlayFigure). */
  key?: string
  /** Text-only — font family / weight. */
  fontFamily?: string
  fontWeight?: number | string
  /** Icon-only — stroke width. Defaults to 2. */
  iconLineWidth?: number
  /** Icon-only — stroke vs fill. Defaults to 'stroke'. */
  iconStyle?: 'stroke' | 'fill'
  /** Clockwise rotation in radians about (x, y). Icon paths must be absolute-only, see `rotatePath`. */
  angle?: number
}

/**
 * Build a single OverlayFigure that renders `value` centred at
 * `(x, y)` — either as a `text` figure (unicode glyph) or as a
 * `path` figure (Tabler SVG path, scaled to `size`).
 */
export function glyphFigure (params: GlyphFigureParams): OverlayFigure {
  const { x, y, value, size, color, key, fontFamily, fontWeight, iconLineWidth, iconStyle, angle } = params
  const base: { key?: string } = key !== undefined ? { key } : {}
  if (value.startsWith(ICON_VALUE_PREFIX)) {
    const scale = size / ICON_SOURCE_VIEWBOX
    let source = value.slice(ICON_VALUE_PREFIX.length)
    const filled = source.startsWith(FILLED_ICON_MARK)
    if (filled) source = source.slice(FILLED_ICON_MARK.length)
    const scaledD = scalePath(angle === undefined || angle === 0 ? source : rotatePath(source, angle), scale)
    return {
      ...base,
      type: 'path',
      attrs: {
        // The engine offsets the path by attrs.x / attrs.y, so
        // halving the rendered width gives a glyph centred on
        // the supplied (x, y).
        x: x - size / 2,
        y: y - size / 2,
        width: size,
        height: size,
        path: scaledD
      },
      styles: {
        style: iconStyle ?? (filled ? 'fill' : 'stroke'),
        color,
        lineWidth: iconLineWidth ?? 2
      }
    }
  }
  return {
    ...base,
    type: angle === undefined || angle === 0 ? 'text' : 'rotatedText',
    attrs: {
      x,
      y,
      text: value,
      align: 'center',
      baseline: 'middle',
      ...(angle === undefined || angle === 0 ? {} : { angle })
    },
    styles: {
      size,
      ...(fontFamily !== undefined ? { family: fontFamily } : {}),
      weight: fontWeight ?? 'normal',
      color,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderSize: 0
    }
  }
}
