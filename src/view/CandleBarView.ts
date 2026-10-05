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
import type { VisibleRangeData } from '../common/Data'
import type BarSpace from '../common/BarSpace'
import { isValid } from '../common/utils/typeChecks'
import type { EventHandler } from '../common/EventHandler'
import type { CandleType, CandleLineSeriesType, CandleBarColor, CandleFootprintStyle, RectStyle } from '../common/Styles'
import { type FootprintBarData, footprintImbalances, formatFootprintVolume } from '../common/Footprint'
import { createFont } from '../common/utils/canvas'

import type { FigureCreate } from '../component/Figure'
import type { RectAttrs } from '../extension/figure/rect'

import ChildrenView from './ChildrenView'

import { PaneIdConstants } from '../pane/types'

export interface CandleBarOptions {
  type: Exclude<CandleType, 'area' | CandleLineSeriesType>
  styles: CandleBarColor
}

export default class CandleBarView extends ChildrenView {
  private readonly _boundCandleBarClickEvent = (data: VisibleRangeData) => () => {
    this.getWidget().getPane().getChart().getChartStore().executeAction('onCandleBarClick', data)
    return false
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const pane = this.getWidget().getPane()
    const isMain = pane.getId() === PaneIdConstants.CANDLE
    const chartStore = pane.getChart().getChartStore()
    const candleBarOptions = this.getCandleBarOptions()
    if (candleBarOptions !== null) {
      const { type, styles } = candleBarOptions
      let ohlcSize = 0
      let halfOhlcSize = 0
      if (candleBarOptions.type === 'ohlc') {
        const { gapBar } = chartStore.getBarSpace()
        ohlcSize = Math.min(Math.max(Math.round(gapBar * 0.2), 1), 8)
        if (ohlcSize > 2 && ohlcSize % 2 === 1) {
          ohlcSize--
        }
        halfOhlcSize = Math.floor(ohlcSize / 2)
      }
      const yAxis = pane.getAxisComponent()
      const boundingHeight = this.getWidget().getBounding().height

      // Footprint: per-bar cells where the host has data and bars are wide
      // enough to read; every other bar, and every bar below the width
      // threshold, is a solid candle.
      let footprint: Nullable<{ style: CandleFootprintStyle, maxCell: number }> = null
      if (type === 'footprint') {
        const style = pane.getChart().getStyles().candle.footprint
        if (isMain && chartStore.getBarSpace().gapBar >= style.minBarWidth) {
          let maxCell = 0
          chartStore.getVisibleRangeDataList().forEach(({ data: { current } }) => {
            if (!isValid(current)) return
            chartStore.getFootprint(current)?.rows.forEach(([, bid, ask]) => {
              maxCell = Math.max(maxCell, bid, ask)
            })
          })
          footprint = { style, maxCell }
        }
      }

      this.eachChildren((visibleData, barSpace) => {
        const { x, data: { current, prev } } = visibleData
        if (isValid(current)) {
          const { open, high, low, close } = current
          // These two types have no open/close body, so direction comes from the previous close.
          const comparePrice = type === 'column' || type === 'high_low'
            ? (prev?.close ?? open)
            : styles.compareRule === 'current_open' ? open : (prev?.close ?? close)
          const colors: string[] = []
          if (close > comparePrice) {
            colors[0] = styles.upColor
            colors[1] = styles.upBorderColor
            colors[2] = styles.upWickColor
          } else if (close < comparePrice) {
            colors[0] = styles.downColor
            colors[1] = styles.downBorderColor
            colors[2] = styles.downWickColor
          } else {
            colors[0] = styles.noChangeColor
            colors[1] = styles.noChangeBorderColor
            colors[2] = styles.noChangeWickColor
          }
          const barColor = isMain ? chartStore.getBarColor(current) : null
          if (barColor !== null) colors.fill(barColor, 0, 3)
          const openY = yAxis.convertToPixel(open)
          const closeY = yAxis.convertToPixel(close)
          const priceY = [
            openY, closeY,
            yAxis.convertToPixel(high),
            yAxis.convertToPixel(low)
          ]
          priceY.sort((a, b) => a - b)

          // Body and wick widths already share a parity (Store), so nothing to correct.
          const correction = 0
          let rects: Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> = []
          const footprintData = footprint !== null ? chartStore.getFootprint(current) : null
          if (footprint !== null && footprintData !== null && footprintData.rows.length > 0) {
            this._drawFootprint(ctx, x, barSpace, footprintData, footprint.style, footprint.maxCell)
            rects = this._createFootprintBody(x, priceY, barSpace, colors)
          } else {
            switch (type) {
              case 'footprint':
              case 'candle_solid':
              case 'heikin_ashi': {
                rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
                break
              }
              case 'candle_stroke': {
                rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
                break
              }
              case 'candle_up_stroke': {
                if (close > open) {
                  rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
                } else {
                  rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
                }
                break
              }
              case 'candle_down_stroke': {
                if (open > close) {
                  rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
                } else {
                  rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
                }
                break
              }
              case 'column': {
                rects = [{
                  name: 'rect',
                  attrs: {
                    x: x - barSpace.halfGapBar,
                    y: closeY,
                    width: barSpace.gapBar + correction,
                    height: Math.max(1, boundingHeight - closeY)
                  },
                  styles: { color: colors[0] }
                }]
                break
              }
              case 'high_low': {
                rects = [{
                  name: 'rect',
                  attrs: {
                    x: x - barSpace.halfGapBar,
                    y: priceY[0],
                    width: barSpace.gapBar + correction,
                    height: Math.max(1, priceY[3] - priceY[0])
                  },
                  styles: { color: colors[0] }
                }]
                break
              }
              case 'ohlc': {
                rects = [
                  {
                    name: 'rect',
                    attrs: [
                      {
                        x: x - halfOhlcSize,
                        y: priceY[0],
                        width: ohlcSize,
                        height: priceY[3] - priceY[0]
                      },
                      {
                        x: x - barSpace.halfGapBar,
                        y: openY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : openY,
                        width: barSpace.halfGapBar - halfOhlcSize,
                        height: ohlcSize
                      },
                      {
                        x: x + halfOhlcSize,
                        y: closeY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : closeY,
                        width: barSpace.halfGapBar - halfOhlcSize,
                        height: ohlcSize
                      }
                    ],
                    styles: { color: colors[0] }
                  }
                ]
                break
              }
            }
          }
          rects.forEach(rect => {
            let handler: Nullable<EventHandler> = null
            if (isMain) {
              handler = {
                mouseClickEvent: this._boundCandleBarClickEvent(visibleData)
              }
            }
            this.createFigure(rect, handler ?? undefined)?.draw(ctx)
          })
        }
      }, true)
    }
  }

