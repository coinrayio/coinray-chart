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
 * Parallelogram overlay - parallelogram defined by three points
 * First two points define one side, third point defines the offset
 * Fourth point is calculated automatically to complete the parallelogram
 */
const parallelogram = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const parallelogramStyle = (id: string): Partial<PolygonStyle> => {
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
    name: 'parallelogram',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) {
        return []
      }

      const id = overlay.id
      const styles = parallelogramStyle(id)

      // If only two points, draw line between them
      if (coordinates.length === 2) {
        return [
          {
            type: 'line',
            attrs: { coordinates: [coordinates[0], coordinates[1]] },
            styles: {
              style: styles.borderStyle ?? 'solid',
              color: styles.borderColor ?? DEFAULT_OVERLAY_PROPERTIES.borderColor,
              size: styles.borderSize ?? DEFAULT_OVERLAY_PROPERTIES.borderWidth,
              dashedValue: styles.borderDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
            }
          }
        ]
      }

      // Three points - calculate the fourth point to complete the parallelogram
      // Point 4 = Point 3 + (Point 1 - Point 2)
      // This ensures parallel sides: P1-P2 is parallel to P4-P3, and P1-P4 is parallel to P2-P3
      const point1 = coordinates[0]
      const point2 = coordinates[1]
      const point3 = coordinates[2]
      const point4 = {
        x: point3.x + (point1.x - point2.x),
        y: point3.y + (point1.y - point2.y)
      }

      return [
        {
          type: 'polygon',
          attrs: { coordinates: [point1, point2, point3, point4] },
          styles
        }
      ]
    },
    setProperties,
    getProperties
  }
}

export default parallelogram
