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
import type { PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { computeTextPosition } from './textUtils'

/**
 * Rectangle overlay - rectangle defined by two corner points
 * First point is one corner, second point is the opposite corner
 */
const rect = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const rectStyle = (id: string): Partial<PolygonStyle> => {
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
    name: 'rect',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) {
        return []
      }

      const topLeft = coordinates[0]
      const bottomRight = coordinates[1]
      const id = overlay.id

      // Create rectangle as polygon with four corners
      const rectCoordinates = [
        topLeft,
        { x: bottomRight.x, y: topLeft.y },
        bottomRight,
        { x: topLeft.x, y: bottomRight.y }
      ]

      const figures: Array<{ type: string; attrs: unknown; styles?: unknown }> = [
        {
          type: 'polygon',
          attrs: { coordinates: rectCoordinates },
          styles: rectStyle(id)
        }
      ]

      const props = properties.get(id) ?? {}
      const text = props.text ?? ''
      figures.push({
        type: 'editableText',
        attrs: {
          ...computeTextPosition((topLeft.x + bottomRight.x) / 2, (topLeft.y + bottomRight.y) / 2, props, bounding.width, 'center', 'middle'), text
        },
        styles: textStyle(id)
      })

      return figures
    },
    setProperties,
    getProperties
  }
}

export default rect
