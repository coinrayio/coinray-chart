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

import type Coordinate from '../../common/Coordinate'
import type { TextStyle } from '../../common/Styles'

import { createFont, calcTextWidth } from '../../common/utils/canvas'

import type { FigureTemplate } from '../../component/Figure'

import { type RectAttrs, drawRect } from './rect'

/**
 * Word-wrap a string to fit within `maxWidth` pixels, given the
 * font metrics implied by (`size`, `weight`, `family`). Honours
 * existing `\n` characters as hard breaks; soft-wraps each
 * resulting segment on word boundaries. A single word wider than
 * `maxWidth` falls back to character-by-character chunking so we
 * never return a line that overflows.
 *
 * Exported so callers (e.g. Table) can compute line counts the
 * same way the renderer will.
 */
export function wrapText (
  text: string,
  maxWidth: number,
  size: number,
  weight?: number | string,
  family?: string
): string[] {
  const explicit = text.split('\n')
  if (maxWidth <= 0) return explicit
  const out: string[] = []
  for (const segment of explicit) {
    if (segment.length === 0) { out.push(''); continue }
    let current = ''
    const words = segment.split(' ')
    for (const word of words) {
      const tentative = current === '' ? word : current + ' ' + word
      if (calcTextWidth(tentative, size, weight, family) <= maxWidth) {
        current = tentative
        continue
      }
      // Tentative overflows. Flush `current` if non-empty.
      if (current !== '') out.push(current)
      // Single word still too wide → character chunking.
      if (calcTextWidth(word, size, weight, family) > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          const t = chunk + ch
          if (calcTextWidth(t, size, weight, family) > maxWidth) {
            if (chunk !== '') out.push(chunk)
            chunk = ch
          } else {
            chunk = t
          }
        }
        current = chunk
      } else {
        current = word
      }
    }
    if (current !== '') out.push(current)
  }
  return out
}

export function getTextRect (attrs: TextAttrs, styles: Partial<TextStyle>): RectAttrs {
  const { size = 12, paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0, weight = 'normal', family, lineHeight = 1 } = styles
  const { x, y, text, align = 'left', baseline = 'top', width: w, height: h, wrap = false } = attrs
  // When `wrap` is on AND an explicit width is set, the line set
  // comes from soft-wrapping at `width - paddings`. Otherwise we
  // keep the prior \n-only behaviour (every existing overlay
  // sticks to the old branch).
  const lines = wrap && w !== undefined
    ? wrapText(text, Math.max(0, w - paddingLeft - paddingRight), size, weight, family)
    : text.split('\n')
  const maxLineWidth = lines.length === 1
    ? calcTextWidth(lines[0], size, weight, family)
    : Math.max(...lines.map(l => calcTextWidth(l, size, weight, family)))
  const lineStep = size * lineHeight
  const width = w ?? (paddingLeft + maxLineWidth + paddingRight)
  const height = h ?? (paddingTop + lines.length * lineStep + paddingBottom)
  let startX = 0
  switch (align) {
    case 'left':
    case 'start': {
      startX = x
      break
    }
    case 'right':
    case 'end': {
      startX = x - width
      break
    }
    default: {
      startX = x - width / 2
      break
    }
  }
  let startY = 0
  switch (baseline) {
    case 'top':
    case 'hanging': {
      startY = y
      break
    }
    case 'bottom':
    case 'ideographic':
    case 'alphabetic': {
      startY = y - height
      break
    }
    default: {
      startY = y - height / 2
      break
    }
  }
  return { x: startX, y: startY, width, height }
}

export function checkCoordinateOnText (coordinate: Coordinate, attrs: TextAttrs | TextAttrs[], styles: Partial<TextStyle>): boolean {
  let texts: TextAttrs[] = []
  texts = texts.concat(attrs)
  for (const text of texts) {
    const { x, y, width, height } = getTextRect(text, styles)
    if (
      coordinate.x >= x &&
      coordinate.x <= x + width &&
      coordinate.y >= y &&
      coordinate.y <= y + height
    ) {
      return true
    }
  }
  return false
}

export function drawText (ctx: CanvasRenderingContext2D, attrs: TextAttrs | TextAttrs[], styles: Partial<TextStyle>): void {
  let texts: TextAttrs[] = []
  texts = texts.concat(attrs)
  const {
    color = 'currentColor',
    size = 12,
    family,
    weight,
    fontStyle,
    paddingLeft = 0,
    paddingTop = 0,
    paddingRight = 0,
    lineHeight = 1
  } = styles
  const lineStep = size * lineHeight
  const rects = texts.map(text => getTextRect(text, styles))
  drawRect(ctx, rects, { ...styles, color: styles.backgroundColor })

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = createFont(size, weight, family, fontStyle)
  ctx.fillStyle = color

  texts.forEach((text, index) => {
    const rect = rects[index]
    // Single unified path handles both single-line and multi-line.
    // Each line is positioned by its own width so that:
    //   • align='center' keeps the line centred at attrs.x even when
    //     the rect was widened beyond the natural text width (the
    //     centring trick of rect.x + paddingLeft only worked when
    //     rect.width == textWidth + paddings).
    //   • align='left' / 'right' / 'end' keep the prior semantics.
    // Vertical step is `size` (no extra leading) to match the height
    // computed in getTextRect.
    const align = text.align ?? 'left'
    // Match the line set getTextRect computed — soft-wrap when the
    // attr opts in (and an explicit width is set), \n-split
    // otherwise. Without this the rect would size for wrapped
    // lines but the draw would only render the first explicit
    // line, truncating the rest.
    const lines = text.wrap === true && text.width !== undefined
      ? wrapText(text.text, Math.max(0, text.width - paddingLeft - paddingRight), size, weight, family)
      : text.text.split('\n')
    lines.forEach((line, i) => {
      let lineX = rect.x + paddingLeft
      if (align === 'center') {
        const lineWidth = calcTextWidth(line, size, weight, family)
        lineX = rect.x + (rect.width - lineWidth) / 2
      } else if (align === 'right' || align === 'end') {
        const lineWidth = calcTextWidth(line, size, weight, family)
        lineX = rect.x + rect.width - paddingRight - lineWidth
      }
      const lineY = rect.y + paddingTop + i * lineStep
      ctx.fillText(line, lineX, lineY)
    })
  })
}

export interface TextAttrs {
  /** Optional key for per-figure styling via overlay.figureStyles */
  key?: string
  x: number
  y: number
  text: string
  width?: number
  height?: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  /**
   * When true (and `width` is set), the text is word-wrapped to
   * fit inside `width - paddingLeft - paddingRight`. Wrapping
   * runs on top of the existing `\n` split, so explicit newlines
   * still introduce hard breaks. Used by Table cells so a long
   * un-broken paragraph spills onto multiple visual lines instead
   * of overflowing the cell horizontally.
   */
  wrap?: boolean
}

const text: FigureTemplate<TextAttrs | TextAttrs[], Partial<TextStyle>> = {
  name: 'text',
  checkEventOn: checkCoordinateOnText,
  draw: (ctx: CanvasRenderingContext2D, attrs: TextAttrs | TextAttrs[], styles: Partial<TextStyle>) => {
    drawText(ctx, attrs, styles)
  }
}

export default text