  protected getCandleBarOptions (): Nullable<CandleBarOptions> {
    const candleStyles = this.getWidget().getPane().getChart().getStyles().candle
    return {
      type: candleStyles.type as CandleBarOptions['type'],
      styles: candleStyles.bar
    }
  }

  /** Left edge and width of the thin OHLC body a footprint bar keeps. */
  private _footprintBodyWidth (barSpace: BarSpace): number {
    return Math.max(3, Math.round(barSpace.gapBar * 0.08))
  }

  private _createFootprintBody (x: number, priceY: number[], barSpace: BarSpace, colors: string[]): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    const left = x - barSpace.halfGapBar
    const width = this._footprintBodyWidth(barSpace)
    const wickX = left + Math.floor(width / 2)
    return [
      {
        name: 'rect',
        attrs: { x: wickX, y: priceY[0], width: 1, height: priceY[3] - priceY[0] },
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: { x: left, y: priceY[1], width, height: Math.max(1, priceY[2] - priceY[1]) },
        styles: { color: colors[0] }
      }
    ]
  }

  private _drawFootprint (
    ctx: CanvasRenderingContext2D,
    x: number,
    barSpace: BarSpace,
    data: FootprintBarData,
    style: CandleFootprintStyle,
    maxCell: number
  ): void {
    const yAxis = this.getWidget().getPane().getAxisComponent()
    const bodyWidth = this._footprintBodyWidth(barSpace)
    const gap = 2
    const left = x - barSpace.halfGapBar + bodyWidth + gap
    const columnWidth = Math.max(1, Math.floor((barSpace.gapBar - bodyWidth - gap) / 2))
    const { rowSize, rows, poc } = data
    const imbalances = footprintImbalances(rows, rowSize, style.imbalanceRatio)
    const font = createFont(style.textSize, 'normal', style.textFamily)
    const boldFont = createFont(style.textSize, 'bold', style.textFamily)

    ctx.save()
    // Earlier figures (dashed grid, price lines) can leave a dash pattern set.
    ctx.setLineDash([])
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    rows.forEach(([price, bid, ask], i) => {
      const top = Math.round(yAxis.convertToPixel(price + rowSize))
      const bottom = Math.round(yAxis.convertToPixel(price))
      const height = Math.max(1, bottom - top)
      const cells: Array<[number, number, string, boolean, string]> = [
        [left, bid, style.bidColor, imbalances.bid.has(i), style.imbalanceBidColor],
        [left + columnWidth, ask, style.askColor, imbalances.ask.has(i), style.imbalanceAskColor]
      ]
      cells.forEach(([cellX, volume, color, imbalance, imbalanceColor]) => {
        if (volume > 0) {
          ctx.globalAlpha = maxCell > 0 ? 0.12 + 0.68 * (volume / maxCell) : 0.12
          ctx.fillStyle = color
          ctx.fillRect(cellX, top, columnWidth - 1, height - 1)
          ctx.globalAlpha = 1
        }
        if (imbalance) {
          ctx.strokeStyle = imbalanceColor
          ctx.lineWidth = 1
          ctx.strokeRect(cellX + 0.5, top + 0.5, columnWidth - 2, height - 2)
        }
        if (style.showNumbers && height >= style.textSize + 2) {
          ctx.font = imbalance ? boldFont : font
          ctx.fillStyle = imbalance ? imbalanceColor : style.textColor
          ctx.fillText(formatFootprintVolume(volume), cellX + columnWidth / 2, top + height / 2, columnWidth - 2)
        }
      })
      if (poc !== null && Math.abs(price - poc) < rowSize / 2) {
        ctx.strokeStyle = style.pocColor
        ctx.lineWidth = 1
        ctx.strokeRect(left + 0.5, top + 0.5, columnWidth * 2 - 2, height - 2)
      }
    })
    ctx.restore()
  }

  private _createSolidBar (x: number, priceY: number[], barSpace: BarSpace, colors: string[], correction: number): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    return [
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfWick,
          y: priceY[0],
          width: barSpace.wick,
          height: priceY[3] - priceY[0]
        },
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfGapBar,
          y: priceY[1],
          width: barSpace.gapBar + correction,
          height: Math.max(1, priceY[2] - priceY[1])
        },
        styles: {
          style: 'stroke_fill',
          color: colors[0],
          borderColor: colors[1]
        }
      }
    ]
  }

  private _createStrokeBar (x: number, priceY: number[], barSpace: BarSpace, colors: string[], correction: number): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    return [
      {
        name: 'rect',
        attrs: [
          {
            x: x - barSpace.halfWick,
            y: priceY[0],
            width: barSpace.wick,
            height: priceY[1] - priceY[0]
          },
          {
            x: x - barSpace.halfWick,
            y: priceY[2],
            width: barSpace.wick,
            height: priceY[3] - priceY[2]
          }
        ],
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfGapBar,
          y: priceY[1],
          width: barSpace.gapBar + correction,
          height: Math.max(1, priceY[2] - priceY[1])
        },
        styles: {
          style: 'stroke',
          borderColor: colors[1]
        }
      }
    ]
  }
}
