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
import { visibleHighLowMarks } from '../common/utils/highLowMarks'
import { candleTypeUsesHighLow } from '../common/Styles'

import View from './View'

import type { YAxis } from '../component/YAxis'

export default class CandleHighLowLineView extends View<YAxis> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chartStore = pane.getChart().getChartStore()
    const styles = chartStore.getStyles()
    const priceMarkStyles = styles.candle.priceMark
    const axisStyles = priceMarkStyles.highLowAxis
    if (!priceMarkStyles.show || !axisStyles.show || !axisStyles.line.show || !candleTypeUsesHighLow(styles.candle.type)) {
      return
    }
    const { high, low } = visibleHighLowMarks(chartStore.getVisibleRangeHighLowPrice())
    const yAxis = pane.getAxisComponent()
    const prices = [high, low]
    prices.forEach(price => {
      if (price === null) {
        return
      }
      const y = yAxis.convertToPixel(price)
      if (y < 0 || y > bounding.height) {
        return
      }
      this.createFigure({
        name: 'line',
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width, y }
          ]
        },
        styles: {
          style: axisStyles.line.style,
          color: axisStyles.color,
          size: axisStyles.line.size,
          dashedValue: axisStyles.line.dashedValue
        }
      })?.draw(ctx)
    })
  }
}
