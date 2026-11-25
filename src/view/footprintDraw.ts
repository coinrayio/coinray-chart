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

/**
 * Drawing the footprint chart type: per-bar bid x ask (or delta, or
 * histogram) cells beside a thin body. Opt-in: `CandleBarView` reaches it only
 * through `footprintRegistry.ts`, filled by `enableFootprint()`, so a bundle
 * that never calls that draws `footprint` as solid candles and leaves this
 * file out.
 */
import type BarSpace from '../common/BarSpace'
import type { CandleFootprintStyle, RectStyle } from '../common/Styles'
import { type FootprintBarData, type FootprintLayout, footprintImbalances, footprintLayout, footprintValueArea, formatFootprintVolume } from '../common/Footprint'
import { createFont } from '../common/utils/canvas'
import type { FigureCreate } from '../component/Figure'
import type { RectAttrs } from '../extension/figure/rect'
import type { YAxis } from '../component/YAxis'
import { registerFootprintDrawer, type FootprintFrame } from './footprintRegistry'

function createFootprintBody (x: number, priceY: number[], barSpace: BarSpace, layout: FootprintLayout, colors: string[]): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
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

function drawFootprintCells (
  ctx: CanvasRenderingContext2D,
  yAxis: YAxis,
  x: number,
  barSpace: BarSpace,
  layout: FootprintLayout,
  data: FootprintBarData,
  frame: FootprintFrame
): void {
  if (layout.mode === 'histogram') {
    drawFootprintHistogram(ctx, yAxis, x, barSpace, layout, data, frame.style)
    return
  }
  const { style, maxCell, maxDelta } = frame
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
function drawFootprintHistogram (
  ctx: CanvasRenderingContext2D,
  yAxis: YAxis,
  x: number,
  barSpace: BarSpace,
  layout: FootprintLayout,
  data: FootprintBarData,
  style: CandleFootprintStyle
): void {
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

/**
 * Draw one bar's footprint cells on `ctx` and return its body (wick and thin
 * candle strip) for the caller's rect batch.
 */
function drawFootprintBar (
  ctx: CanvasRenderingContext2D,
  yAxis: YAxis,
  x: number,
  priceY: number[],
  barSpace: BarSpace,
  data: FootprintBarData,
  frame: FootprintFrame,
  colors: string[]
): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
  const layout = footprintLayout(barSpace.gapBar, frame.style.variant)
  drawFootprintCells(ctx, yAxis, x, barSpace, layout, data, frame)
  return createFootprintBody(x, priceY, barSpace, layout, colors)
}

/** Let the `footprint` chart type draw its cells (charts draw it as solid candles until then). */
export function enableFootprint (): void {
  registerFootprintDrawer(drawFootprintBar)
}
