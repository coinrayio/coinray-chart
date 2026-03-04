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
import type { LineStyle, PolygonStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import type { LineAttrs } from '../figure/line'
import type { PolygonAttrs } from '../figure/polygon'

/**
 * Gann Box overlay - Gann grid with specific ratio lines
 * 2 points defining the box corners
 * Includes diagonal lines at quarter ratios and Fibonacci-based ratios (0.236, 0.5)
 */
const gannBox = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const polygonStyle = (id: string): DeepPartial<PolygonStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.style ?? 'fill',
      color: props.backgroundColor ?? 'rgba(22, 119, 255, 0.15)',
      borderColor: props.lineColor ?? props.borderColor,
      borderSize: props.borderWidth,
      borderStyle: props.borderStyle ?? props.lineStyle
    }
  }

  const lineStyle = (id: string): DeepPartial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle,
      size: props.lineWidth,
      color: props.lineColor ?? props.borderColor,
      dashedValue: props.lineDashedValue
    }
  }

  const dashedLineStyle = (id: string): DeepPartial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: 'dashed',
      size: props.lineWidth,
      color: props.lineColor ?? props.borderColor,
      dashedValue: props.lineDashedValue
    }
  }

  const solidLineStyle = (id: string): DeepPartial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: 'solid',
      size: props.lineWidth,
      color: props.lineColor ?? props.borderColor,
      dashedValue: props.lineDashedValue
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
    name: 'gannBox',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const id = overlay.id

      if (coordinates.length > 1) {
        const quarterYDis = (coordinates[1].y - coordinates[0].y) / 4
        const xDis = coordinates[1].x - coordinates[0].x

        const dashedLines: LineAttrs[] = [
          { key: 'dashed_0', coordinates: [coordinates[0], { x: coordinates[1].x, y: coordinates[1].y - quarterYDis }] },
          { key: 'dashed_1', coordinates: [coordinates[0], { x: coordinates[1].x, y: coordinates[1].y - quarterYDis * 2 }] },
          { key: 'dashed_2', coordinates: [{ x: coordinates[0].x, y: coordinates[1].y }, { x: coordinates[1].x, y: coordinates[0].y + quarterYDis }] },
          { key: 'dashed_3', coordinates: [{ x: coordinates[0].x, y: coordinates[1].y }, { x: coordinates[1].x, y: coordinates[0].y + quarterYDis * 2 }] },
          { key: 'dashed_4', coordinates: [{ ...coordinates[0] }, { x: coordinates[0].x + xDis * 0.236, y: coordinates[1].y }] },
          { key: 'dashed_5', coordinates: [{ ...coordinates[0] }, { x: coordinates[0].x + xDis * 0.5, y: coordinates[1].y }] },
          { key: 'dashed_6', coordinates: [{ x: coordinates[0].x, y: coordinates[1].y }, { x: coordinates[0].x + xDis * 0.236, y: coordinates[0].y }] },
          { key: 'dashed_7', coordinates: [{ x: coordinates[0].x, y: coordinates[1].y }, { x: coordinates[0].x + xDis * 0.5, y: coordinates[0].y }] }
        ]

        const solidLines: LineAttrs[] = [
          { key: 'solid_0', coordinates: [coordinates[0], coordinates[1]] },
          { key: 'solid_1', coordinates: [{ x: coordinates[0].x, y: coordinates[1].y }, { x: coordinates[1].x, y: coordinates[0].y }] }
        ]

        const borderLines: LineAttrs[] = [
          { key: 'border_0', coordinates: [coordinates[0], { x: coordinates[1].x, y: coordinates[0].y }] },
          { key: 'border_1', coordinates: [{ x: coordinates[1].x, y: coordinates[0].y }, coordinates[1]] },
          { key: 'border_2', coordinates: [coordinates[1], { x: coordinates[0].x, y: coordinates[1].y }] },
          { key: 'border_3', coordinates: [{ x: coordinates[0].x, y: coordinates[1].y }, coordinates[0]] }
        ]

        const polygonAttrs: PolygonAttrs = {
          coordinates: [
            coordinates[0],
            { x: coordinates[1].x, y: coordinates[0].y },
            coordinates[1],
            { x: coordinates[0].x, y: coordinates[1].y }
          ]
        }

        return [
          {
            type: 'line',
            attrs: borderLines,
            styles: lineStyle(id)
          },
          {
            type: 'polygon',
            key: 'fill',
            ignoreEvent: true,
            attrs: polygonAttrs,
            styles: polygonStyle(id)
          },
          {
            type: 'line',
            attrs: dashedLines,
            styles: dashedLineStyle(id)
          },
          {
            type: 'line',
            attrs: solidLines,
            styles: solidLineStyle(id)
          }
        ]
      }
      return []
    },
    setProperties,
    getProperties
  }
}

export default gannBox
