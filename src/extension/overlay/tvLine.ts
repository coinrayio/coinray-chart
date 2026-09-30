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
 * What the trend-line group has in common with TradingView, so each overlay
 * does not re-derive it: the dash pattern, the default label colour, the
 * price/time labels on the axes and where a line's text sits.
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import { calcTextWidth } from '../../common/utils/canvas'
import type { OverlayProperties } from './types'

/** TradingView's default colour for every line here, and for the text drawn with it. */
export const TV_BLUE = '#2962FF'

/**
 * TradingView draws a dashed line as dashes of 5 stroke widths with gaps of 6,
 * and a dotted one as dots of 1 with gaps of 2, so a thick dashed line stays
 * dashed. The settings dialog stores a fixed pattern (`[4, 4]` dashed, `[1, 3]`
 * dotted); this reads which of the two it means and scales it to `size`.
 */
export function tvDashedValue (stored: number[] | undefined, size: number): number[] {
  const width = Math.max(1, size)
  const dotted = Array.isArray(stored) && stored.length > 0 && Number(stored[0]) <= 1
  return dotted ? [width, 2 * width] : [5 * width, 6 * width]
}

/** A settings-dialog pattern (`[4, 4]` or `[1, 3]`), as opposed to one an overlay chose itself. */
const isDialogDash = (d: unknown): d is number[] =>
  Array.isArray(d) && d.length === 2 && ((d[0] === 4 && d[1] === 4) || (d[0] === 1 && d[1] === 3))

/**
 * Scales a figure's dialog dash pattern to its stroke width, for lines and
 * borders alike. Run once over every overlay figure's merged styles, so each
 * tool needn't call `tvDashedValue` itself; patterns already scaled don't match.
 */
export function scaleDialogDashes (ss: Record<string, unknown>): Record<string, unknown> {
  if (ss.style === 'dashed' && isDialogDash(ss.dashedValue)) {
    ss = { ...ss, dashedValue: tvDashedValue(ss.dashedValue, Number(ss.size ?? 1)) }
  }
  if (ss.borderStyle === 'dashed' && isDialogDash(ss.borderDashedValue)) {
    ss = { ...ss, borderDashedValue: tvDashedValue(ss.borderDashedValue, Number(ss.borderSize ?? 1)) }
  }
  return ss
}

/** The label TradingView puts on an axis for a line's price or time: white on the line's colour. */
export const axisLabelStyles = (color: string): Record<string, unknown> => ({
  color: '#FFFFFF',
  backgroundColor: color,
  borderColor: color
})

type Align = 'left' | 'center' | 'right'
type VAlign = 'top' | 'middle' | 'bottom'

/** Gap between a label and the edge of the pane it is aligned to, and between it and its line. */
const EDGE_GAP = 8
const LINE_GAP = 6

export interface LineTextPlacement {
  x: number
  y: number
  align: CanvasTextAlign
  baseline: CanvasTextBaseline
  /** Radians; only set for text turned to run along its line. */
  angle?: number
}

/**
 * Text on a horizontal line or ray. `from`/`to` are the x span the line covers
 * (the whole pane for a straight line, anchor to the edge for a ray): left
 * puts the text at the start of it, right at the end, centre in the middle.
 * `top` is above the line, `bottom` below, `middle` on it.
 */
export function horizontalLineText (
  y: number,
  from: number,
  to: number,
  props: DeepPartial<OverlayProperties>,
  defaults: { horizontal: Align, vertical: VAlign }
): LineTextPlacement {
  const h = props.textAlignHorizontal ?? defaults.horizontal
  const v = props.textAlignVertical ?? defaults.vertical
  const x = h === 'left' ? from + EDGE_GAP : h === 'right' ? to - EDGE_GAP : (from + to) / 2
  return {
    x,
    y: v === 'top' ? y - LINE_GAP : v === 'bottom' ? y + LINE_GAP : y,
    align: h,
    baseline: v === 'top' ? 'bottom' : v === 'bottom' ? 'top' : 'middle'
  }
}

/**
 * Text on a vertical line, turned to read upward: `top`/`middle`/`bottom`
 * place it along the line, `left`/`center`/`right` beside it, or on it.
 */
export function verticalLineText (
  x: number,
  height: number,
  props: DeepPartial<OverlayProperties>,
  defaults: { horizontal: Align, vertical: VAlign }
): LineTextPlacement {
  const h = props.textAlignHorizontal ?? defaults.horizontal
  const v = props.textAlignVertical ?? defaults.vertical
  // The text is turned a quarter anticlockwise, so its top faces left: its baseline is the edge next to the line.
  return {
    x: h === 'left' ? x - LINE_GAP : h === 'right' ? x + LINE_GAP : x,
    y: v === 'top' ? EDGE_GAP : v === 'bottom' ? height - EDGE_GAP : height / 2,
    // Reading upward, the end of the text is at the top.
    align: v === 'top' ? 'end' : v === 'bottom' ? 'start' : 'center',
    baseline: h === 'left' ? 'bottom' : h === 'right' ? 'top' : 'middle',
    angle: -Math.PI / 2
  }
}

/**
 * The gap TV's text leaves in the line it sits on. `line` is the drawn line's two ends; the result is the piece or
 * pieces of it that remain once the box around the text (turned with it) is taken out. (Painting the background over
 * the line instead would cover candles too.)
 */
export function lineAroundText (
  line: Coordinate[],
  at: { x: number, y: number, align: CanvasTextAlign, angle?: number },
  text: string,
  style: { size?: number, weight?: string | number, family?: string }
): Coordinate[][] {
  if (text === '' || line.length < 2) return [line]
  const width = calcTextWidth(text, style.size ?? 12, style.weight, style.family) + 4
  // The text's span along its own direction: the anchor is its left end, middle or right end.
  const start = at.align === 'left' || at.align === 'start' ? 0 : at.align === 'right' || at.align === 'end' ? -width : -width / 2
  const cos = Math.cos(at.angle ?? 0)
  const sin = Math.sin(at.angle ?? 0)
  const [a, b] = line
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length === 0) return [line]
  const along = (u: number): number => ((at.x + u * cos - a.x) * (b.x - a.x) + (at.y + u * sin - a.y) * (b.y - a.y)) / length
  const [from, to] = [along(start), along(start + width)].sort((m, n) => m - n)
  if (to <= 0 || from >= length) return [line]
  const point = (t: number): Coordinate => ({ x: a.x + ((b.x - a.x) * t) / length, y: a.y + ((b.y - a.y) * t) / length })
  const pieces: Coordinate[][] = []
  if (from > 0) pieces.push([a, point(from)])
  if (to < length) pieces.push([point(to), b])
  return pieces
}
