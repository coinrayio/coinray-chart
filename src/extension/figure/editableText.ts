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

import type { FigureTemplate } from '../../component/Figure'

import { type TextAttrs, checkCoordinateOnText, drawText } from './text'

export interface EditableTextAttrs extends TextAttrs {
  /**
   * Optional rotation in radians applied around (`x`, `y`). When set,
   * the canvas draw rotates the text and the host's inline editor
   * picks up the same angle via a CSS `transform: rotate(...)` so the
   * textarea visually matches the rendered text. Hit-testing falls
   * back to the axis-aligned bbox of the unrotated text — coarse but
   * functional.
   */
  angle?: number
}

/**
 * Hit-test that uses the placeholder text '+ Add text' for measuring the
 * click target when the actual text is empty.  This keeps the overlay in
 * hovered state while the cursor moves towards the placeholder, so the
 * user can actually click it to start editing.
 */
function checkEditableTextEventOn (
  coordinate: Coordinate,
  attrs: EditableTextAttrs | EditableTextAttrs[],
  styles: Partial<TextStyle>
): boolean {
  const arr: EditableTextAttrs[] = ([] as EditableTextAttrs[]).concat(attrs)
  // Substitute empty texts with the placeholder so the hit area is non-zero
  const patched = arr.map(a =>
    a.text.length === 0 ? { ...a, text: '+ Add text' } : a
  )
  return checkCoordinateOnText(coordinate, patched.length === 1 ? patched[0] : patched, styles)
}

const editableText: FigureTemplate<EditableTextAttrs | EditableTextAttrs[], Partial<TextStyle>> = {
  name: 'editableText',
  checkEventOn: checkEditableTextEventOn,
  draw: (ctx: CanvasRenderingContext2D, attrs: EditableTextAttrs | EditableTextAttrs[], styles: Partial<TextStyle>) => {
    // Normalise to array for uniform handling
    const attrsArray: EditableTextAttrs[] = Array.isArray(attrs) ? attrs : [attrs]

    // Filter to only non-empty texts — empty text is handled externally (placeholder in OverlayView)
    const nonEmpty = attrsArray.filter(a => a.text.length > 0)
    if (nonEmpty.length === 0) {
      return
    }

    // Force transparent border and background — TV-style: no box around inline text
    const cleanStyles: Partial<TextStyle> = {
      ...styles,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderSize: 0
    }

    // Group by angle so we can apply ctx transforms only when needed.
    // Unrotated case (angle === 0 / undefined) hits the existing
    // drawText path so the prior behaviour for every overlay is
    // preserved byte-for-byte.
    const upright = nonEmpty.filter(a => a.angle === undefined || a.angle === 0)
    const rotated = nonEmpty.filter(a => a.angle !== undefined && a.angle !== 0)
    if (upright.length > 0) {
      drawText(ctx, upright.length === 1 ? upright[0] : upright, cleanStyles)
    }
    for (const a of rotated) {
      // Rotate around (a.x, a.y) — the figure's anchor point — so
      // an align='center', baseline='middle' attrs stays centred on
      // the rotation pivot.
      ctx.save()
      ctx.translate(a.x, a.y)
      ctx.rotate(a.angle ?? 0)
      drawText(ctx, { ...a, x: 0, y: 0 }, cleanStyles)
      ctx.restore()
    }
  }
}

export default editableText
