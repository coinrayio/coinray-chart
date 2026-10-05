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
import type { CandleColorCompareRule, SmoothLineStyle } from '../common/Styles'
import { formatValue } from '../common/utils/format'
import { isNumber, isString, isValid } from '../common/utils/typeChecks'
import type Coordinate from '../common/Coordinate'

import { eachFigures, getFigureDefaults, type IndicatorFigure, type IndicatorFigureAttrs, type IndicatorFigureStyle } from '../component/Indicator'
import type { RectAttrs } from '../extension/figure/rect'
import RectBatch from '../common/RectBatch'

import CandleBarView, { type CandleBarOptions } from './CandleBarView'

/** A bar `RectBatch` paints exactly as `drawRect` would: a solid colour fill, square corners. */
function isPlainFill (styles: IndicatorFigureStyle): boolean {
  return (styles.style ?? 'fill') === 'fill' && isString(styles.color) && (styles.borderRadius === undefined || styles.borderRadius === 0)
}

export default class IndicatorView extends CandleBarView {
  override getCandleBarOptions (): Nullable<CandleBarOptions> {
    const pane = this.getWidget().getPane()
    const yAxis = pane.getAxisComponent()
    if (!yAxis.isInCandle()) {
      const chartStore = pane.getChart().getChartStore()
      const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
      for (const indicator of indicators) {
        if (indicator.shouldOhlc && indicator.visible) {
          const indicatorStyles = indicator.styles
          const defaultStyles = chartStore.getStyles().indicator
          const compareRule = formatValue(indicatorStyles, 'ohlc.compareRule', defaultStyles.ohlc.compareRule) as CandleColorCompareRule
          const upColor = formatValue(indicatorStyles, 'ohlc.upColor', defaultStyles.ohlc.upColor) as string
          const downColor = formatValue(indicatorStyles, 'ohlc.downColor', defaultStyles.ohlc.downColor) as string
          const noChangeColor = formatValue(indicatorStyles, 'ohlc.noChangeColor', defaultStyles.ohlc.noChangeColor) as string
          return {
            type: 'ohlc',
            styles: {
              compareRule,
              upColor,
              downColor,
              noChangeColor,
              upBorderColor: upColor,
              downBorderColor: downColor,
              noChangeBorderColor: noChangeColor,
              upWickColor: upColor,
              downWickColor: downColor,
              noChangeWickColor: noChangeColor
            }
          }
        }
      }
    }
    return null
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    super.drawImp(ctx)
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const bounding = widget.getBounding()
    const xAxis = chart.getXAxisPane().getAxisComponent()
    const yAxis = pane.getAxisComponent()
    const chartStore = chart.getChartStore()
    const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
    const defaultStyles = chartStore.getStyles().indicator
    ctx.save()
    indicators.forEach(indicator => {
      if (indicator.visible) {
        if (indicator.zLevel < 0) {
          ctx.globalCompositeOperation = 'destination-over'
        } else {
          ctx.globalCompositeOperation = 'source-over'
        }
        let isCover = false
        if (indicator.draw !== null) {
          ctx.save()
          isCover = indicator.draw({
            ctx,
            chart,
            indicator,
            bounding,
            xAxis,
            yAxis
          })
          ctx.restore()
        }
        // A custom-drawn indicator can leave its figures empty (volume does);
        // then there is nothing for the per-bar pass to do.
        const figureDefaults = isCover ? [] : getFigureDefaults(indicator, defaultStyles)
        if (figureDefaults.length > 0) {
          const result = indicator.result
          const lines: Array<Array<{ coordinates: Coordinate[], styles: Partial<SmoothLineStyle> }>> = []
          // Plain filled bars (histograms) paint per colour at the end; anything
          // with a border, a radius or a gradient still draws as a figure.
          const bars = new RectBatch()

          this.eachChildren((data, barSpace) => {
            const { bar, halfGapBar } = barSpace
            const { dataIndex, x } = data
            const prevX = xAxis.convertToPixel(dataIndex - 1)
            const nextX = xAxis.convertToPixel(dataIndex + 1)
            const prevData = result[dataIndex - 1] ?? null
            const currentData = result[dataIndex] ?? null
            const nextData = result[dataIndex + 1] ?? null
            const prevCoordinate = { x: prevX }
            const currentCoordinate = { x }
            const nextCoordinate = { x: nextX }
            indicator.figures.forEach(({ key }) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
              const prevValue = prevData?.[key]
              if (isNumber(prevValue)) {
                prevCoordinate[key] = yAxis.convertToPixel(prevValue)
              }
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
              const currentValue = currentData?.[key]
              if (isNumber(currentValue)) {
                currentCoordinate[key] = yAxis.convertToPixel(currentValue)
              }
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
              const nextValue = nextData?.[key]
              if (isNumber(nextValue)) {
                nextCoordinate[key] = yAxis.convertToPixel(nextValue)
              }
            })
            eachFigures(indicator, dataIndex, defaultStyles, (figure: IndicatorFigure, figureStyles: IndicatorFigureStyle, figureIndex: number) => {
              if (isValid(currentData?.[figure.key])) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                const valueY = currentCoordinate[figure.key]
                let attrs = figure.attrs?.({
                  data: { prev: prevData, current: currentData, next: nextData },
                  coordinate: { prev: prevCoordinate, current: currentCoordinate, next: nextCoordinate },
                  bounding,
                  barSpace,
                  xAxis,
                  yAxis
                })
                if (!isValid<IndicatorFigureAttrs>(attrs)) {
                  switch (figure.type) {
                    case 'circle': {
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                      attrs = { x, y: valueY, r: Math.max(1, halfGapBar) }
                      break
                    }
                    case 'rect':
                    case 'bar': {
                      const baseValue = figure.baseValue ?? yAxis.getRange().from
                      const baseValueY = yAxis.convertToPixel(baseValue)
                      let height = Math.abs(baseValueY - (valueY as number))
                      if (baseValue !== currentData?.[figure.key]) {
                        height = Math.max(1, height)
                      }
                      let y = 0
                      if (valueY > baseValueY) {
                        y = baseValueY
                      } else {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                        y = valueY
                      }
                      // Column plots take a FIXED 1px separator, not the
                      // candle's proportional gap. A histogram is read as a
                      // band — a colour ribbon like Chop Zone carries its whole
                      // meaning in adjacent columns touching — where a candle
                      // is read as a discrete mark and wants air around it.
                      // Measured against TradingView / Altrady: their gap is
                      // 1px at every bar spacing, ~85% duty, while borrowing
                      // `halfGapBar * 2` here gave 60% at a 10px bar space.
                      // That also loses a pixel to the floor, so a column came
                      // out narrower than the candle above it and, being
                      // always even, could never line up with one.
                      const columnWidth = Math.max(1, Math.round(bar) - 1)
                      attrs = {
                        x: x - Math.floor(columnWidth / 2),
                        y,
                        width: columnWidth,
                        height
                      }
                      break
                    }
                    case 'line': {
                      if (!isValid(lines[figureIndex])) {
                        lines[figureIndex] = []
                      }
                      if (isNumber(currentCoordinate[figure.key]) && isNumber(nextCoordinate[figure.key])) {
                        lines[figureIndex].push({
                          coordinates: [
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                            { x: currentCoordinate.x, y: currentCoordinate[figure.key] },
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                            { x: nextCoordinate.x, y: nextCoordinate[figure.key] }
                          ],
                          styles: figureStyles as unknown as SmoothLineStyle
                        })
                      }
                      break
                    }
                    default: { break }
                  }
                }
                const type = figure.type!
                if (isValid<IndicatorFigureAttrs>(attrs) && type === 'bar' && isPlainFill(figureStyles)) {
                  const color = figureStyles.color as string
                  ;([] as RectAttrs[]).concat(attrs as RectAttrs | RectAttrs[]).forEach(r => { bars.fill(figureIndex, color, r) })
                } else if (isValid<IndicatorFigureAttrs>(attrs) && type !== 'line') {
                  this.createFigure({
                    name: type === 'bar' ? 'rect' : type,
                    attrs,
                    styles: figureStyles
                  })?.draw(ctx)
                }
              }
            }, figureDefaults)
          })
          bars.draw(ctx)

          // merge line and render
          lines.forEach(items => {
            if (items.length > 1) {
              const mergeLines = [
                {
                  coordinates: [items[0].coordinates[0], items[0].coordinates[1]],
                  styles: items[0].styles
                }
              ]
              for (let i = 1; i < items.length; i++) {
                const lastMergeLine = mergeLines[mergeLines.length - 1]
                const current = items[i]
                const lastMergeLineLastCoordinate = lastMergeLine.coordinates[lastMergeLine.coordinates.length - 1]
                if (
                  lastMergeLineLastCoordinate.x === current.coordinates[0].x &&
                  lastMergeLineLastCoordinate.y === current.coordinates[0].y &&
                  lastMergeLine.styles.style === current.styles.style &&
                  lastMergeLine.styles.color === current.styles.color &&
                  lastMergeLine.styles.size === current.styles.size &&
                  lastMergeLine.styles.smooth === current.styles.smooth &&
                  lastMergeLine.styles.dashedValue?.[0] === current.styles.dashedValue?.[0] &&
                  lastMergeLine.styles.dashedValue?.[1] === current.styles.dashedValue?.[1]
                ) {
                  lastMergeLine.coordinates.push(current.coordinates[1])
                } else {
                  mergeLines.push({
                    coordinates: [current.coordinates[0], current.coordinates[1]],
                    styles: current.styles
                  })
                }
              }
              mergeLines.forEach(({ coordinates, styles }) => {
                this.createFigure({
                  name: 'line',
                  attrs: { coordinates },
                  styles
                })?.draw(ctx)
              })
            }
          })
        }
      }
    })
    ctx.restore()
  }
}
