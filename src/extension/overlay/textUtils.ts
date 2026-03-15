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

import type DeepPartial from '../../common/DeepPartial'
import type { OverlayProperties } from './types'

/** Gap in pixels between text and its anchor point (line/shape edge) */
const TEXT_GAP = 6

export interface EditableTextPosition {
  x: number
  y: number
  align: CanvasTextAlign
  baseline: CanvasTextBaseline
}

/**
 * Compute position and alignment for editable text on an overlay.
 *
 * textAlignHorizontal controls horizontal placement on the chart:
 * - 'left': near the left edge of the chart (~4% from left)
 * - 'center': at the provided anchor x (overlay's natural position)
 * - 'right': near the right edge of the chart (~4% from right)
 *
 * textAlignVertical controls vertical placement relative to anchor:
 * - 'top': above the anchor with a gap
 * - 'middle': centered on the anchor
 * - 'bottom': below the anchor with a gap
 */
export function computeTextPosition (
  anchorX: number,
  anchorY: number,
  props: DeepPartial<OverlayProperties>,
  boundingWidth: number,
  defaultHAlign: 'left' | 'center' | 'right' = 'center',
  defaultVAlign: 'top' | 'middle' | 'bottom' = 'top'
): EditableTextPosition {
  const hAlign = props.textAlignHorizontal ?? defaultHAlign
  const vAlign = props.textAlignVertical ?? defaultVAlign

  // Horizontal position on the chart
  const x = hAlign === 'left'
    ? Math.round(boundingWidth * 0.04)
    : hAlign === 'right'
      ? Math.round(boundingWidth * 0.96)
      : anchorX

  // Vertical position with gap from anchor
  const y = vAlign === 'top'
    ? anchorY - TEXT_GAP
    : vAlign === 'bottom'
      ? anchorY + TEXT_GAP
      : anchorY
  const baseline: CanvasTextBaseline = vAlign === 'top'
    ? 'bottom'
    : vAlign === 'bottom'
      ? 'top'
      : 'middle'

  return { x, y, align: hAlign as CanvasTextAlign, baseline }
}
