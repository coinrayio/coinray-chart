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
import { lastPriceTagBox, stackTags, type TagBox } from './OverlayYAxisView'

import type { YAxis } from '../component/YAxis'
import type YAxisImp from '../component/YAxis'

interface ValueLabel { key: string, value: number, y: number, text: string, color: string }

/**
 * Each indicator plot's last value as a label on the price scale, in the
 * plot's colour. As on tradingview.com, labels that would overlap are stacked
 * apart (around the last-price tag, which stays put), and a plot drawn
 * transparent, a hidden one or a script's level line, gets none.
 */
export default class IndicatorLastValueView extends View<YAxis> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chartStore = pane.getChart().getChartStore()
    const defaultStyles = chartStore.getStyles().indicator
    const lastValueMarkStyles = defaultStyles.lastValueMark
    const lastValueMarkTextStyles = lastValueMarkStyles.text
    const yAxis = widget.getAxis()
    const yAxisRange = yAxis.getRange()
    const dataList = chartStore.getDataList()
    const dataIndex = dataList.length - 1
    const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
      .filter(indicator => isBoundToAxis(indicator, yAxis.isSecondary()))
    const formatter = chartStore.getInnerFormatter()
    const decimalFold = chartStore.getDecimalFold()
    const thousandsSeparator = chartStore.getThousandsSeparator()
    const labels: ValueLabel[] = []
    indicators.forEach(indicator => {
      const result = indicator.result
      const data = result[dataIndex] ?? {}
      // An indicator can turn its own mark on or off (`styles.lastValueMark.show`);
      // without one, the chart-wide setting decides.
      const show = indicator.styles?.lastValueMark?.show ?? lastValueMarkStyles.show
      if (!show || !isValid(data) || !indicator.visible) return
      const precision = indicator.precision
      const factor = isRebased(indicator, pane.getId()) ? getRebaseFactor(pane.getChart(), indicator) : 1
      eachFigures(indicator, dataIndex, defaultStyles, (figure: IndicatorFigure, figureStyles: Required<IndicatorFigureStyle>, index: number) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
        const rawValue = data[figure.key]
        const color = figureStyles.color
        if (!isNumber(rawValue) || typeof color !== 'string' || color === 'transparent') return
        const value = rawValue * factor
        let text = yAxis.displayValueToText(
          yAxis.realValueToDisplayValue(
            yAxis.valueToRealValue(value, { range: yAxisRange }),
            { range: yAxisRange }
          ),
          precision
        )
        // Never on the price pane: an indicator moved there labels in
        // prices, as the axis beside it does.
        if (indicator.shouldFormatBigNumber && !yAxis.isInCandle()) {
          text = formatter.formatBigNumber(text)
        }
        text = yAxis.isInCandle()
          ? decimalFold.formatPrice(thousandsSeparator.format(text))
          : decimalFold.format(thousandsSeparator.format(text)) + indicator.valueSuffix
        labels.push({ key: `${indicator.id}:${index}`, value, y: yAxis.convertToNicePixel(value), text, color })
      })
    })
    if (labels.length === 0) return

    const { paddingTop, size, paddingBottom } = lastValueMarkTextStyles
    const height = paddingTop + size + paddingBottom
    const boxes: TagBox[] = labels.map(l => ({ key: l.key, y: l.y, height, fixed: false, value: l.value }))
    const price = yAxis.isSecondary() ? null : lastPriceTagBox(yAxis as unknown as YAxisImp, chartStore)
    if (price !== null) boxes.push(price)
    const shifts = stackTags(boxes, (yAxis as unknown as { reverse?: boolean }).reverse === true, { top: 0, bottom: bounding.height })

    const fromZero = yAxis.isFromZero()
    labels.forEach(label => {
      this.createFigure({
        name: 'text',
        attrs: {
          x: fromZero ? 0 : bounding.width,
          y: label.y + (shifts.get(label.key) ?? 0),
          text: label.text,
          align: fromZero ? 'left' : 'right',
          baseline: 'middle'
        },
        styles: {
          ...lastValueMarkTextStyles,
          backgroundColor: label.color
        }
      })?.draw(ctx)
    })
  }
}
