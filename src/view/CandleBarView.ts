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
import { isString, isValid } from '../common/utils/typeChecks'
import type { MouseTouchEvent } from '../common/EventHandler'
import RectBatch from '../common/RectBatch'
import type { CandleType, CandleLineSeriesType, CandleBarColor, CandleFootprintStyle, RectStyle } from '../common/Styles'
import { type FootprintBarData, type FootprintLayout, footprintImbalances, footprintLayout, footprintValueArea, formatFootprintVolume } from '../common/Footprint'
import { createFont } from '../common/utils/canvas'

import type { FigureCreate } from '../component/Figure'
import { checkCoordinateOnRect, type RectAttrs } from '../extension/figure/rect'

import ChildrenView from './ChildrenView'
import type DrawWidget from '../widget/DrawWidget'
import type DrawPane from '../pane/DrawPane'
import type { YAxis } from '../component/YAxis'

import { PaneIdConstants } from '../pane/types'

interface FootprintFrame {
  style: CandleFootprintStyle
  /** Largest bid or ask cell on screen. */
  maxCell: number
  /** Largest |ask - bid| row on screen. */
  maxDelta: number
}

export interface CandleBarOptions {
  type: Exclude<CandleType, 'area' | CandleLineSeriesType>
  styles: CandleBarColor
}

export default class CandleBarView extends ChildrenView {
  /**
   * The main pane's bars as drawn, for `onCandleBarClick`. Bars are painted in
   * batches rather than as one figure each, so the view hit-tests them itself
   * instead of through a child figure per bar.
   */
  private _barHits: Array<{ rects: RectAttrs[], data: VisibleRangeData }> = []
  private _clickedBar: Nullable<VisibleRangeData> = null

  constructor (widget: DrawWidget<DrawPane<YAxis>>) {
    super(widget)
    this.registerEvent('mouseClickEvent', () => {
      if (this._clickedBar !== null) {
        this.getWidget().getPane().getChart().getChartStore().executeAction('onCandleBarClick', this._clickedBar)
      }
      return false
    })
  }

