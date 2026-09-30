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
 * Arrow Marker — TradingView's `arrow_marker`: a filled arrow from point 0
 * (tail) to point 1 (tip) with an editable label past the tail.
 *
 * Shape follows TV's: the body tapers from nothing at the tail, the head is a
 * quarter of the length (18–106 px, never more than 90%), 1.22× as wide as it
 * is long, with a small back-step once the arrow is 35 px or longer. Arrows
 * shorter than 22 px are drawn at 22 px, measured back from the tip.
 *
 * Properties: backgroundColor (arrow), textColor, textFontSize,
 * textFontWeight (bold by default, as in TV), text.
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'

const COLOR = '#1E53E5'
const MIN_LENGTH = 22
const LABEL_GAP = 8

function headLength (length: number): number {
  if (length < 92) return 18
  return Math.min(Math.max(Math.min(0.25 * length, 106), 18), 0.9 * length)
}

/** Outline of TV's arrow marker from `tail` to `tip`. */
export function arrowMarkerOutline (tail: Coordinate, tip: Coordinate): Coordinate[] {
  let from = tail
  let length = Math.hypot(tip.x - tail.x, tip.y - tail.y)
  if (length === 0) return []
  let ux = (tip.x - tail.x) / length
  let uy = (tip.y - tail.y) / length
  if (length < MIN_LENGTH) {
    from = { x: tip.x - ux * MIN_LENGTH, y: tip.y - uy * MIN_LENGTH }
    length = MIN_LENGTH
    ux = (tip.x - from.x) / length
    uy = (tip.y - from.y) / length
  }
  const head = headLength(length)
  const back = length >= 35 ? 0.1 : 0
  // [along, across] pairs, one side; mirrored for the other.
  const side: Array<[number, number]> = [[0, 0], [length - head + head * back, 1.22 * head / 4], [length - head, 1.22 * head / 2], [length, 0]]
  const at = ([along, across]: [number, number], sign: number): Coordinate =>
    ({ x: from.x + ux * along + uy * across * sign, y: from.y + uy * along - ux * across * sign })
  return [...side.map((p) => at(p, 1)), ...side.slice(1, -1).reverse().map((p) => at(p, -1))]
}

const arrowMarker = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const newProps = clone(properties.get(id) ?? {}) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }
  // TV's defaults, as explicit properties so the settings dialog reads what is drawn.
  const look: DeepPartial<OverlayProperties> = { backgroundColor: COLOR, textColor: COLOR, textFontSize: 16, textFontWeight: 'bold' }
  const getProperties = (id: string): DeepPartial<OverlayProperties> => ({ ...look, ...(properties.get(id) ?? {}) })

  return {
    name: 'arrowMarker',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const props = getProperties(overlay.id)
      const [tail, tip] = coordinates
      const color = props.backgroundColor
      const span = Math.hypot(tip.x - tail.x, tip.y - tail.y)
      const length = span === 0 ? 1 : span
      const ux = (tip.x - tail.x) / length
      const uy = (tip.y - tail.y) / length
      const horizontal = Math.abs(ux) >= Math.abs(uy)
      return [
        { type: 'polygon', key: 'arrow', attrs: { coordinates: arrowMarkerOutline(tail, tip) }, styles: { style: 'stroke_fill', color, borderColor: color, borderSize: 2 } },
        {
          type: 'editableText',
          key: 'label',
          attrs: {
            x: tail.x - ux * LABEL_GAP,
            y: tail.y - uy * LABEL_GAP,
            text: props.text ?? '',
            align: horizontal ? (ux > 0 ? 'right' : 'left') : 'center',
            baseline: horizontal ? 'middle' : (uy > 0 ? 'bottom' : 'top')
          },
          styles: { color: props.textColor, size: props.textFontSize, weight: props.textFontWeight, fontStyle: props.textFontStyle, backgroundColor: 'transparent' }
        }
      ]
    },
    setProperties,
    getProperties
  }
}

export default arrowMarker
