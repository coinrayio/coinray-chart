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

export function getTextRect (attrs: TextAttrs, styles: Partial<TextStyle>): RectAttrs {
  const { size = 12, paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0, weight = 'normal', family } = styles
  const { x, y, text, align = 'left', baseline = 'top', width: w, height: h } = attrs
  // Multi-line aware: when the text contains \n, size the rect to the
  // widest line and to the full line count. Backward-compatible — a
  // text with no \n hits the single-call calcTextWidth path and gets
  // exactly the same rect as before.
  const lines = text.split('\n')
  const maxLineWidth = lines.length === 1
    ? calcTextWidth(text, size, weight, family)
    : Math.max(...lines.map(l => calcTextWidth(l, size, weight, family)))
  const width = w ?? (paddingLeft + maxLineWidth + paddingRight)
  const height = h ?? (paddingTop + lines.length * size + paddingBottom)
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
    paddingLeft = 0,
    paddingTop = 0,
    paddingRight = 0
  } = styles
  const rects = texts.map(text => getTextRect(text, styles))
  drawRect(ctx, rects, { ...styles, color: styles.backgroundColor })

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = createFont(size, weight, family)
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
    const lines = text.text.split('\n')
    lines.forEach((line, i) => {
      let lineX = rect.x + paddingLeft
      if (align === 'center') {
        const lineWidth = calcTextWidth(line, size, weight, family)
        lineX = rect.x + (rect.width - lineWidth) / 2
      } else if (align === 'right' || align === 'end') {
        const lineWidth = calcTextWidth(line, size, weight, family)
        lineX = rect.x + rect.width - paddingRight - lineWidth
      }
      const lineY = rect.y + paddingTop + i * size
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
}

const text: FigureTemplate<TextAttrs | TextAttrs[], Partial<TextStyle>> = {
  name: 'text',
  checkEventOn: checkCoordinateOnText,
  draw: (ctx: CanvasRenderingContext2D, attrs: TextAttrs | TextAttrs[], styles: Partial<TextStyle>) => {
    drawText(ctx, attrs, styles)
  }
}

export default text
