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
import type Coordinate from '../common/Coordinate'
import { formatPrecision } from '../common/utils/format'
import { isNumber, isValid } from '../common/utils/typeChecks'
import { SymbolDefaultPrecisionConstants } from '../common/SymbolInfo'

import type { Axis } from '../component/Axis'
import type { YAxis } from '../component/YAxis'
import type { OverlayFigure, Overlay } from '../component/Overlay'
import type OverlayImp from '../component/Overlay'

import OverlayView from './OverlayView'

import type YAxisImp from '../component/YAxis'

export interface TagBox {
  key: string
  y: number
  height: number
  fixed: boolean
}

const TAG_GAP = 1

/**
 * Pushes overlapping price tags apart, by at least a label height, and returns
 * the vertical shift per tag key. Fixed tags (the last price) never move.
 *
 * Tags keep their price order: the order is taken once, from where the tags
 * want to be, and only adjacent pairs in that order are separated. Sorting
 * again as tags moved let a tag pushed off a fixed one jump past its
 * neighbour, so TP1 could end up above Break even on a long.
 */
export function stackTags (input: readonly TagBox[]): Map<string, number> {
  const shifts = new Map<string, number>()
  if (input.length < 2) return shifts
  const boxes = input
    .map((box, index) => ({ ...box, index }))
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.index - b.index))
  const originals = boxes.map(box => box.y)
  for (let iteration = 0; iteration < 50; iteration++) {
    let moved = false
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1]
      const b = boxes[i]
      const deficit = (a.height + b.height) / 2 + TAG_GAP - (b.y - a.y)
      if (deficit <= 0.01 || (a.fixed && b.fixed)) continue
      moved = true
      if (a.fixed) {
        b.y += deficit
      } else if (b.fixed) {
        a.y -= deficit
      } else {
        a.y -= deficit / 2
        b.y += deficit / 2
      }
    }
    if (!moved) break
  }
  boxes.forEach((box, i) => {
    if (box.fixed) return
    const dy = box.y - originals[i]
    if (Math.abs(dy) > 0.01) shifts.set(box.key, dy)
  })
  return shifts
}

export default class OverlayYAxisView<C extends Axis = YAxis> extends OverlayView<C> {
  /** Vertical shift per `overlayId:figureIndex:attrIndex`, from the last layout. */
  private _tagShifts = new Map<string, number>()
  private _inDefaultFigures = false

  override drawImp (ctx: CanvasRenderingContext2D): void {
    this._layoutTags()
    super.drawImp(ctx)
  }

  override drawAboveCrosshair (ctx: CanvasRenderingContext2D): void {
    this._layoutTags()
    super.drawAboveCrosshair(ctx)
  }

  /** Whether this axis stacks its tags. Price axes only: the x-axis view
   *  extends this one but has no last-price tag or vertical stacking. */
  protected stacksTags (): boolean {
    return true
  }

  /**
   * Collision avoidance for the price tags: collects every overlay `text` tag
   * plus the candle's last-price tag (which never moves), sorts by y and
   * pushes overlapping tags apart by at least a label height.
   */
  private _layoutTags (): void {
    const shifts = new Map<string, number>()
    this._tagShifts = shifts
    if (!this.stacksTags()) return
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    const boxes: TagBox[] = []
    const defaultTextStyles = chart.getStyles().overlay.text as unknown as Record<string, unknown>

    const lastPrice = this._lastPriceBox()
    if (lastPrice !== null) boxes.push(lastPrice)

    const yAxis = pane.getAxisComponent() as unknown as Nullable<YAxis>
    const overlays = [...this.getCompleteOverlays()]
    const progress = this.getProgressOverlay()
    if (isValid(progress)) overlays.push(progress)
    overlays.forEach(overlay => {
      if (!chartStore.isOverlayShown(overlay) || overlay.createYAxisFigures == null) return
      const coordinates = overlay.points.map(point => ({
        x: 0,
        y: isNumber(point.value) ? (yAxis?.convertToPixel(point.value) ?? 0) : 0
      }))
      if (coordinates.length === 0) return
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
      // @ts-expect-error
      const figures: OverlayFigure[] = [].concat(this.getFigures(overlay, coordinates))
      figures.forEach((figure, figureIndex) => {
        if (figure.type !== 'text') return
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
        // @ts-expect-error
        const attrsArray: Array<{ y?: number, height?: number, key?: string }> = [].concat(figure.attrs)
        attrsArray.forEach((attrs, attrIndex) => {
          if (!isNumber(attrs.y)) return
          const key = attrs.key ?? figure.key
          const keyed = key != null && key !== '' ? overlay.figureStyles[key] as Record<string, unknown> | undefined : undefined
          const figureStyles = (figure.styles ?? {}) as Record<string, unknown>
          const merged: Record<string, unknown> = { ...defaultTextStyles, ...overlay.styles?.text, ...figureStyles, ...keyed }
          const height = isNumber(attrs.height)
            ? attrs.height
            : (Number(merged.size ?? 12) + Number(merged.paddingTop ?? 0) + Number(merged.paddingBottom ?? 0))
          boxes.push({ key: `${overlay.id}:${figureIndex}:${attrIndex}`, y: attrs.y, height, fixed: false })
        })
      })
    })

    stackTags(boxes).forEach((dy, key) => shifts.set(key, dy))
  }

