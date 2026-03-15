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
import type Bounding from '../../common/Bounding'
import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { computeTextPosition } from './textUtils'

import { type LineAttrs, getLinearSlopeIntercept } from '../figure/line'

/**
 * 获取平行线
 * @param coordinates
 * @param bounding
 * @param extendParallelLineCount
 * @returns {Array}
 */
export function getParallelLines (coordinates: Coordinate[], bounding: Bounding, extendParallelLineCount?: number): LineAttrs[] {
  const count = extendParallelLineCount ?? 0
  const lines: LineAttrs[] = []
  if (coordinates.length > 1) {
    if (coordinates[0].x === coordinates[1].x) {
      const startY = 0
      const endY = bounding.height
      lines.push({ key: `line_${lines.length}`, coordinates: [{ x: coordinates[0].x, y: startY }, { x: coordinates[0].x, y: endY }] })
      if (coordinates.length > 2) {
        lines.push({ key: `line_${lines.length}`, coordinates: [{ x: coordinates[2].x, y: startY }, { x: coordinates[2].x, y: endY }] })
        const distance = coordinates[0].x - coordinates[2].x
        for (let i = 0; i < count; i++) {
          const d = distance * (i + 1)
          lines.push({ key: `line_${lines.length}`, coordinates: [{ x: coordinates[0].x + d, y: startY }, { x: coordinates[0].x + d, y: endY }] })
        }
      }
    } else {
      const startX = 0
      const endX = bounding.width
      const kb = getLinearSlopeIntercept(coordinates[0], coordinates[1])!
      const k = kb[0]
      const b = kb[1]
      lines.push({ key: `line_${lines.length}`, coordinates: [{ x: startX, y: startX * k + b }, { x: endX, y: endX * k + b }] })
      if (coordinates.length > 2) {
        const b1 = coordinates[2].y - k * coordinates[2].x
        lines.push({ key: `line_${lines.length}`, coordinates: [{ x: startX, y: startX * k + b1 }, { x: endX, y: endX * k + b1 }] })
        const distance = b - b1
        for (let i = 0; i < count; i++) {
          const b2 = b + distance * (i + 1)
          lines.push({ key: `line_${lines.length}`, coordinates: [{ x: startX, y: startX * k + b2 }, { x: endX, y: endX * k + b2 }] })
        }
      }
    }
  }
  return lines
}

const parallelStraightLine = (): ProOverlayTemplate => {
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
    name: 'parallelStraightLine',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const id = overlay.id
      const props = properties.get(id) ?? {}
      const text = props.text ?? DEFAULT_OVERLAY_PROPERTIES.text
      const lines = getParallelLines(coordinates, bounding)
      const figures: Array<{ type: string; attrs: unknown; styles?: unknown }> = [
        {
          type: 'line',
          attrs: lines,
          styles: lineStyle(id)
        }
      ]
      if (lines.length > 0) {
        const firstLine = lines[0]
        const firstCoord = firstLine.coordinates[0]
        figures.push({
          type: 'editableText',
          attrs: {
            ...computeTextPosition(firstCoord.x, firstCoord.y, props, bounding.width, 'center', 'top'), text
          },
          styles: textStyle(id)
        })
      }
      return figures
    },
    setProperties,
    getProperties
  }
}

export default parallelStraightLine
