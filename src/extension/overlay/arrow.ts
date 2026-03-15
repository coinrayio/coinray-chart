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
import type { LineStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { computeTextPosition } from './textUtils'
import { getRotateCoordinate } from './utils'
import { getLinearSlopeIntercept } from '../figure/line'

/**
 * Arrow overlay - line with arrowhead at the end point
 * Uses two points to define the arrow direction and length
 */
const arrow = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      size: props.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth,
      dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
    }
  }

  const arrowheadStyle = (id: string): Partial<PolygonStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: 'fill',
      color: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      borderColor: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      borderSize: 0,
      borderStyle: 'solid',
      borderDashedValue: [2, 2]
    }
  }

  const textStyle = (id: string): Partial<TextStyle> => {
    const props = properties.get(id) ?? {}
    return {
      color: props.textColor ?? DEFAULT_OVERLAY_PROPERTIES.textColor,
      size: props.textFontSize ?? DEFAULT_OVERLAY_PROPERTIES.textFontSize,
      weight: props.textFontWeight ?? DEFAULT_OVERLAY_PROPERTIES.textFontWeight,
      family: props.textFont ?? DEFAULT_OVERLAY_PROPERTIES.textFont,
      paddingLeft: props.textPaddingLeft ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingLeft,
      paddingRight: props.textPaddingRight ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingRight,
      paddingTop: props.textPaddingTop ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingTop,
      paddingBottom: props.textPaddingBottom ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingBottom,
      backgroundColor: props.textBackgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.textBackgroundColor
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
    name: 'arrow',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) {
        return []
      }

      const start = coordinates[0]
      const end = coordinates[1]
      const id = overlay.id

      // Calculate arrowhead size based on line width
      const props = properties.get(id) ?? {}
      const lineWidth = props.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth
      const arrowSize = Math.max(8, lineWidth * 4)

      // Calculate the angle of the line
      const kb = getLinearSlopeIntercept(start, end)
      let angle = 0
      if (kb !== null) {
        angle = Math.atan(kb[0])
        if (end.x < start.x) {
          angle += Math.PI
        }
      } else {
        // Vertical line
        angle = end.y > start.y ? Math.PI / 2 : -Math.PI / 2
      }

      // Calculate arrowhead points
      const arrowAngle = Math.PI / 6 // 30 degrees
      const arrowPoint1 = getRotateCoordinate(
        { x: end.x - arrowSize, y: end.y },
        end,
        angle + arrowAngle
      )
      const arrowPoint2 = getRotateCoordinate(
        { x: end.x - arrowSize, y: end.y },
        end,
        angle - arrowAngle
      )

      const figures: Array<{ type: string; attrs: unknown; styles?: unknown }> = [
        {
          type: 'line',
          attrs: { coordinates: [start, end] },
          styles: lineStyle(id)
        },
        {
          type: 'polygon',
          attrs: { coordinates: [end, arrowPoint1, arrowPoint2] },
          styles: arrowheadStyle(id)
        }
      ]

      const text = props.text ?? ''
      figures.push({
        type: 'editableText',
        attrs: { ...computeTextPosition((start.x + end.x) / 2, (start.y + end.y) / 2, props, bounding.width, 'center', 'top'), text },
        styles: textStyle(id)
      })

      return figures
    },
    setProperties,
    getProperties
  }
}

export default arrow
