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

import { isValid } from '../common/utils/typeChecks'
import { calcTextWidth } from '../common/utils/canvas'
import type { TextStyle } from '../common/Styles'
import { SymbolDefaultPrecisionConstants } from '../common/SymbolInfo'

import View from './View'
import { layoutLastPriceTag } from './lastPriceTagLayout'

import type { FigureCreate } from '../component/Figure'
import type YAxis from '../component/YAxis'
import type { TextAttrs } from '../extension/figure/text'

export default class CandleLastPriceLabelView extends View {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chartStore = pane.getChart().getChartStore()
    const priceMarkStyles = chartStore.getStyles().candle.priceMark
    const lastPriceMarkStyles = priceMarkStyles.last
    const lastPriceMarkTextStyles = lastPriceMarkStyles.text
    // The rows (the bar countdown) don't need the price: with the price label
    // off, the first row takes its place on the last price.
    const priceShown = lastPriceMarkTextStyles.show
    const rowsShown = lastPriceMarkStyles.extendTexts.some(item => item.show)
    if (priceMarkStyles.show && lastPriceMarkStyles.show && (priceShown || rowsShown)) {
      const precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
      const yAxis = pane.getAxisComponent() as YAxis
      const dataList = chartStore.getDataList(true)
      const data = dataList[dataList.length - 1]

      if (isValid(data)) {
        const { close, open } = data
        const comparePrice = lastPriceMarkStyles.compareRule === 'current_open' ? open : (dataList[dataList.length - 2]?.close ?? close)
        const priceY = yAxis.convertToNicePixel(close)
        let backgroundColor = ''
        if (close > comparePrice) {
          backgroundColor = lastPriceMarkStyles.upColor
        } else if (close < comparePrice) {
          backgroundColor = lastPriceMarkStyles.downColor
        } else {
          backgroundColor = lastPriceMarkStyles.noChangeColor
        }
        let x = 0
        let textAlgin: CanvasTextAlign = 'left'
        if (yAxis.isFromZero()) {
          x = 0
          textAlgin = 'left'
        } else {
          x = bounding.width
          textAlgin = 'right'
        }

        const textFigures: Array<FigureCreate<TextAttrs, TextStyle>> = []
        const yAxisRange = yAxis.getRange()
        let priceText = yAxis.displayValueToText(
          yAxis.realValueToDisplayValue(
            yAxis.valueToRealValue(close, { range: yAxisRange }),
            { range: yAxisRange }
          ),
          precision
        )
        priceText = chartStore.getDecimalFold().formatPrice(chartStore.getThousandsSeparator().format(priceText))
        const { paddingLeft, paddingRight, paddingTop, paddingBottom, size, family, weight } = lastPriceMarkTextStyles
        let textWidth = priceShown ? paddingLeft + calcTextWidth(priceText, size, weight, family) + paddingRight : 0
        const priceTextHeight = paddingTop + size + paddingBottom
        if (priceShown) {
          textFigures.push({
            name: 'text',
            attrs: {
              x,
              y: priceY,
              width: textWidth,
              height: priceTextHeight,
              text: priceText,
              align: textAlgin,
              baseline: 'middle'
            },
            styles: {
              ...lastPriceMarkTextStyles,
              backgroundColor
            }
          })
        }
        const formatExtendText = chartStore.getInnerFormatter().formatExtendText
        const rows = lastPriceMarkStyles.extendTexts.flatMap((style, index) =>
          style.show ? [{ text: formatExtendText({ type: 'last_price', data, index }), style }] : []
        )
        layoutLastPriceTag(priceY, priceShown ? lastPriceMarkTextStyles : null, rows)?.rows.forEach(({ text, style, y }) => {
          textWidth = Math.max(textWidth, style.paddingLeft + calcTextWidth(text, style.size, style.weight, style.family) + style.paddingRight)
          textFigures.push({
            name: 'text',
            attrs: {
              x,
              y,
              width: textWidth,
              height: style.paddingTop + style.size + style.paddingBottom,
              text,
              align: textAlgin,
              baseline: 'middle'
            },
            styles: { ...style, backgroundColor }
          })
        })
        textFigures.forEach(figure => {
          figure.attrs.width = textWidth
          this.createFigure(figure)?.draw(ctx)
        })
      }
    }
  }
}
