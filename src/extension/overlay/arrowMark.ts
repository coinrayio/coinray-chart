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
 * Arrow Mark Up / Down / Left / Right — TradingView's `arrow_up`,
 * `arrow_down`, `arrow_left` and `arrow_right`.
 *
 * One click; the arrow's tip sits on the anchor and its tail points away,
 * with an optional editable label past the tail.
 *
 * Properties: backgroundColor (arrow fill), textColor, textFontSize, text.
 */

import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'

export type ArrowDirection = 'up' | 'down' | 'left' | 'right'

const NAMES: Record<ArrowDirection, string> = { up: 'arrowMarkUp', down: 'arrowMarkDown', left: 'arrowMarkLeft', right: 'arrowMarkRight' }
// TV's default colours per direction.
const COLORS: Record<ArrowDirection, string> = { up: '#089981', down: '#F23645', left: '#2962FF', right: '#2962FF' }
const HEAD = 11 // head length, px
const HALF = 8 // head half-width
const SHAFT_HALF = 3
const SHAFT = 11
const LABEL_GAP = 4

export const arrowMark = (direction: ArrowDirection) => (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()
  // Unit vector from tip toward tail.
  const [ux, uy] = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[direction]

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const newProps = clone(properties.get(id) ?? {}) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }
  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: NAMES[direction],
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length === 0) return []
      const props = properties.get(overlay.id) ?? {}
      const tip = coordinates[0]
      // Perpendicular for the widths.
      const px = -uy
      const py = ux
      const at = (along: number, across: number): { x: number, y: number } =>
        ({ x: tip.x + ux * along + px * across, y: tip.y + uy * along + py * across })
      const outline = [
        at(0, 0), at(HEAD, HALF), at(HEAD, SHAFT_HALF), at(HEAD + SHAFT, SHAFT_HALF),
        at(HEAD + SHAFT, -SHAFT_HALF), at(HEAD, -SHAFT_HALF), at(HEAD, -HALF)
      ]
      const color = props.backgroundColor ?? COLORS[direction]
      const tail = at(HEAD + SHAFT + LABEL_GAP, 0)
      const vertical = direction === 'up' || direction === 'down'
      return [
        { type: 'polygon', key: 'arrow', attrs: { coordinates: outline }, styles: { style: 'fill', color } },
        {
          type: 'editableText',
          key: 'label',
          attrs: {
            x: tail.x,
            y: tail.y,
            text: props.text ?? '',
            align: vertical ? 'center' : direction === 'left' ? 'left' : 'right',
            baseline: direction === 'up' ? 'top' : direction === 'down' ? 'bottom' : 'middle'
          },
          styles: { color: props.textColor ?? color, size: props.textFontSize ?? 14, weight: props.textFontWeight ?? 'normal', backgroundColor: 'transparent' }
        }
      ]
    },
    setProperties,
    getProperties
  }
}
