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

import { figureStyleAt, getFigureDefaults, getRebaseFactor, isRebased, type Indicator, type IndicatorFigureStyle } from '../component/Indicator'
import { checkCoordinateOnRect, type RectAttrs } from '../extension/figure/rect'
import { checkCoordinateOnCircle, type CircleAttrs } from '../extension/figure/circle'
import type { MouseTouchEvent } from '../common/EventHandler'
import { DEVIATION } from '../component/Figure'
import type DrawWidget from '../widget/DrawWidget'
import type DrawPane from '../pane/DrawPane'
import RectBatch from '../common/RectBatch'

import type { YAxis } from '../component/YAxis'
import CandleBarView, { type CandleBarOptions } from './CandleBarView'

/** A bar `RectBatch` paints exactly as `drawRect` would: a solid colour fill, square corners. */
function isPlainFill (styles: IndicatorFigureStyle): boolean {
  return (styles.style ?? 'fill') === 'fill' && isString(styles.color) && (styles.borderRadius === undefined || styles.borderRadius === 0)
}

/**
 * A circle figure's radius. Without a `size` (the default styles have none)
 * it fills the bar's slot, as it always has. With one (a script plot's line
 * width) it is that thick whatever the zoom, as TradingView's circles are:
 * 1 a small dot, 4 a large one, overlapping when the bars are close.
 */
export function circleRadius (size: unknown, halfGapBar: number): number {
  return isNumber(size) && size > 0 ? size + 1 : Math.max(1, halfGapBar)
}

/**
 * Carries a line from its current end to the next bar at `nextX`. A plain
 * line goes straight to the next value; a step runs flat at `fromY` and then
 * rises to it, or stays flat where the next bar has no value.
 */
export function extendLine (coordinates: Coordinate[], nextX: number, fromY: number, toY: number | undefined, step: boolean): void {
  if (!step) {
    if (isNumber(toY)) coordinates.push({ x: nextX, y: toY })
    return
  }
  coordinates.push({ x: nextX, y: fromY })
  if (isNumber(toY) && toY !== fromY) coordinates.push({ x: nextX, y: toY })
}

/** How opaque an Area plot's fill is over its line's colour. */
const AREA_FILL_ALPHA = 0.3
/** Half the diagonal of a "Step line with diamonds" diamond, in pixels. */
const DIAMOND_SIZE = 3.5

/**
 * A column's width in pixels. A set `barWidth` (a Histogram) is that wide;
 * otherwise (Columns) it fills the bar less a FIXED 1px separator, not the
 * candle's proportional gap: a histogram is read as a band, a colour ribbon
 * like Chop Zone carries its whole meaning in adjacent columns touching.
 * Measured against TradingView / Altrady: their gap is 1px at every bar
 * spacing, ~85% duty.
 */
export function columnWidthFor (bar: number, barWidth?: number): number {
  return isNumber(barWidth) ? Math.max(1, Math.round(barWidth)) : Math.max(1, Math.round(bar) - 1)
}

/** An Area's outline: down from its first point to `baseY`, along the line, and back. */
export function areaPolygon (coordinates: Coordinate[], baseY: number): Coordinate[] {
  if (coordinates.length === 0) return []
  return [
    { x: coordinates[0].x, y: baseY },
    ...coordinates,
    { x: coordinates[coordinates.length - 1].x, y: baseY }
  ]
}

/** What one indicator painted this frame, for hit-testing and its selection handles. */
interface IndicatorHit {
  indicator: Indicator
  lines: Coordinate[][]
  rects: RectAttrs[]
  circles: CircleAttrs[]
  /** The colour handles on each line take, in `lines`' order; null for a line without handles. */
  lineColors: Array<string | null>
}

/** The payload of `onIndicatorClick`, `onIndicatorDoubleClick` and `onIndicatorRightClick`. */
export interface IndicatorClickData {
  id: string
  name: string
  paneId: string
  /** Where on the page, for a menu at the pointer. */
  pageX?: number
  pageY?: number
}

/** A style worth hit-testing: one the user can see. A plot hidden in the Style tab paints transparent. */
function isVisibleStyle (styles: { color?: unknown, size?: unknown }): boolean {
  return styles.color !== 'transparent' && styles.size !== 0
}

/** Squared distance from `p` to the segment `a`-`b`. */
function distanceSqToSegment (p: Coordinate, a: Coordinate, b: Coordinate): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
  const x = a.x + t * dx - p.x
  const y = a.y + t * dy - p.y
  return x * x + y * y
}

/**
 * Whether `p` is within `tolerance` of a polyline whose points ascend in x.
 * Binary-searches to the segments around `p.x`, so a hover test over a
 * thousand-bar line looks at a handful of segments, not all of them.
 */
