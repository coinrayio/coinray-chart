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
import type { PolygonStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'

/**
 * Triangle overlay - triangle defined by three points
 * Each click places one vertex of the triangle
 */
const triangle = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const triangleStyle = (id: string): Partial<PolygonStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.style ?? DEFAULT_OVERLAY_PROPERTIES.style,
      color: props.backgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.backgroundColor,
      borderColor: props.borderColor ?? DEFAULT_OVERLAY_PROPERTIES.borderColor,
      borderSize: props.borderWidth ?? DEFAULT_OVERLAY_PROPERTIES.borderWidth,
      borderStyle: props.borderStyle ?? DEFAULT_OVERLAY_PROPERTIES.borderStyle,
      borderDashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const current = properties.get(id) ?? {}
    const newProps = clone(current) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }

  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: 'triangle',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) {
        return []
      }

      const id = overlay.id

      // If only two points, draw lines between them
      if (coordinates.length === 2) {
        return [
          {
            type: 'line',
            attrs: { coordinates: [coordinates[0], coordinates[1]] },
            styles: {
              style: triangleStyle(id).borderStyle ?? 'solid',
              color: triangleStyle(id).borderColor ?? DEFAULT_OVERLAY_PROPERTIES.borderColor,
              size: triangleStyle(id).borderSize ?? DEFAULT_OVERLAY_PROPERTIES.borderWidth,
              dashedValue: triangleStyle(id).borderDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
            }
          }
        ]
      }

      // Three points - draw full triangle
      return [
        {
          type: 'polygon',
          attrs: { coordinates: [coordinates[0], coordinates[1], coordinates[2]] },
          styles: triangleStyle(id)
        }
      ]
    },
    setProperties,
    getProperties
  }
}

export default triangle
