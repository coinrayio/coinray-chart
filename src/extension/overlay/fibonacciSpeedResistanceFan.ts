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

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'

import type { LineAttrs } from '../figure/line'
import type { TextAttrs } from '../figure/text'

import { getRayLine } from './utils'

export const FIBONACCI_FAN_LEVELS: FigureLevel[] = [
  { value: 0, enabled: true },
  { value: 0.25, enabled: true },
  { value: 0.382, enabled: true },
  { value: 0.5, enabled: true },
  { value: 0.618, enabled: true },
  { value: 0.75, enabled: true },
  { value: 1, enabled: true }
]

const fibonacciSpeedResistanceFan = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const fbLinesStyle = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: props.lineStyle ?? 'solid',
    size: props.lineWidth,
    color: props.lineColor ?? props.borderColor,
    dashedValue: props.lineDashedValue
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
    name: 'fibonacciSpeedResistanceFan',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const props = properties.get(overlay.id) ?? {}
      const lines1: LineAttrs[] = []
      const lines2: LineAttrs[] = []
      const texts: TextAttrs[] = []
      if (coordinates.length > 1) {
        const xOffset = coordinates[1].x > coordinates[0].x ? -38 : 4
        const yOffset = coordinates[1].y > coordinates[0].y ? -2 : 20
        const xDistance = coordinates[1].x - coordinates[0].x
        const yDistance = coordinates[1].y - coordinates[0].y
        const levels = ((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_FAN_LEVELS)
          .filter(l => l.enabled === true)
        levels.forEach(level => {
          const percent = level.value ?? 0
          const x = coordinates[1].x - xDistance * percent
          const y = coordinates[1].y - yDistance * percent
          const levelKey = `fan_${percent}`
          lines1.push({ key: `${levelKey}_grid_x`, coordinates: [{ x, y: coordinates[0].y }, { x, y: coordinates[1].y }] })
          lines1.push({ key: `${levelKey}_grid_y`, coordinates: [{ x: coordinates[0].x, y }, { x: coordinates[1].x, y }] })
          const rayLine1 = getRayLine([coordinates[0], { x, y: coordinates[1].y }], bounding)
          const rayLine2 = getRayLine([coordinates[0], { x: coordinates[1].x, y }], bounding)
          const rays1 = Array.isArray(rayLine1) ? rayLine1 : [rayLine1]
          const rays2 = Array.isArray(rayLine2) ? rayLine2 : [rayLine2]
          rays1.forEach((r, i) => { if ('coordinates' in r) lines2.push({ ...r, key: `${levelKey}_ray_x_${i}` }) })
          rays2.forEach((r, i) => { if ('coordinates' in r) lines2.push({ ...r, key: `${levelKey}_ray_y_${i}` }) })
          texts.unshift({
            key: `${levelKey}_text_y`,
            x: coordinates[0].x + xOffset,
            y: y + 10,
            text: percent.toFixed(3)
          })
          texts.unshift({
            key: `${levelKey}_text_x`,
            x: x - 18,
            y: coordinates[0].y + yOffset,
            text: percent.toFixed(3)
          })
        })
      }
      return [
        {
          type: 'line',
          attrs: lines1,
          styles: fbLinesStyle(props)
        },
        {
          type: 'line',
          attrs: lines2,
          styles: fbLinesStyle(props)
        },
        {
          type: 'text',
          isCheckEvent: false,
          attrs: texts,
          styles: textStyle(props)
        }
      ]
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

export default fibonacciSpeedResistanceFan