export function isNearPolyline (p: Coordinate, coordinates: Coordinate[], tolerance: number): boolean {
  const n = coordinates.length
  if (n === 0) return false
  if (n === 1) return distanceSqToSegment(p, coordinates[0], coordinates[0]) <= tolerance * tolerance
  let lo = 0
  let hi = n - 1
  const left = p.x - tolerance
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (coordinates[mid].x < left) lo = mid + 1
    else hi = mid
  }
  const tol2 = tolerance * tolerance
  for (let i = Math.max(1, lo); i < n && coordinates[i - 1].x <= p.x + tolerance; i++) {
    if (distanceSqToSegment(p, coordinates[i - 1], coordinates[i]) <= tol2) return true
  }
  return false
}

/** How close a click has to come to a line, in pixels: the engine's own figure tolerance. */
const HIT_TOLERANCE = DEVIATION

/**
 * Selection handles, as tradingview.com draws them: hollow blue circles of
 * this radius. Their spacing is `handleStep`, fixed when selected.
 */
const HANDLE_RADIUS = 4
const HANDLE_COLOR = '#2962ff'

/**
 * Where a column's handle goes: its value end, the edge away from zero, as
 * tradingview.com marks a histogram (the bottom of a bar below zero).
 */
export function columnHandleY (top: number, bottom: number, zeroY: number): number {
  return Math.abs(bottom - zeroY) > Math.abs(top - zeroY) ? bottom : top
}

export default class IndicatorView extends CandleBarView {
  private _indicatorHits: IndicatorHit[] = []
  private _clickedIndicator: Nullable<Indicator> = null

  constructor (widget: DrawWidget<DrawPane<YAxis>>) {
    super(widget)
    // Over a plot, the arrow, as on tradingview.com: drawings reset the force
    // cursor on every move they do not claim, so it only needs setting here.
    // Claimed, so the engine keeps the crosshair, as for a drawing.
    this.registerEvent('mouseMoveEvent', () => {
      if (this._clickedIndicator === null) return false
      this.getWidget().setForceCursor('default')
      return true
    })
    this.registerEvent('mouseDoubleClickEvent', () => this._fire('onIndicatorDoubleClick'))
    this.registerEvent('mouseRightClickEvent', event => this._fire('onIndicatorRightClick', event))
  }

  /** The indicator whose painted shape is under `event`, last drawn first. */
  private _hitAt (event: Coordinate): Nullable<Indicator> {
    for (let i = this._indicatorHits.length - 1; i > -1; i--) {
      const { indicator, lines, rects, circles } = this._indicatorHits[i]
      if (circles.length > 0 && checkCoordinateOnCircle(event, circles)) return indicator
      if (rects.length > 0 && checkCoordinateOnRect(event, rects)) return indicator
      if (lines.some(line => isNearPolyline(event, line, HIT_TOLERANCE))) return indicator
    }
    return null
  }

  /**
   * An event on a drawn plot of an indicator. Claimed only while something
   * listens to `onIndicatorClick`, so a host that does not select indicators
   * keeps its chart clicks and cursor.
   */
  override checkEventOn (event: MouseTouchEvent): boolean {
    this._clickedIndicator = null
    const chartStore = this.getWidget().getPane().getChart().getChartStore()
    if (chartStore.hasAction('onIndicatorClick')) {
      this._clickedIndicator = this._hitAt(event)
      if (this._clickedIndicator !== null) return true
    }
    return super.checkEventOn(event)
  }

  private _fire (action: 'onIndicatorClick' | 'onIndicatorDoubleClick' | 'onIndicatorRightClick', event?: MouseTouchEvent): boolean {
    const indicator = this._clickedIndicator
    if (indicator === null) return false
    const data: IndicatorClickData = {
      id: indicator.id,
      name: indicator.name,
      paneId: this.getWidget().getPane().getId(),
      ...(event !== undefined ? { pageX: event.pageX, pageY: event.pageY } : {})
    }
    this.getWidget().getPane().getChart().getChartStore().executeAction(action, data)
    return true
  }

  /** An indicator click is consumed: it selects the indicator, not the chart. */
  protected override onClick (): boolean {
    return this._clickedIndicator === null ? super.onClick() : this._fire('onIndicatorClick')
  }

