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
import type { LineStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { getLinearYFromCoordinates } from '../figure/line'
import { computeTextPosition } from './textUtils'

const segment = (): ProOverlayTemplate => {
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
    name: 'segment',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length !== 2) {
        return []
      }

      const id = overlay.id
      const ext = overlay.extendData as { extendLeft?: boolean; extendRight?: boolean } | undefined
      const extendLeft = ext?.extendLeft === true
      const extendRight = ext?.extendRight === true

      let lineCoordinates: Array<{ x: number; y: number }> = coordinates

      if (!extendLeft && !extendRight) {
        lineCoordinates = coordinates
      } else if (coordinates[0].x === coordinates[1].x) {
        // Vertical line — extend top/bottom
        const minY = Math.min(coordinates[0].y, coordinates[1].y)
        const maxY = Math.max(coordinates[0].y, coordinates[1].y)
        lineCoordinates = [
          { x: coordinates[0].x, y: extendLeft ? 0 : minY },
          { x: coordinates[0].x, y: extendRight ? bounding.height : maxY }
        ]
      } else {
        // Determine left/right points
        const [leftPt, rightPt] = coordinates[0].x <= coordinates[1].x
          ? [coordinates[0], coordinates[1]]
          : [coordinates[1], coordinates[0]]

        const startX = extendLeft ? 0 : leftPt.x
        const endX = extendRight ? bounding.width : rightPt.x
        lineCoordinates = [
          { x: startX, y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: startX, y: leftPt.y }) },
          { x: endX, y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: endX, y: rightPt.y }) }
        ]
      }

      const figures: Array<{
        type: string
        attrs: unknown
        styles?: Partial<LineStyle> | Partial<TextStyle>
      }> = [
        {
          type: 'line',
          attrs: { coordinates: lineCoordinates },
          styles: lineStyle(id)
        }
      ]

      const props = properties.get(id) ?? {}
      const text = props.text ?? ''
      const midX = (lineCoordinates[0].x + lineCoordinates[1].x) / 2
      const midY = (lineCoordinates[0].y + lineCoordinates[1].y) / 2
      figures.push({
        type: 'editableText',
        attrs: { ...computeTextPosition(midX, midY, props, bounding.width, 'center', 'top'), text },
        styles: textStyle(id)
      })

      return figures
    },
    setProperties,
    getProperties
  }
}

export default segment
