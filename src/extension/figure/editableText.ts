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

export type EditableTextAttrs = TextAttrs

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

    drawText(ctx, nonEmpty.length === 1 ? nonEmpty[0] : nonEmpty, cleanStyles)
  }
}

export default editableText
