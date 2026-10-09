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
import type Nullable from '../common/Nullable'
import type { KLineData } from '../common/Data'
import type { CandleLastPriceMarkStyle, NameLabelStyle, Styles } from '../common/Styles'
import type { SymbolInfo } from '../common/SymbolInfo'
import { calcTextWidth } from '../common/utils/canvas'
import { isNumber, isString, isValid } from '../common/utils/typeChecks'

import { eachFigures, getRebaseFactor, isBoundToAxis, isRebased, type Indicator, type IndicatorFigure, type IndicatorFigureStyle } from '../component/Indicator'
import type { YAxis } from '../component/YAxis'

import View from './View'

export interface NameLabel {
  text: string
  y: number
  color: string
  style: NameLabelStyle
}

export interface NameLabelParams {
  isCandle: boolean
  styles: Styles
  symbol: Nullable<SymbolInfo>
  dataList: KLineData[]
  indicators: Indicator[]
  /** `indicator` is given for an indicator's label, so a rebased one can be scaled to where it is drawn. */
  convertToNicePixel: (value: number, indicator?: Indicator) => number
}

function lastPriceColor (styles: CandleLastPriceMarkStyle, dataList: KLineData[]): string {
  const { close, open } = dataList[dataList.length - 1]
  const comparePrice = styles.compareRule === 'current_open' ? open : (dataList[dataList.length - 2]?.close ?? close)
  if (close > comparePrice) {
    return styles.upColor
  }
  return close < comparePrice ? styles.downColor : styles.noChangeColor
}

export function collectNameLabels ({ isCandle, styles, symbol, dataList, indicators, convertToNicePixel }: NameLabelParams): NameLabel[] {
  const labels: NameLabel[] = []
  const lastData = dataList[dataList.length - 1]
  const lastStyles = styles.candle.priceMark.last
  if (isCandle && styles.candle.priceMark.show && lastStyles.nameLabel.show && isValid(lastData)) {
    const name = isString(symbol?.ticker) ? symbol.ticker : symbol?.name
    if (isString(name) && name !== '') {
      labels.push({
        text: name,
        y: convertToNicePixel(lastData.close),
        color: lastPriceColor(lastStyles, dataList),
        style: lastStyles.nameLabel
      })
    }
  }
  const indicatorStyles = styles.indicator
  if (indicatorStyles.lastValueMark.nameLabel.show && isValid(lastData)) {
    const dataIndex = dataList.length - 1
    indicators.forEach(indicator => {
      const data = indicator.result[dataIndex] as Nullable<Record<string, unknown>>
      if (!isValid(data) || !indicator.visible) {
        return
      }
      let done = false
      eachFigures(indicator, dataIndex, indicatorStyles, (figure: IndicatorFigure, figureStyles: Required<IndicatorFigureStyle>) => {
        if (done) {
          return
        }
        done = true
        const value = data[figure.key]
        if (isNumber(value)) {
          labels.push({
            text: indicator.shortName,
            y: convertToNicePixel(value, indicator),
            color: figureStyles.color,
            style: indicatorStyles.lastValueMark.nameLabel
          })
        }
      })
    })
  }
  return labels
}

export default class NameLabelView extends View<YAxis> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    const paneIndicators = chartStore.getIndicatorsByPaneId(pane.getId())
    const primary = pane.getAxisComponent()
    this.drawLabels(ctx, primary, paneIndicators.filter(indicator => isBoundToAxis(indicator, false)), true)
    const secondary = pane.getSecondaryYAxis()
    if (secondary !== null) {
      this.drawLabels(ctx, secondary, paneIndicators.filter(indicator => isBoundToAxis(indicator, true)), false)
    }
  }

  private drawLabels (ctx: CanvasRenderingContext2D, yAxis: YAxis, indicators: Indicator[], isPrimary: boolean): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    const labels = collectNameLabels({
      isCandle: isPrimary && yAxis.isInCandle(),
      styles: chartStore.getStyles(),
      symbol: chartStore.getSymbol(),
      dataList: chartStore.getDataList(true),
      indicators,
      convertToNicePixel: (value, indicator) => yAxis.convertToNicePixel(
        isValid(indicator) && isRebased(indicator, pane.getId()) ? value * getRebaseFactor(chart, indicator) : value
      )
    })
    if (labels.length === 0) {
      return
    }
    // An inside axis overlays the main widget, so the tag sits clear of it.
    const axisWidth = yAxis.inside ? ((isPrimary ? pane.getYAxisWidget() : pane.getSecondaryYAxisWidget())?.getBounding().width ?? 0) : 0
    const onRight = yAxis.position === 'right'
    const x = onRight ? bounding.width - axisWidth : axisWidth
    labels.forEach(({ text, y, color, style }) => {
      const { paddingLeft, paddingRight, paddingTop, paddingBottom, size, family, weight } = style
      this.createFigure({
        name: 'text',
        attrs: {
          x,
          y,
          width: paddingLeft + calcTextWidth(text, size, weight, family) + paddingRight,
          height: paddingTop + size + paddingBottom,
          text,
          align: onRight ? 'right' : 'left',
          baseline: 'middle'
        },
        styles: { ...style, backgroundColor: color }
      })?.draw(ctx)
    })
  }
}
