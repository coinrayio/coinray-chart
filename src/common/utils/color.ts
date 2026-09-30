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

import { isValid } from './typeChecks'

const rgbaRegExp = /^[rR][gG][Bb][Aa]\(([\s]*(2[0-4][0-9]|25[0-5]|[01]?[0-9][0-9]?)[\s]*,){3}[\s]*(1|1.0|0|0.[0-9])[\s]*\){1}$/

export function isRgba (color: string): boolean {
  return rgbaRegExp.test(color)
}

export function isHsla (color: string): boolean {
  return (/^[hH][Ss][Ll][Aa]\(([\s]*(360｜3[0-5][0-9]|[012]?[0-9][0-9]?)[\s]*,)([\s]*((100|[0-9][0-9]?)%|0)[\s]*,){2}([\s]*(1|1.0|0|0.[0-9])[\s]*)\)$/).test(color)
}

export function isTransparent (color: string): boolean {
  return color === 'transparent' ||
    color === 'none' ||
    /^[rR][gG][Bb][Aa]\(([\s]*(2[0-4][0-9]|25[0-5]|[01]?[0-9][0-9]?)[\s]*,){3}[\s]*0[\s]*\)$/.test(color) ||
    /^[hH][Ss][Ll][Aa]\(([\s]*(360｜3[0-5][0-9]|[012]?[0-9][0-9]?)[\s]*,)([\s]*((100|[0-9][0-9]?)%|0)[\s]*,){2}([\s]*0[\s]*)\)$/.test(color)
}

export function rgbToHex (rgb: string): string {
  if (!isRgba(rgb)) {
    return rgb
  }
  const match = rgbaRegExp.exec(rgb)
  if (!isValid(match)) {
    throw new Error('Invalid RGB string format')
  }
  const r = parseInt(match[1], 10).toString(16)
  const g = parseInt(match[2], 10).toString(16)
  const b = parseInt(match[3], 10).toString(16)
  return `#${r.length === 1 ? `0${r}` : r}${g.length === 1 ? `0${r}` : r}${b.length === 1 ? `0${r}` : r}`
}

export function hexToRgb (hex: string, alpha?: number): string {
  const h = hex.replace(/^#/, '')
  const i = parseInt(h, 16)
  const r = (i >> 16) & 255
  const g = (i >> 8) & 255
  const b = i & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha ?? 1})`
}

/** Sentinel for a text colour that follows its own background. */
export const AUTO_CONTRAST = 'auto'

const WHITE = '#ffffff'
const BLACK = '#000000'

/** sRGB channels 0-255 from `#rgb`, `#rrggbb(aa)`, `rgb()` or `rgba()`.
 *  Anything else (a named colour, a gradient, `currentColor`) returns null. */
function channels (color: string): [number, number, number] | null {
  const c = color.trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c)
  if (hex !== null) {
    const h = hex[1]
    if (h.length === 3 || h.length === 4) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    }
    if (h.length === 6 || h.length === 8) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
    }
    return null
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(c)
  if (fn !== null) {
    const parts = fn[1].split(/[,/\s]+/).filter(p => p !== '')
    if (parts.length < 3) return null
    const nums = parts.slice(0, 3).map(p => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)))
    if (nums.some(n => !Number.isFinite(n))) return null
    return [nums[0], nums[1], nums[2]]
  }
  return null
}

/**
 * Black or white, whichever reads better on `background`.
 *
 * WCAG relative luminance with the sRGB transfer curve, then the standard
 * contrast ratio against both candidates — a plain 0.5 threshold on luminance
 * gets mid-tones wrong, and the price-scale pills (yellow last price, any
 * indicator's series colour, a user's own drawing colour) live exactly there.
 * An unparseable background falls back to white, the previous fixed colour.
 */
export function readableTextColor (background?: string): string {
  if (!isValid(background) || isTransparent(background)) return WHITE
  const rgb = channels(background)
  if (rgb === null) return WHITE
  const lin = rgb.map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  const l = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  // Contrast ratio is (lighter + 0.05) / (darker + 0.05); white wins when the
  // background is dark enough that 1.05 / (l + 0.05) beats (l + 0.05) / 0.05.
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.05) ? WHITE : BLACK
}
