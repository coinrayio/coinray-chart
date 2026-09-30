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

import type Coordinate from '../common/Coordinate'
import { isNumber } from '../common/utils/typeChecks'

import ChildrenView from './ChildrenView'

interface CloseBar {
  x: number
  closeY: number
  highY: number
  lowY: number
}

export default class CandleLineView extends ChildrenView {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const bounding = widget.getBounding()
    const yAxis = pane.getAxisComponent()
    const styles = chart.getStyles().candle
    const bars: CloseBar[] = []
    this.eachChildren((data) => {
      const kLineData = data.data.current
      if (isNumber(kLineData?.close)) {
        bars.push({
          x: data.x,
          closeY: yAxis.convertToPixel(kLineData.close),
          highY: yAxis.convertToPixel(kLineData.high),
          lowY: yAxis.convertToPixel(kLineData.low)
        })
      }
    })
    if (bars.length === 0) {
      return
    }
    const closes = bars.map(({ x, closeY }) => ({ x, y: closeY }))

    switch (styles.type) {
      case 'line': {
        this._drawLine(ctx, closes, styles.line.color, styles.line.size)
        break
      }
      case 'line_markers': {
        this._drawLine(ctx, closes, styles.line.color, styles.line.size)
        closes.forEach(({ x, y }) => {
          this.createFigure({
            name: 'circle',
            attrs: { x, y, r: styles.line.markerRadius },
            styles: { style: 'fill', color: styles.line.color }
          })?.draw(ctx)
        })
        break
      }
      case 'step_line': {
        const steps: Coordinate[] = []
        closes.forEach((point, i) => {
          steps.push(point)
          if (i + 1 < closes.length) {
            steps.push({ x: closes[i + 1].x, y: point.y })
          }
        })
        this._drawLine(ctx, steps, styles.line.color, styles.line.size)
        break
      }
      case 'hlc_area': {
        const s = styles.hlcArea
        const highs = bars.map(({ x, highY }) => ({ x, y: highY }))
        const lows = bars.map(({ x, lowY }) => ({ x, y: lowY }))
        this._fillBetween(ctx, highs, closes, s.upFillColor)
        this._fillBetween(ctx, closes, lows, s.downFillColor)
        this._drawLine(ctx, highs, s.highLineColor, s.lineSize)
        this._drawLine(ctx, lows, s.lowLineColor, s.lineSize)
        this._drawLine(ctx, closes, s.closeLineColor, s.lineSize)
        break
      }
      case 'baseline': {
        const s = styles.baseline
        // realFrom/realTo are prices, so the base level stays a price on log axes too.
        const { realFrom, realTo } = yAxis.getRange()
        const baseY = yAxis.convertToPixel(realFrom + (realTo - realFrom) * s.level / 100)
        const flat = closes.map(({ x }) => ({ x, y: baseY }))
        // A reversed axis puts higher prices at larger pixel y, so the colours swap sides.
        const aboveIsUp = yAxis.convertToPixel(realTo) <= yAxis.convertToPixel(realFrom)
        const above: [number, number] = aboveIsUp ? [0, baseY] : [baseY, bounding.height]
        const below: [number, number] = aboveIsUp ? [baseY, bounding.height] : [0, baseY]
        const regions: Array<[number, number, string, string]> = [
          [...above, s.topFillColor, s.topLineColor],
          [...below, s.bottomFillColor, s.bottomLineColor]
        ]
        regions.forEach(([top, bottom, fillColor, lineColor]) => {
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, Math.min(top, bottom), bounding.width, Math.abs(bottom - top))
          ctx.clip()
          this._fillBetween(ctx, closes, flat, fillColor)
          this._drawLine(ctx, closes, lineColor, s.lineSize)
          ctx.restore()
        })
        break
      }
      default:
        break
    }
  }

  private _drawLine (ctx: CanvasRenderingContext2D, coordinates: Coordinate[], color: string, size: number): void {
    this.createFigure({
      name: 'line',
      attrs: { coordinates },
      styles: { color, size }
    })?.draw(ctx)
  }

  private _fillBetween (ctx: CanvasRenderingContext2D, first: Coordinate[], second: Coordinate[], color: string): void {
    this.createFigure({
      name: 'polygon',
      attrs: { coordinates: [...first, ...second.slice().reverse()] },
      styles: { style: 'fill', color }
    })?.draw(ctx)
  }
}