  private _lastPriceBox (): Nullable<TagBox> {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const yAxis = pane.getAxisComponent() as unknown as YAxisImp
    if (!yAxis.isInCandle()) return null
    const chartStore = pane.getChart().getChartStore()
    const priceMark = chartStore.getStyles().candle.priceMark
    if (!priceMark.show || !priceMark.last.show || !priceMark.last.text.show) return null
    const dataList = chartStore.getDataList(true)
    const data = dataList[dataList.length - 1]
    if (!isValid(data)) return null
    const { size, paddingTop, paddingBottom } = priceMark.last.text
    return { key: '__last_price__', y: yAxis.convertToNicePixel(data.close), height: size + paddingTop + paddingBottom, fixed: true }
  }

  protected override drawFigures (ctx: CanvasRenderingContext2D, overlay: OverlayImp, figures: OverlayFigure[]): void {
    if (this._inDefaultFigures || this._tagShifts.size === 0) {
      super.drawFigures(ctx, overlay, figures)
      return
    }
    const shifted = figures.map((figure, figureIndex) => {
      if (figure.type !== 'text') return figure
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
      // @ts-expect-error
      const attrsArray: Array<{ y?: number }> = [].concat(figure.attrs)
      let changed = false as boolean
      const next = attrsArray.map((attrs, attrIndex) => {
        const dy = this._tagShifts.get(`${overlay.id}:${figureIndex}:${attrIndex}`)
        if (dy === undefined || !isNumber(attrs.y)) return attrs
        changed = true
        return { ...attrs, y: attrs.y + dy }
      })
      if (!changed) return figure
      const result: OverlayFigure = { ...figure, attrs: Array.isArray(figure.attrs) ? next : next[0] }
      return result
    })
    super.drawFigures(ctx, overlay, shifted)
  }

  override coordinateToPointTimestampDataIndexFlag (): boolean {
    return false
  }

  override drawDefaultFigures (
    ctx: CanvasRenderingContext2D,
    overlay: OverlayImp,
    coordinates: Coordinate[]
  ): void {
    this._inDefaultFigures = true
    try {
      this.drawFigures(
        ctx,
        overlay,
        this.getDefaultFigures(overlay, coordinates)
      )
    } finally {
      this._inDefaultFigures = false
    }
  }

  protected getDefaultFigures (
    overlay: Overlay,
    coordinates: Coordinate[]
  ): OverlayFigure[] {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = pane.getChart().getChartStore()
    const clickOverlayInfo = chartStore.getClickOverlayInfo()
    const figures: OverlayFigure[] = []
    if (
      overlay.needDefaultYAxisFigure &&
      overlay.id === clickOverlayInfo.overlay?.id &&
      clickOverlayInfo.paneId === pane.getId()
    ) {
      const yAxis = pane.getAxisComponent() as unknown as YAxisImp
      const bounding = widget.getBounding()
      let topY = Number.MAX_SAFE_INTEGER
      let bottomY = Number.MIN_SAFE_INTEGER
      const isFromZero = yAxis.isFromZero()
      let textAlign: CanvasTextAlign = 'left'
      let x = 0
      if (isFromZero) {
        textAlign = 'left'
        x = 0
      } else {
        textAlign = 'right'
        x = bounding.width
      }
      const decimalFold = chartStore.getDecimalFold()
      const thousandsSeparator = chartStore.getThousandsSeparator()
      coordinates.forEach((coordinate, index) => {
        const point = overlay.points[index]
        if (isNumber(point.value)) {
          topY = Math.min(topY, coordinate.y)
          bottomY = Math.max(bottomY, coordinate.y)
          const fold = yAxis.isInCandle() ? decimalFold.formatPrice : decimalFold.format
          const text = fold(thousandsSeparator.format(formatPrecision(point.value, chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE)))
          figures.push({ type: 'text', attrs: { x, y: coordinate.y, text, align: textAlign, baseline: 'middle' }, ignoreEvent: true })
        }
      })
      if (coordinates.length > 1) {
        figures.unshift({ type: 'rect', attrs: { x: 0, y: topY, width: bounding.width, height: bottomY - topY }, ignoreEvent: true })
      }
    }
    return figures
  }

  override getFigures (
    overlay: Overlay,
    coordinates: Coordinate[]
  ): OverlayFigure | OverlayFigure[] {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const yAxis = pane.getAxisComponent() as unknown as Nullable<YAxis>
    const xAxis = chart.getXAxisPane().getAxisComponent()
    const bounding = widget.getBounding()
    return overlay.createYAxisFigures?.({ chart, overlay, coordinates, bounding, xAxis, yAxis }) ?? []
  }
}
