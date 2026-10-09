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

import { isNumber, isValid } from '../common/utils/typeChecks'

import { eachFigures, getRebaseFactor, isBoundToAxis, isRebased, type IndicatorFigure, type IndicatorFigureStyle } from '../component/Indicator'

import View from './View'

import type { YAxis } from '../component/YAxis'

export default class IndicatorLastValueView extends View<YAxis> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chartStore = pane.getChart().getChartStore()
    const defaultStyles = chartStore.getStyles().indicator
    const lastValueMarkStyles = defaultStyles.lastValueMark
    const lastValueMarkTextStyles = lastValueMarkStyles.text
    {
      const yAxis = widget.getAxis()
      const yAxisRange = yAxis.getRange()
      const dataList = chartStore.getDataList()
      const dataIndex = dataList.length - 1
      const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
        .filter(indicator => isBoundToAxis(indicator, yAxis.isSecondary()))
      const formatter = chartStore.getInnerFormatter()
      const decimalFold = chartStore.getDecimalFold()
      const thousandsSeparator = chartStore.getThousandsSeparator()
      indicators.forEach(indicator => {
        const result = indicator.result
        const data = result[dataIndex] ?? {}
        // An indicator can turn its own mark on or off (`styles.lastValueMark.show`);
        // without one, the chart-wide setting decides.
        const show = indicator.styles?.lastValueMark?.show ?? lastValueMarkStyles.show
        if (show && isValid(data) && indicator.visible) {
          const precision = indicator.precision
          const factor = isRebased(indicator, pane.getId()) ? getRebaseFactor(pane.getChart(), indicator) : 1
          eachFigures(indicator, dataIndex, defaultStyles, (figure: IndicatorFigure, figureStyles: Required<IndicatorFigureStyle>) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
            const rawValue = data[figure.key]
            if (isNumber(rawValue)) {
              const value = rawValue * factor
              const y = yAxis.convertToNicePixel(value)
              let text = yAxis.displayValueToText(
                yAxis.realValueToDisplayValue(
                  yAxis.valueToRealValue(value, { range: yAxisRange }),
                  { range: yAxisRange }
                ),
                precision
              )
              if (indicator.shouldFormatBigNumber) {
                text = formatter.formatBigNumber(text)
              }
              text = decimalFold.format(thousandsSeparator.format(text))
              let x = 0
              let textAlign: CanvasTextAlign = 'left'
              if (yAxis.isFromZero()) {
                x = 0
                textAlign = 'left'
              } else {
                x = bounding.width
                textAlign = 'right'
              }

              this.createFigure({
                name: 'text',
                attrs: {
                  x,
                  y,
                  text,
                  align: textAlign,
                  baseline: 'middle'
                },
                styles: {
                  ...lastValueMarkTextStyles,
                  backgroundColor: figureStyles.color
                }
              })?.draw(ctx)
            }
          })
        }
      })
    }
  }
}