  /**
   * Markers along a selected indicator's plots, as tradingview.com marks one:
   * on the bars whose time falls on a step, so they stay on the same bars as
   * the chart scrolls and as older history loads (spacing by pixels from the
   * left edge, then by index, made them hop). The step is the one chosen when
   * it was selected, so zooming does not move them either.
   */
  private _drawHandles (ctx: CanvasRenderingContext2D, hit: IndicatorHit): void {
    const chartStore = this.getWidget().getPane().getChart().getChartStore()
    const bar = Math.max(chartStore.getBarSpace().bar, 0.0001)
    const step = chartStore.getSelectedIndicatorHandleStep()
    /** A pixel's bar, as a float: bar `i`'s centre is exactly `i`. */
    const indexOf = (x: number): number => chartStore.coordinateToFloatIndex(x) - 0.5
    const xOf = (index: number): number => chartStore.dataIndexToCoordinate(index)
    // Which bars carry handles is decided by the bar's TIME, not its index:
    // loading older history shifts every index (and made the handles hop to
    // other bars); a bar's time never changes.
    const dataList = chartStore.getDataList()
    const last = dataList.length - 1
    let interval = Infinity
    for (let i = Math.max(1, last - 100); i <= last; i++) {
      const gap = dataList[i].timestamp - dataList[i - 1].timestamp
      if (gap > 0 && gap < interval) interval = gap
    }
    if (!Number.isFinite(interval)) interval = 1
    const timeOf = (index: number): number => {
      if (index >= 0 && index <= last) return dataList[index].timestamp
      // Off either end (a plot shifted into the future): extrapolated.
      const edge = index < 0 ? 0 : last
      return (dataList[edge]?.timestamp ?? 0) + (index - edge) * interval
    }
    const carries = (index: number): boolean => Math.round(timeOf(index) / interval) % step === 0
    // Hollow: the disc under the ring is cleared first, so the plot does not
    // run through it, whatever the chart's background.
    const marker = (x: number, y: number): void => {
      ctx.beginPath()
      ctx.arc(x, y, HANDLE_RADIUS + 1, 0, Math.PI * 2)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      ctx.beginPath()
      ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2)
      ctx.strokeStyle = HANDLE_COLOR
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.save()
    ctx.setLineDash([])
    // Lines: every multiple of the step along each segment, so a level drawn
    // as two points across the pane gets them as well as a plot does.
    hit.lines.forEach((coordinates, l) => {
      if (hit.lineColors[l] === null) return
      let placed = NaN
      for (let i = 1; i < coordinates.length; i++) {
        const a = coordinates[i - 1]
        const b = coordinates[i]
        const lo = Math.min(a.x, b.x)
        const hi = Math.max(a.x, b.x)
        for (let index = Math.ceil(indexOf(lo) - 1e-6); ; index++) {
          const x = xOf(index)
          if (x > hi + 0.5) break
          if (index === placed || !carries(index)) continue
          const y = hi === lo ? a.y : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x)
          marker(x, y)
          placed = index
        }
      }
    })
    // A column or dot on one bar: on the same bars as the lines. Anything
    // wider (a volume profile's rows, which follow no bar) gets none, as on
    // tradingview.com: its legend row shows the selection.
    const onBar = (x: number, y: number): void => {
      if (carries(Math.round(indexOf(x)))) marker(x, y)
    }
    const zeroY = this.getWidget().getPane().getAxisComponent().convertToPixel(0)
    hit.rects.forEach(({ x, y, width, height }) => {
      if (width > bar * 1.5) return
      onBar(x + width / 2, columnHandleY(Math.min(y, y + height), Math.max(y, y + height), zeroY))
    })
    hit.circles.forEach(({ x, y }) => { onBar(x, y) })
    ctx.restore()
  }

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
    this._indicatorHits = []
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
        const hit: IndicatorHit = { indicator, lines: [], rects: [], circles: [], lineColors: [] }
        this._indicatorHits.push(hit)
        let isCover = false
        if (indicator.draw !== null) {
          ctx.save()
          isCover = indicator.draw({
            ctx,
            chart,
            indicator,
            bounding,
            xAxis,
            yAxis: factor === 1 ? yAxis : rebasedAxis(yAxis, factor),
            hitArea: {
              line: (coordinates, options) => {
                if (coordinates.length === 0) return
                hit.lines.push(coordinates)
                hit.lineColors.push(options?.handles === false ? null : '#2962ff')
              },
              rect: rect => { hit.rects.push(rect) },
              circle: circle => { hit.circles.push(circle) }
            }
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
                  const circle = { x, y: valueY, r: circleRadius(figureStyles.size, halfGapBar) }
                  this.createFigure({ name: 'circle', attrs: circle, styles: figureStyles })?.draw(ctx)
                  if (isVisibleStyle(figureStyles)) hit.circles.push(circle)
                  continue
                }
                const baseValueY = isNumber(figure.baseValue) ? toPixel(figure.baseValue) : yAxis.convertToPixel(yAxis.getRange().from)
                const baseValue = figure.baseValue ?? yAxis.getRange().from
                let height = Math.abs(baseValueY - valueY)
                if (baseValue !== value) {
                  height = Math.max(1, height)
                }
                const y = valueY > baseValueY ? baseValueY : valueY
                const columnWidth = columnWidthFor(bar, figure.barWidth)
                const rect: RectAttrs = { x: x - Math.floor(columnWidth / 2), y, width: columnWidth, height }
                if (isVisibleStyle(figureStyles)) hit.rects.push(rect)
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
            const lineFigure = figureDefaults[position].figure
            const key = lineFigure.key
            const step = lineFigure.step === true
            const polylines: Array<{ coordinates: Coordinate[], styles: Partial<SmoothLineStyle> }> = []
            // Where each step lands on a new value, for diamonds.
            const diamonds: Array<{ x: number, y: number, color: string }> = []
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
              if (!isNumber(fromY) || (!step && !isNumber(toY))) continue
              const styles = figureStyleAt(indicator, figureDefaults, position, dataIndex, defaultStyles) as unknown as SmoothLineStyle
              const last = polylines[polylines.length - 1] as typeof polylines[number] | undefined
              const end = last?.coordinates[last.coordinates.length - 1]
              // A step runs flat to the next bar, then rises to its value if
              // it has one.
              const continues = last !== undefined && end?.x === current.x && end.y === fromY && isSameLineStyle(last.styles, styles)
              const coordinates: Coordinate[] = continues ? last.coordinates : [{ x: current.x, y: fromY }]
              if (!continues) polylines.push({ coordinates, styles })
              extendLine(coordinates, next.x, fromY, toY, step)
              if (step && lineFigure.diamonds === true && isNumber(toY) && toY !== fromY && isString(styles.color)) {
                diamonds.push({ x: next.x, y: toY, color: styles.color })
              }
              segments++
            }
            if (segments > 1) {
              // An Area's fill, under its line: each run closed down (or up)
              // to the base value, kept inside the pane.
              if (lineFigure.area === true) {
                const baseY = Math.min(Math.max(toPixel(lineFigure.baseValue ?? 0), 0), bounding.height)
                ctx.save()
                ctx.globalAlpha = AREA_FILL_ALPHA
                polylines.forEach(({ coordinates, styles }) => {
                  if (coordinates.length < 2 || !isVisibleStyle(styles) || !isString(styles.color)) return
                  ctx.beginPath()
                  areaPolygon(coordinates, baseY).forEach(({ x, y }, i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
                  ctx.closePath()
                  ctx.fillStyle = styles.color
                  ctx.fill()
                })
                ctx.restore()
              }
              polylines.forEach(({ coordinates, styles }) => {
                if (isVisibleStyle(styles)) {
                  hit.lines.push(coordinates)
                  hit.lineColors.push(isString(styles.color) ? styles.color : '#2962ff')
                }
                this.createFigure({
                  name: 'line',
                  attrs: { coordinates },
                  styles
                })?.draw(ctx)
              })
              diamonds.forEach(({ x, y, color }) => {
                ctx.beginPath()
                ctx.moveTo(x, y - DIAMOND_SIZE)
                ctx.lineTo(x + DIAMOND_SIZE, y)
                ctx.lineTo(x, y + DIAMOND_SIZE)
                ctx.lineTo(x - DIAMOND_SIZE, y)
                ctx.closePath()
                ctx.fillStyle = color
                ctx.fill()
              })
            }
          }

          // Price lines: dotted across the pane at each one's last value.
          figureDefaults.forEach(({ figure }, position) => {
            if (figure.priceLine !== true) return
            for (let dataIndex = result.length - 1; dataIndex >= 0; dataIndex--) {
              const value = (result[dataIndex] as Nullable<Record<string, unknown>>)?.[figure.key]
              if (!isNumber(value)) continue
              const styles = figureStyleAt(indicator, figureDefaults, position, dataIndex, defaultStyles)
              if (!isString(styles.color) || !isVisibleStyle(styles)) return
              const y = Math.round(toPixel(value)) + 0.5
              ctx.save()
              ctx.strokeStyle = styles.color
              ctx.lineWidth = 1
              ctx.setLineDash([1, 2])
              ctx.beginPath()
              ctx.moveTo(0, y)
              ctx.lineTo(bounding.width, y)
              ctx.stroke()
              ctx.restore()
              return
            }
          })
        }
      }
    })
    // The selected indicator's handles, over everything in the pane.
    const selected = chartStore.getSelectedIndicator()
    if (selected !== null) {
      const hit = this._indicatorHits.find(h => h.indicator.name === selected)
      if (hit !== undefined) {
        ctx.globalCompositeOperation = 'source-over'
        this._drawHandles(ctx, hit)
      }
    }
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
