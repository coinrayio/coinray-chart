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

import { figureStyleAt, getFigureDefaults, getRebaseFactor, isRebased, type IndicatorFigureStyle } from '../component/Indicator'
import type { RectAttrs } from '../extension/figure/rect'
import RectBatch from '../common/RectBatch'

import type { YAxis } from '../component/YAxis'
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
    const primaryAxis = pane.getAxisComponent()
    const secondaryAxis = pane.getSecondaryYAxis()
    const chartStore = chart.getChartStore()
    const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
    const defaultStyles = chartStore.getStyles().indicator
    ctx.save()
    indicators.forEach(indicator => {
      // An indicator bound to the secondary axis has nothing to draw against
      // until the pane has built it.
      const yAxis = indicator.yAxis === 'secondary' ? secondaryAxis : primaryAxis
      if (indicator.visible && yAxis !== null) {
        const factor = isRebased(indicator, pane.getId()) ? getRebaseFactor(chart, indicator) : 1
        const toPixel = (value: number): number => yAxis.convertToPixel(value * factor)
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
            yAxis: factor === 1 ? yAxis : rebasedAxis(yAxis, factor)
          })
          ctx.restore()
        }
        // A custom-drawn indicator can leave its figures empty (volume does);
        // then there is nothing for the per-bar pass to do.
        const figureDefaults = isCover ? [] : getFigureDefaults(indicator, defaultStyles)
        if (figureDefaults.length > 0) {
          const result = indicator.result
          const visibleBars = chartStore.getVisibleRangeDataList()
          const barSpace = chartStore.getBarSpace()
          const { bar, halfGapBar } = barSpace

          // A bar's `next` is the following bar's `current` and the one after's
          // `prev`, so each bar's pixel coordinates are converted once and
          // shared. Bars are visited in ascending order and the first lookup is
          // the first bar's own, so an array offset from it covers every lookup.
          // Indexed loops: the engine compiles to ES5, where `for…of` and
          // `forEach` closures cost per bar.
          const keys = indicator.figures.map(f => f.key)
          type BarCoordinate = Record<string, number> & { x: number }
          const coordinates: Array<BarCoordinate | undefined> = []
          let base = NaN
          const coordinateAt = (dataIndex: number): BarCoordinate => {
            if (Number.isNaN(base)) base = dataIndex
            let coordinate = coordinates[dataIndex - base]
            if (coordinate === undefined) {
              coordinate = { x: xAxis.convertToPixel(dataIndex) }
              const values = result[dataIndex] as Nullable<Record<string, unknown>>
              if (isValid(values)) {
                // eslint-disable-next-line @typescript-eslint/prefer-for-of -- ES5 target, see above
                for (let k = 0; k < keys.length; k++) {
                  const value = values[keys[k]]
                  if (isNumber(value)) {
                    coordinate[keys[k]] = toPixel(value)
                  }
                }
              }
              if (dataIndex >= base) coordinates[dataIndex - base] = coordinate
            }
            return coordinate
          }

          // Circles and bars, bar by bar and figure by figure as they have always
          // been drawn, so overlapping shapes stack the same way. Plain filled
          // bars (histograms) paint per colour at the end; anything with a
          // border, a radius or a gradient still draws as a figure.
          const shapes: number[] = []
          const lineFigures: number[] = []
          figureDefaults.forEach(({ figure }, position) => {
            if (figure.type === 'line') lineFigures.push(position)
            else if (figure.type === 'circle' || figure.type === 'bar' || figure.type === 'rect') shapes.push(position)
          })
          const bars = new RectBatch()
          if (shapes.length > 0) {
            // eslint-disable-next-line @typescript-eslint/prefer-for-of -- ES5 target, see above
            for (let v = 0; v < visibleBars.length; v++) {
              const { dataIndex, x } = visibleBars[v]
              const currentData = result[dataIndex] as Nullable<Record<string, unknown>>
              if (!isValid(currentData)) continue
              const currentCoordinate = coordinateAt(dataIndex)
              // eslint-disable-next-line @typescript-eslint/prefer-for-of -- ES5 target, see above
              for (let f = 0; f < shapes.length; f++) {
                const position = shapes[f]
                const { figure, index: figureIndex } = figureDefaults[position]
                const value = currentData[figure.key]
                if (!isValid(value)) continue
                const figureStyles = figureStyleAt(indicator, figureDefaults, position, dataIndex, defaultStyles)
                const valueY = currentCoordinate[figure.key]
                if (figure.type === 'circle') {
                  this.createFigure({
                    name: 'circle',
                    attrs: { x, y: valueY, r: Math.max(1, halfGapBar) },
                    styles: figureStyles
                  })?.draw(ctx)
                  continue
                }
                const baseValueY = isNumber(figure.baseValue) ? toPixel(figure.baseValue) : yAxis.convertToPixel(yAxis.getRange().from)
                const baseValue = figure.baseValue ?? yAxis.getRange().from
                let height = Math.abs(baseValueY - valueY)
                if (baseValue !== value) {
                  height = Math.max(1, height)
                }
                const y = valueY > baseValueY ? baseValueY : valueY
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
                const rect: RectAttrs = { x: x - Math.floor(columnWidth / 2), y, width: columnWidth, height }
                if (figure.type === 'bar' && isPlainFill(figureStyles)) {
                  bars.fill(figureIndex, figureStyles.color as string, rect)
                } else {
                  this.createFigure({ name: 'rect', attrs: rect, styles: figureStyles })?.draw(ctx)
                }
              }
            }
          }
          bars.draw(ctx)

          // Lines, figure by figure, after everything else. A segment that
          // continues the previous one in the same style extends it into one
          // polyline; a line of a single segment isn't drawn.
          // eslint-disable-next-line @typescript-eslint/prefer-for-of -- ES5 target, see above
          for (let f = 0; f < lineFigures.length; f++) {
            const position = lineFigures[f]
            const key = figureDefaults[position].figure.key
            const polylines: Array<{ coordinates: Coordinate[], styles: Partial<SmoothLineStyle> }> = []
            let segments = 0
            // eslint-disable-next-line @typescript-eslint/prefer-for-of -- ES5 target, see above
            for (let v = 0; v < visibleBars.length; v++) {
              const { dataIndex } = visibleBars[v]
              const currentData = result[dataIndex] as Nullable<Record<string, unknown>>
              if (!isValid(currentData?.[key])) continue
              const current = coordinateAt(dataIndex)
              const next = coordinateAt(dataIndex + 1)
              const fromY = current[key]
              const toY = next[key]
              if (!isNumber(fromY) || !isNumber(toY)) continue
              const styles = figureStyleAt(indicator, figureDefaults, position, dataIndex, defaultStyles) as unknown as SmoothLineStyle
              const last = polylines[polylines.length - 1] as typeof polylines[number] | undefined
              const end = last?.coordinates[last.coordinates.length - 1]
              if (last !== undefined && end?.x === current.x && end.y === fromY && isSameLineStyle(last.styles, styles)) {
                last.coordinates.push({ x: next.x, y: toY })
              } else {
                polylines.push({ coordinates: [{ x: current.x, y: fromY }, { x: next.x, y: toY }], styles })
              }
              segments++
            }
            if (segments > 1) {
              polylines.forEach(({ coordinates, styles }) => {
                this.createFigure({
                  name: 'line',
                  attrs: { coordinates },
                  styles
                })?.draw(ctx)
              })
            }
          }
        }
      }
    })
    ctx.restore()
  }
}

/**
 * `yAxis` as a custom `draw` should see it for a rebased indicator: values the
 * indicator knows convert to the pixel they are drawn at, and back.
 */
function rebasedAxis (yAxis: YAxis, factor: number): YAxis {
  const axis = Object.create(yAxis) as YAxis
  axis.convertToPixel = value => yAxis.convertToPixel(value * factor)
  axis.convertFromPixel = pixel => yAxis.convertFromPixel(pixel) / factor
  axis.convertToNicePixel = value => yAxis.convertToNicePixel(value * factor)
  return axis
}

function isSameLineStyle (a: Partial<SmoothLineStyle>, b: Partial<SmoothLineStyle>): boolean {
  return a.style === b.style &&
    a.color === b.color &&
    a.size === b.size &&
    a.smooth === b.smooth &&
    a.dashedValue?.[0] === b.dashedValue?.[0] &&
    a.dashedValue?.[1] === b.dashedValue?.[1]
}
