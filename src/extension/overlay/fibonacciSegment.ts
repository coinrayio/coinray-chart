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
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'

import type { OverlayProperties, ProOverlayTemplate } from './types'

import type { LineAttrs } from '../figure/line'
import type { TextAttrs } from '../figure/text'

import { FIBONACCI_RETRACEMENT_LEVELS } from './fibonacciLine'

const fibonacciSegment = (): ProOverlayTemplate => {
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
    name: 'fibonacciSegment',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay, chart, yAxis }) => {
      const props = properties.get(overlay.id) ?? {}
      const lines: LineAttrs[] = []
      const texts: TextAttrs[] = []
      if (coordinates.length > 1) {
        let precision = 0
        const symbol = chart.getSymbol()
        if ((yAxis?.isInCandle() ?? true) && symbol != null) {
          precision = symbol.pricePrecision
        } else {
          precision = SymbolDefaultPrecisionConstants.PRICE
          const indicators = chart.getIndicators({ paneId: overlay.paneId })
          indicators.forEach(indicator => {
            precision = Math.max(precision, indicator.precision)
          })
        }

        const ext = overlay.extendData as { extendLeft?: boolean; extendRight?: boolean } | undefined
        const leftX = ext?.extendLeft === true ? 0 : Math.min(coordinates[0].x, coordinates[1].x)
        const rightX = ext?.extendRight === true ? bounding.width : Math.max(coordinates[0].x, coordinates[1].x)
        const textX = leftX

        const levels = ((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_RETRACEMENT_LEVELS)
          .filter(l => l.enabled === true)
        const yDif = coordinates[0].y - coordinates[1].y
        const points = overlay.points
        const valueDif = (points[0]?.value ?? 0) - (points[1]?.value ?? 0)
        const decimalFold = chart.getDecimalFold()
        const thousandsSeparator = chart.getThousandsSeparator()
        levels.forEach(level => {
          const percent = level.value ?? 0
          const y = coordinates[1].y + yDif * percent
          const rawPrice = ((points[1]?.value ?? 0) + valueDif * percent).toFixed(precision)
          const price = decimalFold.format(thousandsSeparator.format(rawPrice))
          const levelKey = `level_${percent}`
          lines.push({
            key: levelKey,
            coordinates: [{ x: leftX, y }, { x: rightX, y }]
          })
          texts.push({
            key: `${levelKey}_text`,
            x: textX,
            y,
            text: `${price} (${(percent * 100).toFixed(1)}%)`,
            baseline: 'bottom'
          })
        })
      }
      return [
        {
          type: 'line',
          attrs: lines,
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

export default fibonacciSegment
