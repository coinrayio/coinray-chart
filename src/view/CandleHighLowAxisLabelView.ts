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
import { calcTextWidth } from '../common/utils/canvas'
import { visibleHighLowMarks } from '../common/utils/highLowMarks'
import { candleTypeUsesHighLow } from '../common/Styles'
import { SymbolDefaultPrecisionConstants } from '../common/SymbolInfo'

import View from './View'

import type { YAxis } from '../component/YAxis'

export default class CandleHighLowAxisLabelView extends View<YAxis> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chartStore = pane.getChart().getChartStore()
    const styles = chartStore.getStyles()
    const priceMarkStyles = styles.candle.priceMark
    const axisStyles = priceMarkStyles.highLowAxis
    if (!priceMarkStyles.show || !axisStyles.show || !axisStyles.text.show || !candleTypeUsesHighLow(styles.candle.type)) {
      return
    }
    const { high, low } = visibleHighLowMarks(chartStore.getVisibleRangeHighLowPrice())
    const precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
    const yAxis = pane.getAxisComponent()
    const range = yAxis.getRange()
    const decimalFold = chartStore.getDecimalFold()
    const thousandsSeparator = chartStore.getThousandsSeparator()
    const { paddingLeft, paddingRight, paddingTop, paddingBottom, size, family, weight } = axisStyles.text
    const fromZero = yAxis.isFromZero()
    const prices = [high, low]
    prices.forEach(price => {
      if (price === null) {
        return
      }
      const y = yAxis.convertToPixel(price)
      // A manual range can leave the extreme off screen; a label there would be a stray.
      if (y < 0 || y > bounding.height) {
        return
      }
      const text = decimalFold.format(thousandsSeparator.format(yAxis.displayValueToText(
        yAxis.realValueToDisplayValue(yAxis.valueToRealValue(price, { range }), { range }),
        precision
      )))
      this.createFigure({
        name: 'text',
        attrs: {
          x: fromZero ? 0 : bounding.width,
          y,
          width: paddingLeft + calcTextWidth(text, size, weight, family) + paddingRight,
          height: paddingTop + size + paddingBottom,
          text,
          align: fromZero ? 'left' : 'right',
          baseline: 'middle'
        },
        styles: { ...axisStyles.text, backgroundColor: axisStyles.color }
      })?.draw(ctx)
    })
  }
}
