/**
 * The Text tab's label on a two-line channel: `text` sits on the upper line (top), the lower line
 * (bottom) or between them (middle), at the left, centre or right of the channel, turned to lie along its line.
 */

import type Coordinate from '../../../../common/Coordinate'
import type DeepPartial from '../../../../common/DeepPartial'
import type { OverlayProperties } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { TV_BLUE } from '../../tvLine'

/** TV's channel label size, where the shared default is 12. */
export const CHANNEL_TEXT_SIZE = 14

const along = (line: Coordinate[], t: number): Coordinate => ({ x: line[0].x + (line[1].x - line[0].x) * t, y: line[0].y + (line[1].y - line[0].y) * t })

/**
 * `first` and `second` are the channel's two lines, each `[left end, right end]`. `color` is the tool's own text
 * colour (TV's default is the tool's line colour); the label starts at the left, over the upper line.
 */
export function channelText (props: DeepPartial<OverlayProperties>, first: Coordinate[], second: Coordinate[], color: string = TV_BLUE): { type: string, key: string, attrs: unknown, styles: unknown } {
  const hAlign = props.textAlignHorizontal ?? 'left'
  const vAlign = props.textAlignVertical ?? 'top'
  const t = hAlign === 'left' ? 0 : hAlign === 'right' ? 1 : 0.5
  const [p, q] = [along(first, t), along(second, t)]
  const [upper, lower] = p.y <= q.y ? [first, second] : [second, first]
  const line = vAlign === 'top' ? upper : vAlign === 'bottom' ? lower : first
  const at = vAlign === 'middle' ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : along(line, t)
  return {
    type: 'editableText',
    key: 'text',
    attrs: {
      x: at.x,
      y: at.y + (vAlign === 'top' ? -4 : vAlign === 'bottom' ? 4 : 0),
      text: props.text ?? '',
      align: hAlign === 'left' ? 'start' : hAlign === 'right' ? 'end' : 'center',
      baseline: vAlign === 'top' ? 'bottom' : vAlign === 'bottom' ? 'top' : 'middle',
      angle: Math.atan2(line[1].y - line[0].y, line[1].x - line[0].x)
    },
    styles: {
      color: props.textColor ?? color,
      size: props.textFontSize ?? CHANNEL_TEXT_SIZE,
      weight: props.textFontWeight ?? DEFAULT_OVERLAY_PROPERTIES.textFontWeight,
      fontStyle: props.textFontStyle ?? DEFAULT_OVERLAY_PROPERTIES.textFontStyle,
      family: props.textFont ?? DEFAULT_OVERLAY_PROPERTIES.textFont,
      backgroundColor: 'transparent'
    }
  }
}
