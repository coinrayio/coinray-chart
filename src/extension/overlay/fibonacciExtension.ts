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

const fibonacciExtension = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const diagLineStyle = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: 'dashed',
    size: props.lineWidth,
    color: props.lineColor ?? props.borderColor,
    dashedValue: props.lineDashedValue
  })

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
    name: 'fibonacciExtension',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ chart, yAxis, coordinates, overlay }) => {
      const props = properties.get(overlay.id) ?? {}
      const fbLines: LineAttrs[] = []
      const texts: TextAttrs[] = []
      if (coordinates.length > 2) {
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
        const points = overlay.points
        const valueDif = (points[1]?.value ?? 0) - (points[0]?.value ?? 0)
        const yDif = coordinates[1].y - coordinates[0].y
        const percents = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236]
        const textX = coordinates[2].x > coordinates[1].x ? coordinates[1].x : coordinates[2].x
        const decimalFold = chart.getDecimalFold()
        const thousandsSeparator = chart.getThousandsSeparator()
        percents.forEach(percent => {
          const y = coordinates[2].y + yDif * percent
          const rawPrice = ((points[2]?.value ?? 0) + valueDif * percent).toFixed(precision)
          const price = decimalFold.format(thousandsSeparator.format(rawPrice))
          fbLines.push({ coordinates: [{ x: coordinates[1].x, y }, { x: coordinates[2].x, y }] })
          texts.push({
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
          attrs: { coordinates },
          styles: diagLineStyle(props)
        },
        {
          type: 'line',
          attrs: fbLines,
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

export default fibonacciExtension