  override checkEventOn (event: MouseTouchEvent): boolean {
    this._clickedBar = null
    // Last drawn first, as children were dispatched.
    for (let i = this._barHits.length - 1; i > -1; i--) {
      if (checkCoordinateOnRect(event, this._barHits[i].rects)) {
        this._clickedBar = this._barHits[i].data
        return true
      }
    }
    return false
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    this._barHits = []
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
      let footprint: Nullable<FootprintFrame> = null
      if (type === 'footprint') {
        const style = pane.getChart().getStyles().candle.footprint
        if (isMain && chartStore.getBarSpace().gapBar >= style.minBarWidth) {
          let maxCell = 0
          let maxDelta = 0
          chartStore.getVisibleRangeDataList().forEach(({ data: { current } }) => {
            if (!isValid(current)) return
            chartStore.getFootprint(current)?.rows.forEach(([, bid, ask]) => {
              maxCell = Math.max(maxCell, bid, ask)
              maxDelta = Math.max(maxDelta, Math.abs(ask - bid))
            })
          })
          footprint = { style, maxCell, maxDelta }
        }
      }

      const batch = new RectBatch()
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
            const layout = footprintLayout(barSpace.gapBar, footprint.style.variant)
            this._drawFootprint(ctx, x, barSpace, layout, footprintData, footprint)
            rects = this._createFootprintBody(x, priceY, barSpace, layout, colors)
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
          // Indexed loops, no spread or destructuring: this runs per visible
          // bar and the engine compiles to ES5, where those become helper calls.
          const hitRects: RectAttrs[] = []
          for (let layer = 0; layer < rects.length; layer++) {
            const rect = rects[layer]
            const attrs = Array.isArray(rect.attrs) ? rect.attrs : [rect.attrs]
            const styles = rect.styles
            const style = styles.style ?? 'fill'
            const color = styles.color
            const borderColor = styles.borderColor
            const fill = (style === 'fill' || style === 'stroke_fill') && isString(color)
            const stroke = (style === 'stroke' || style === 'stroke_fill') && isString(borderColor)
            // eslint-disable-next-line @typescript-eslint/prefer-for-of -- ES5 target, see above
            for (let i = 0; i < attrs.length; i++) {
              const r = attrs[i]
              const filled = fill && batch.fill(layer, color, r)
              if (stroke) {
                batch.stroke(layer, borderColor, r, filled ? color : null)
              }
              if (isMain) {
                hitRects.push(r)
              }
            }
          }
          if (isMain) {
            this._barHits.push({ rects: hitRects, data: visibleData })
          }
        }
      }, true)
      batch.draw(ctx)
    }
  }

  protected getCandleBarOptions (): Nullable<CandleBarOptions> {
    const candleStyles = this.getWidget().getPane().getChart().getStyles().candle
    return {
      type: candleStyles.type as CandleBarOptions['type'],
      styles: candleStyles.bar
    }
  }

  private _createFootprintBody (x: number, priceY: number[], barSpace: BarSpace, layout: FootprintLayout, colors: string[]): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    const left = x - barSpace.halfGapBar
    const width = layout.bodyWidth
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
    layout: FootprintLayout,
    data: FootprintBarData,
    frame: FootprintFrame
  ): void {
    if (layout.mode === 'histogram') {
      this._drawFootprintHistogram(ctx, x, barSpace, layout, data, frame.style)
      return
    }
    const { style, maxCell, maxDelta } = frame
    const yAxis = this.getWidget().getPane().getAxisComponent()
    const left = x - barSpace.halfGapBar + layout.bodyWidth + layout.gap
    const areaWidth = Math.max(1, barSpace.gapBar - layout.bodyWidth - layout.gap)
    const columnWidth = layout.mode === 'split' ? Math.max(1, Math.floor(areaWidth / 2)) : areaWidth
    const { rowSize, rows, poc } = data
    const imbalances = footprintImbalances(rows, rowSize, style.imbalanceRatio)
    const font = createFont(style.textSize, 'normal', style.textFamily)
    const boldFont = createFont(style.textSize, 'bold', style.textFamily)
    // A number is drawn only where it fits at full size, never squeezed.
    const fits = (text: string, width: number): boolean => ctx.measureText(text).width <= width - 3
    const barMax = layout.mode === 'profile' ? rows.reduce((m, [, bid, ask]) => Math.max(m, bid + ask), 0) : 0

    ctx.save()
    // Earlier figures (dashed grid, price lines) can leave a dash pattern set.
    ctx.setLineDash([])
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    rows.forEach(([price, bid, ask], i) => {
      const top = Math.round(yAxis.convertToPixel(price + rowSize))
      const bottom = Math.round(yAxis.convertToPixel(price))
      const height = Math.max(1, bottom - top)
      const tallEnough = style.showNumbers && height >= style.textSize + 2
      const inset = height > 3 ? 1 : 0

      if (layout.mode === 'split') {
        const cells: Array<[number, number, string, boolean, string]> = [
          [left, bid, style.bidColor, imbalances.bid.has(i), style.imbalanceBidColor],
          [left + columnWidth, ask, style.askColor, imbalances.ask.has(i), style.imbalanceAskColor]
        ]
        cells.forEach(([cellX, volume, color, imbalance, imbalanceColor]) => {
          if (volume > 0) {
            ctx.globalAlpha = maxCell > 0 ? 0.12 + 0.68 * (volume / maxCell) : 0.12
            ctx.fillStyle = color
            ctx.fillRect(cellX, top, Math.max(1, columnWidth - 1), height - inset)
            ctx.globalAlpha = 1
          }
          if (imbalance && columnWidth >= 6 && height >= 4) {
            ctx.strokeStyle = imbalanceColor
            ctx.lineWidth = 1
            ctx.strokeRect(cellX + 0.5, top + 0.5, columnWidth - 2, height - 2)
          }
          if (tallEnough) {
            ctx.font = imbalance ? boldFont : font
            const text = formatFootprintVolume(volume)
            if (fits(text, columnWidth)) {
              ctx.fillStyle = imbalance ? imbalanceColor : style.textColor
              ctx.fillText(text, cellX + columnWidth / 2, top + height / 2)
            }
          }
        })
      } else if (layout.mode === 'single') {
        const delta = ask - bid
        if (bid + ask > 0) {
          ctx.globalAlpha = maxDelta > 0 ? 0.15 + 0.7 * (Math.abs(delta) / maxDelta) : 0.15
          ctx.fillStyle = delta >= 0 ? style.askColor : style.bidColor
          ctx.fillRect(left, top, Math.max(1, columnWidth - 1), height - inset)
          ctx.globalAlpha = 1
        }
        if (tallEnough) {
          ctx.font = font
          const text = (delta > 0 ? '+' : '') + formatFootprintVolume(delta)
          if (fits(text, columnWidth)) {
            ctx.fillStyle = style.textColor
            ctx.fillText(text, left + columnWidth / 2, top + height / 2)
          }
        }
      } else {
        const total = bid + ask
        if (total > 0 && barMax > 0) {
          const length = Math.max(1, Math.round(areaWidth * total / barMax))
          const bidLength = Math.round(length * bid / total)
          ctx.globalAlpha = 0.75
          ctx.fillStyle = style.bidColor
          ctx.fillRect(left, top, bidLength, height - inset)
          ctx.fillStyle = style.askColor
          ctx.fillRect(left + bidLength, top, length - bidLength, height - inset)
          ctx.globalAlpha = 1
        }
        if (tallEnough) {
          ctx.font = font
          const text = formatFootprintVolume(total)
          if (fits(text, areaWidth)) {
            ctx.textAlign = 'left'
            ctx.fillStyle = style.textColor
            ctx.fillText(text, left + 2, top + height / 2)
            ctx.textAlign = 'center'
          }
        }
      }

      if (poc !== null && Math.abs(price - poc) < rowSize / 2 && height >= 3 && areaWidth >= 4) {
        ctx.strokeStyle = style.pocColor
        ctx.lineWidth = 1
        ctx.strokeRect(left + 0.5, top + 0.5, (layout.mode === 'split' ? columnWidth * 2 : areaWidth) - 2, height - 2)
      }
    })
    ctx.restore()
  }

  /** Delta histogram (green/red by sign) beside a total-volume histogram, both
   *  scaled to this bar's largest row; POC as a solid bar, value area as dashed
   *  lines that run on into the next bar. No numbers. */
  private _drawFootprintHistogram (
    ctx: CanvasRenderingContext2D,
    x: number,
    barSpace: BarSpace,
    layout: FootprintLayout,
    data: FootprintBarData,
    style: CandleFootprintStyle
  ): void {
    const yAxis = this.getWidget().getPane().getAxisComponent()
    const left = x - barSpace.halfGapBar + layout.bodyWidth + layout.gap
    const areaWidth = Math.max(2, barSpace.gapBar - layout.bodyWidth - layout.gap)
    const innerGap = areaWidth >= 20 ? 3 : 1
    const deltaWidth = Math.max(1, Math.floor((areaWidth - innerGap) * 0.45))
    const volumeLeft = left + deltaWidth + innerGap
    const volumeWidth = Math.max(1, areaWidth - deltaWidth - innerGap)
    const { rowSize, rows, poc } = data
    let barMaxDelta = 0
    let barMaxVolume = 0
    rows.forEach(([, bid, ask]) => {
      barMaxDelta = Math.max(barMaxDelta, Math.abs(ask - bid))
      barMaxVolume = Math.max(barMaxVolume, bid + ask)
    })

    ctx.save()
    ctx.setLineDash([])
    rows.forEach(([price, bid, ask]) => {
      const top = Math.round(yAxis.convertToPixel(price + rowSize))
      const bottom = Math.round(yAxis.convertToPixel(price))
      const height = Math.max(1, bottom - top - (bottom - top > 2 ? 1 : 0))
      const delta = ask - bid
      if (delta !== 0 && barMaxDelta > 0) {
        ctx.globalAlpha = 0.85
        ctx.fillStyle = delta > 0 ? style.askColor : style.bidColor
        ctx.fillRect(left, top, Math.max(1, Math.round(deltaWidth * Math.abs(delta) / barMaxDelta)), height)
      }
      const total = bid + ask
      if (total > 0 && barMaxVolume > 0) {
        const isPoc = poc !== null && Math.abs(price - poc) < rowSize / 2
        ctx.globalAlpha = isPoc ? 1 : 0.8
        ctx.fillStyle = isPoc ? style.valueAreaColor : style.volumeColor
        ctx.fillRect(volumeLeft, top, Math.max(1, Math.round(volumeWidth * total / barMaxVolume)), height)
      }
    })
    ctx.globalAlpha = 1

    const valueArea = footprintValueArea(rows, rowSize, poc)
    if (valueArea !== null) {
      ctx.strokeStyle = style.valueAreaColor
      ctx.lineWidth = 1
      ctx.setLineDash([3, 2])
      const right = x + barSpace.halfGapBar + barSpace.bar
      ;[valueArea.low, valueArea.high].forEach(price => {
        const y = Math.round(yAxis.convertToPixel(price)) + 0.5
        ctx.beginPath()
        ctx.moveTo(left, y)
        ctx.lineTo(right, y)
        ctx.stroke()
      })
    }
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
