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

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'

import type { CircleAttrs } from '../figure/circle'
import type { TextAttrs } from '../figure/text'

import { getDistance } from './utils'

export const FIBONACCI_CIRCLE_LEVELS: FigureLevel[] = [
  { value: 0.236, enabled: true },
  { value: 0.382, enabled: true },
  { value: 0.5, enabled: true },
  { value: 0.618, enabled: true },
  { value: 0.786, enabled: true },
  { value: 1, enabled: true }
]

const fibonacciCircle = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const circleStyle = (props: DeepPartial<OverlayProperties>): Partial<PolygonStyle> => ({
    style: props.style ?? 'stroke',
    color: props.backgroundColor ?? 'rgba(22, 119, 255, 0.15)',
    borderColor: props.lineColor ?? props.borderColor,
    borderSize: props.borderWidth,
    borderStyle: props.borderStyle ?? props.lineStyle
  })

  const textStyle = (props: DeepPartial<OverlayProperties>): Partial<TextStyle> => ({
    color: props.textColor,
    family: props.textFont,
    size: props.textFontSize,
    weight: props.textFontWeight,
    backgroundColor: props.textBackgroundColor,
    paddingLeft: props.textPaddingLeft,
    paddingRight: props.textPaddingRight,
    paddingTop: props.textPaddingTop,
    paddingBottom: props.textPaddingBottom
  })

  return {
    name: 'fibonacciCircle',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const props = properties.get(overlay.id) ?? {}
      if (coordinates.length > 1) {
        const radius = getDistance(coordinates[0], coordinates[1])
        const levels = ((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_CIRCLE_LEVELS)
          .filter(l => l.enabled === true)
        const circles: CircleAttrs[] = []
        const texts: TextAttrs[] = []
        levels.forEach(level => {
          const percent = level.value ?? 0
          const r = radius * percent
          const levelKey = `circle_${percent}`
          circles.push({
            key: levelKey,
            ...coordinates[0],
            r
          })
          texts.push({
            key: `${levelKey}_text`,
            x: coordinates[0].x,
            y: coordinates[0].y + r + 6,
            text: `${(percent * 100).toFixed(1)}%`
          })
        })
        return [
          {
            type: 'circle',
            attrs: circles,
            styles: circleStyle(props)
          },
          {
            type: 'text',
            isCheckEvent: false,
            attrs: texts,
            styles: textStyle(props)
          }
        ]
      }
      return []
    },
    setProperties: (_properties: DeepPartial<OverlayProperties>, id: string) => {
      const current = properties.get(id) ?? {}
      const newProps = clone(current) as Record<string, unknown>
      merge(newProps, _properties)
      properties.set(id, newProps as DeepPartial<OverlayProperties>)
    },
    getProperties: (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}
  }
}

export default fibonacciCircle
