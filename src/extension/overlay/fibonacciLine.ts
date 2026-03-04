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
import { isNumber, merge, clone } from '../../common/utils/typeChecks'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'

import type { LineAttrs } from '../figure/line'
import type { TextAttrs } from '../figure/text'

export const FIBONACCI_RETRACEMENT_LEVELS: FigureLevel[] = [
  { value: 0, enabled: true },
  { value: 0.236, enabled: true },
  { value: 0.382, enabled: true },
  { value: 0.5, enabled: true },
  { value: 0.618, enabled: true },
  { value: 0.786, enabled: true },
  { value: 1, enabled: true },
  { value: 1.618, enabled: false },
  { value: 2.618, enabled: false },
  { value: 3.618, enabled: false },
  { value: 4.236, enabled: false }
]

const fibonacciLine = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyleFn = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: props.lineStyle ?? 'solid',
    size: props.lineWidth,
    color: props.lineColor ?? props.borderColor,
    dashedValue: props.lineDashedValue
  })

  const textStyleFn = (props: DeepPartial<OverlayProperties>): Partial<TextStyle> => ({
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
    name: 'fibonacciLine',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis }) => {
      const props = properties.get(overlay.id) ?? {}
      const points = overlay.points

      if (coordinates.length > 0) {
        let precision = 0
        if (yAxis?.isInCandle() ?? true) {
          precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
        } else {
          const indicators = chart.getIndicators({ paneId: overlay.paneId })
          indicators.forEach(indicator => {
            precision = Math.max(precision, indicator.precision)
          })
        }

        const lines: LineAttrs[] = []
        const texts: TextAttrs[] = []
        const startX = 0
        const endX = bounding.width

        if (coordinates.length > 1 && isNumber(points[0].value) && isNumber(points[1].value)) {
          const levels = ((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_RETRACEMENT_LEVELS)
            .filter(l => l.enabled === true)
          const yDif = coordinates[0].y - coordinates[1].y
          const valueDif = points[0].value - points[1].value
          const decimalFold = chart.getDecimalFold()
          const thousandsSeparator = chart.getThousandsSeparator()

          levels.forEach(level => {
            const percent = level.value ?? 0
            const y = coordinates[1].y + yDif * percent
            const value = decimalFold.format(thousandsSeparator.format(
              ((points[1].value ?? 0) + valueDif * percent).toFixed(precision)
            ))
            const levelKey = `level_${percent}`
            lines.push({
              key: levelKey,
              coordinates: [{ x: startX, y }, { x: endX, y }]
            })
            texts.push({
              key: `${levelKey}_text`,
              x: startX,
              y,
              text: `${value} (${(percent * 100).toFixed(1)}%)`,
              baseline: 'bottom'
            })
          })
        }

        return [
          {
            type: 'line',
            attrs: lines,
            styles: lineStyleFn(props)
          },
          {
            type: 'text',
            isCheckEvent: false,
            attrs: texts,
            styles: textStyleFn(props)
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

export default fibonacciLine
