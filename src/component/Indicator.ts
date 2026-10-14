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
import type DeepPartial from '../common/DeepPartial'
import type ExcludePickPartial from '../common/ExcludePickPartial'
import type { KLineData, NeighborData } from '../common/Data'
import type Bounding from '../common/Bounding'
import type Crosshair from '../common/Crosshair'
import type { IndicatorStyle, IndicatorPolygonStyle, SmoothLineStyle, RectStyle, TextStyle, TooltipFeatureStyle, LineStyle, LineType, TooltipLegend } from '../common/Styles'
import { isNumber, isValid, merge, isBoolean, isString, clone, isFunction } from '../common/utils/typeChecks'
import type { DataLoadType } from '../common/DataLoader'

import type { XAxis } from './XAxis'
import type { YAxis } from './YAxis'

import { formatValue } from '../common/utils/format'

import type { ArcAttrs } from '../extension/figure/arc'
import type { RectAttrs } from '../extension/figure/rect'
import type { TextAttrs } from '../extension/figure/text'
import type { Chart } from '../Chart'
import { PaneIdConstants } from '../pane/types'

export type IndicatorSeries = 'normal' | 'price' | 'volume'

/**
 * Which y-axis of its pane an indicator is plotted against. `secondary` is an
 * independent scale drawn on the side opposite the pane's own axis; it exists
 * only while a visible indicator is bound to it.
 */
export type IndicatorYAxis = 'primary' | 'secondary'

export type IndicatorFigureStyle = Partial<Omit<SmoothLineStyle, 'style'>> & Partial<Omit<RectStyle, 'style'>> & Partial<TextStyle> & Partial<{ style: LineType[keyof LineType] }> & Record<string, unknown>

export type IndicatorFigureAttrs = Partial<ArcAttrs> & Partial<LineStyle> & Partial<RectAttrs> & Partial<TextAttrs> & Record<string, unknown>

export interface IndicatorFigureStylesCallbackParams<D> {
  data: NeighborData<Nullable<D>>
  indicator: Indicator<D>
  defaultStyles?: IndicatorStyle
}

export type IndicatorFigureStylesCallback<D> = (params: IndicatorFigureStylesCallbackParams<D>) => IndicatorFigureStyle

export interface IndicatorFigure<D = unknown> {
  key: string
  title?: string
  type?: string
  baseValue?: number
  /**
   * Per-bar style. Evaluated once per bar and cached until the result, the
   * figures, the indicator or the chart's styles change, so it must depend only
   * on its params.
   */
  styles?: IndicatorFigureStylesCallback<D>
}

export type IndicatorRegenerateFiguresCallback<D, C> = (calcParams: C[]) => Array<IndicatorFigure<D>>

export interface IndicatorTooltipData {
  name: string
  calcParamsText: string
  features: TooltipFeatureStyle[]
  legends: TooltipLegend[]
}

export interface IndicatorCreateTooltipDataSourceParams<D> {
  chart: Chart
  indicator: Indicator<D>
  bounding: Bounding
  crosshair: Crosshair
  xAxis: XAxis
  yAxis: YAxis
}

export type IndicatorCreateTooltipDataSourceCallback<D> = (params: IndicatorCreateTooltipDataSourceParams<D>) => IndicatorTooltipData

export type IndicatorEventTarget = 'feature'

export interface IndicatorDrawParams<D, C, E> {
  ctx: CanvasRenderingContext2D
  chart: Chart
  indicator: Indicator<D, C, E>
  bounding: Bounding
  xAxis: XAxis
  yAxis: YAxis
}

export type IndicatorDrawCallback<D, C, E> = (params: IndicatorDrawParams<D, C, E>) => boolean

export type IndicatorCalcCallback<D, C, E> = (dataList: KLineData[], indicator: Indicator<D, C, E>) => Promise<D[]> | D[]

export type IndicatorShouldUpdateCallback<D, C, E> = (prev: Indicator<D, C, E>, current: Indicator<D, C, E>) => (boolean | { calc: boolean, draw: boolean })

export type IndicatorDataState = 'loading' | 'error' | 'ready'

export interface IndicatorOnDataStateChangeParams<D> {
  state: IndicatorDataState
  type: DataLoadType

  indicator: Indicator<D>
}

export interface Indicator<D = unknown, C = unknown, E = unknown> {
  /**
   * Unique id
   */
  id: string

  /**
   * Pane id
   */
  paneId: string

  /**
   * Indicator name
   */
  name: string

  /**
   * Short name, for display
   */
  shortName: string

  /**
   * Precision
   */
  precision: number

  /**
   * Calculation parameters
   */
  calcParams: C[]

  /**
   * Whether ohlc column is required
   */
  shouldOhlc: boolean

  /**
   * Whether large data values need to be formatted, starting from 1000, for example, whether 100000 needs to be formatted with 100K
   */
  shouldFormatBigNumber: boolean

  /**
   * Whether the indicator is visible
   */
  visible: boolean

  /**
   * Z index
   */
  zLevel: number

  /**
   * Which y-axis of the pane the indicator is plotted against. Default
   * `'primary'`. `'secondary'` gives the pane a second, independent axis (on
   * the side opposite the primary) that auto-ranges over the indicators bound
   * to it alone, while candles and every other indicator keep the primary.
   */
  yAxis: IndicatorYAxis

  /**
   * Candle pane, primary axis only. Draws every figure scaled by
   * `close[first visible bar] / ownValue[first visible bar]`, so the line meets
   * the candles at the left edge of the view. `ownValue` is the first figure's
   * value at that bar, or its first non-null value after it. The scaling
   * applies to drawing, to the axis range and to the last-value mark; legends
   * and tooltips keep the raw values. Ignored on a secondary axis. Default
   * `false`.
   */
  rebase: boolean

  /**
   * Extend data
   */
  extendData: E

  /**
   * Indicator series
   */
  series: IndicatorSeries

  /**
   * Figure configuration information
   */
  figures: Array<IndicatorFigure<D>>

  /**
   * Specified minimum value
   */
  minValue: Nullable<number>

  /**
   * Specified maximum value
   */
  maxValue: Nullable<number>

  /**
   * Style configuration
   */
  styles: Nullable<DeepPartial<IndicatorStyle>>

  /**
   *  Should update, should calc or draw
   */
  shouldUpdate: Nullable<IndicatorShouldUpdateCallback<D, C, E>>

  /**
   * Indicator calculation
   */
  calc: IndicatorCalcCallback<D, C, E>

  /**
   * Regenerate figure configuration
   */
  regenerateFigures: Nullable<IndicatorRegenerateFiguresCallback<D, C>>

  /**
   * Create custom tooltip text
   */
  createTooltipDataSource: Nullable<IndicatorCreateTooltipDataSourceCallback<D>>

  /**
   * Custom draw
   */
  draw: Nullable<IndicatorDrawCallback<D, C, E>>

  /**
   * Calculation result
   */
  result: D[]
}

export type IndicatorTemplate<D = unknown, C = unknown, E = unknown> = ExcludePickPartial<Omit<Indicator<D, C, E>, 'result' | 'paneId'>, 'name' | 'calc'>

export type IndicatorCreate<D = unknown, C = unknown, E = unknown> = ExcludePickPartial<Omit<Indicator<D, C, E>, 'result'>, 'name'>

export type IndicatorOverride<D = unknown, C = unknown, E = unknown> = Partial<Omit<Indicator<D, C, E>, 'result'>>

export type IndicatorFilter = Partial<Pick<Indicator, 'id' | 'paneId' | 'name'>>

export type IndicatorConstructor<D = unknown, C = unknown, E = unknown> = new () => IndicatorImp<D, C, E>

export type EachFigureCallback<D> = (figure: IndicatorFigure<D>, figureStyles: IndicatorFigureStyle, index: number) => void

/** A figure with the default style it gets from its type and position among its type. */
export interface IndicatorFigureDefaults {
  figure: IndicatorFigure
  styles: IndicatorFigureStyle
  index: number
}

/**
 * The per-figure part of `eachFigures` that does not depend on the bar. A view
 * drawing every visible bar resolves this once per indicator per frame and
 * passes it in, rather than re-reading the style arrays and copying a style
 * object for every figure of every bar.
 */
export function getFigureDefaults (indicator: Indicator, defaultStyles: IndicatorStyle): IndicatorFigureDefaults[] {
  const styles = indicator.styles

  const circleStyles = formatValue(styles, 'circles', defaultStyles.circles) as IndicatorPolygonStyle[]
  const circleStyleCount = circleStyles.length

  const barStyles = formatValue(styles, 'bars', defaultStyles.bars) as IndicatorPolygonStyle[]
  const barStyleCount = barStyles.length

  const lineStyles = formatValue(styles, 'lines', defaultStyles.lines) as SmoothLineStyle[]
  const lineStyleCount = lineStyles.length

  let circleCount = 0
  let barCount = 0
  let lineCount = 0

  // eslint-disable-next-line @typescript-eslint/init-declarations  -- ignore
  let defaultFigureStyles
  let figureIndex = 0
  const defaults: IndicatorFigureDefaults[] = []
  indicator.figures.forEach(figure => {
    switch (figure.type) {
      case 'circle': {
        figureIndex = circleCount
        const styles = circleStyles[circleCount % circleStyleCount]
        defaultFigureStyles = { ...styles, color: styles.noChangeColor }
        circleCount++
        break
      }
      case 'bar': {
        figureIndex = barCount
        const styles = barStyles[barCount % barStyleCount]
        defaultFigureStyles = { ...styles, color: styles.noChangeColor }
        barCount++
        break
      }
      case 'line': {
        figureIndex = lineCount
        defaultFigureStyles = lineStyles[lineCount % lineStyleCount]
        lineCount++
        break
      }
      default: { break }
    }
    if (isValid(figure.type)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
      defaults.push({ figure, styles: defaultFigureStyles, index: figureIndex })
    }
  })
  return defaults
}

// Per-bar figure styles are cached. A figure's `styles` callback is a function
// of its bar's data, the indicator and the chart's indicator styles, so it is
// evaluated once per bar, not once per frame: panning would otherwise re-run it
// for every visible bar on every frame. The cache is dropped when the result
// array, the figures, the indicator (any `override`) or any chart's styles
// change. A callback must therefore not read anything else that changes.
let stylesEpoch = 0

/** Drops every cached figure style; called when a chart's styles change. */
export function invalidateFigureStyles (): void {
  stylesEpoch++
}

const revisions = new WeakMap<object, number>()

interface FigureStyleCache {
  result: unknown[]
  figures: unknown[]
  revision: number
  epoch: number
  defaultStyles: IndicatorStyle
  // [figure position in the defaults][dataIndex]
  styles: Array<Array<IndicatorFigureStyle | undefined>>
}

const figureStyleCaches = new WeakMap<object, FigureStyleCache>()

function figureStyleCache (indicator: Indicator, defaultStyles: IndicatorStyle): FigureStyleCache {
  const revision = revisions.get(indicator) ?? 0
  let cache = figureStyleCaches.get(indicator)
  if (
    cache?.result !== indicator.result ||
    cache.figures !== indicator.figures ||
    cache.revision !== revision ||
    cache.epoch !== stylesEpoch ||
    cache.defaultStyles !== defaultStyles
  ) {
    cache = { result: indicator.result, figures: indicator.figures, revision, epoch: stylesEpoch, defaultStyles, styles: [] }
    figureStyleCaches.set(indicator, cache)
  }
  return cache
}

/**
 * The style of `figureDefaults[position]` at `dataIndex`. When the figure has
 * no `styles` callback this is the shared default object, so it must not be
 * mutated.
 */
export function figureStyleAt (
  indicator: Indicator,
  figureDefaults: IndicatorFigureDefaults[],
  position: number,
  dataIndex: number,
  defaultStyles: IndicatorStyle
): IndicatorFigureStyle {
  const { figure, styles } = figureDefaults[position]
  if (!isFunction(figure.styles)) return styles
  const cache = figureStyleCache(indicator, defaultStyles)
  const forFigure = (cache.styles[position] ??= [])
  let style = dataIndex >= 0 ? forFigure[dataIndex] : undefined
  if (style === undefined) {
    const result = indicator.result
    const ss = figure.styles({
      data: {
        prev: result[dataIndex - 1],
        current: result[dataIndex],
        next: result[dataIndex + 1]
      },
      indicator,
      defaultStyles
    })
    style = isValid(ss) ? { ...styles, ...ss } : styles
    if (dataIndex >= 0) forFigure[dataIndex] = style
  }
  return style
}

/** Whether `indicator` is plotted against the secondary (true) or the primary (false) axis. */
export function isBoundToAxis (indicator: Pick<Indicator, 'yAxis'>, secondary: boolean): boolean {
  return (indicator.yAxis === 'secondary') === secondary
}

/** Whether the indicator is rebased: `rebase` set, on the candle pane's primary axis. */
export function isRebased (indicator: Pick<Indicator, 'yAxis' | 'rebase'>, paneId: string): boolean {
  return indicator.rebase && indicator.yAxis !== 'secondary' && paneId === PaneIdConstants.CANDLE
}

export interface RebaseSource {
  getDataList: () => KLineData[]
  getVisibleRange: () => { from: number, to: number }
}

/**
 * The factor a rebased indicator's values are multiplied by:
 * `close[from] / ownValue`, where `from` is the first visible bar (what the
 * percentage axis uses as its base) and `ownValue` the indicator's first
 * figure at `from`, or its first non-null value after it in view. 1 when
 * either price is missing or not positive, or the indicator has nothing in view.
 */
export function getRebaseFactor (chart: RebaseSource, indicator: Pick<Indicator, 'figures' | 'result'>): number {
  const key = indicator.figures[0]?.key
  if (!isString(key)) return 1
  const { from, to } = chart.getVisibleRange()
  const base = chart.getDataList()[from]?.close
  if (!isNumber(base) || !(base > 0)) return 1
  const result = indicator.result as Array<Nullable<Record<string, unknown>>>
  const end = Math.min(to, result.length - 1)
  for (let i = Math.max(from, 0); i <= end; i++) {
    const value = result[i]?.[key]
    if (isNumber(value) && Number.isFinite(value)) {
      return value > 0 ? base / value : 1
    }
  }
  return 1
}

/**
 * Calls back once per typed figure with its style at `dataIndex`. The style
 * object is shared between bars, so a callback must not mutate it.
 */
export function eachFigures<D = unknown> (
  indicator: Indicator,
  dataIndex: number,
  defaultStyles: IndicatorStyle,
  eachFigureCallback: EachFigureCallback<D>,
  figureDefaults: IndicatorFigureDefaults[] = getFigureDefaults(indicator, defaultStyles)
): void {
  for (let i = 0; i < figureDefaults.length; i++) {
    const { figure, index } = figureDefaults[i]
    eachFigureCallback(figure as IndicatorFigure<D>, figureStyleAt(indicator, figureDefaults, i, dataIndex, defaultStyles), index)
  }
}

export default class IndicatorImp<D = unknown, C = unknown, E = unknown> implements Indicator<D, C, E> {
  id: string
  paneId: string
  name: string
  shortName: string
  precision = 4
  calcParams: C[] = []
  shouldOhlc = false
  shouldFormatBigNumber = false
  visible = true
  zLevel = 0
  yAxis: IndicatorYAxis = 'primary'
  rebase = false
  extendData: E
  series: IndicatorSeries = 'normal'
  figures: Array<IndicatorFigure<D>> = []
  minValue: Nullable<number> = null
  maxValue: Nullable<number> = null
  styles: Nullable<Partial<IndicatorStyle>> = null
  shouldUpdate: IndicatorShouldUpdateCallback<D, C, E> = (prev, current) => {
    const calc = JSON.stringify(prev.calcParams) !== JSON.stringify(current.calcParams) ||
      prev.figures !== current.figures ||
      prev.calc !== current.calc
    const draw = calc ||
      prev.shortName !== current.shortName ||
      prev.series !== current.series ||
      prev.minValue !== current.minValue ||
      prev.maxValue !== current.maxValue ||
      prev.precision !== current.precision ||
      prev.shouldOhlc !== current.shouldOhlc ||
      prev.shouldFormatBigNumber !== current.shouldFormatBigNumber ||
      prev.visible !== current.visible ||
      prev.zLevel !== current.zLevel ||
      prev.yAxis !== current.yAxis ||
      prev.rebase !== current.rebase ||
      prev.extendData !== current.extendData ||
      prev.regenerateFigures !== current.regenerateFigures ||
      prev.createTooltipDataSource !== current.createTooltipDataSource ||
      prev.draw !== current.draw

    return { calc, draw }
  }

  calc: IndicatorCalcCallback<D, C, E> = () => []
  regenerateFigures: Nullable<IndicatorRegenerateFiguresCallback<D, C>> = null
  createTooltipDataSource: Nullable<IndicatorCreateTooltipDataSourceCallback<D>> = null
  draw: Nullable<IndicatorDrawCallback<D, C, E>> = null

  result: D[] = []

  private _prevIndicator: Indicator<D, C, E>
  private _lockSeriesPrecision = false

  constructor (indicator: IndicatorTemplate<D, C, E>) {
    this.override(indicator)
    this._lockSeriesPrecision = false
  }

  override (indicator: Partial<Indicator<D, C, E>>): void {
    revisions.set(this, (revisions.get(this) ?? 0) + 1)
    const { result, ...currentOthers } = this
    this._prevIndicator = { ...clone(currentOthers), result }
    const {
      id,
      name,
      shortName,
      precision,
      styles,
      figures,
      calcParams,
      ...others
    } = indicator
    if (!isString(this.id) && isString(id)) {
      this.id = id
    }
    if (!isString(this.name)) {
      this.name = name ?? ''
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition  -- ignore
    this.shortName = shortName ?? this.shortName ?? this.name
    if (isNumber(precision)) {
      this.precision = precision
      this._lockSeriesPrecision = true
    }

    if (isValid(styles)) {
      this.styles ??= {}
      merge(this.styles, styles)
    }
    merge(this, others)
    if (isValid(calcParams)) {
      this.calcParams = calcParams
      if (isFunction(this.regenerateFigures)) {
        this.figures = this.regenerateFigures(this.calcParams)
      }
    }
    this.figures = figures ?? this.figures
  }

  setSeriesPrecision (precision: number): void {
    if (!this._lockSeriesPrecision) {
      this.precision = precision
    }
  }

  /**
   * Whether the last `override` changed something the pane's axes depend on:
   * which axis the indicator sits on, whether it is shown, how it is rebased or
   * the precision of its labels. Those need the axes re-measured, not only a
   * repaint.
   */
  axisLayoutChanged (): boolean {
    const prev = this._prevIndicator
    return prev.yAxis !== this.yAxis ||
      prev.rebase !== this.rebase ||
      prev.visible !== this.visible ||
      prev.precision !== this.precision
  }

  shouldUpdateImp (): ({ calc: boolean, draw: boolean, sort: boolean }) {
    const sort = this._prevIndicator.zLevel !== this.zLevel
    const result = this.shouldUpdate(this._prevIndicator, this)
    if (isBoolean(result)) {
      return { calc: result, draw: result, sort }
    }
    return { ...result, sort }
  }

  async calcImp (dataList: KLineData[]): Promise<boolean> {
    try {
      const result = await this.calc(dataList, this)
      this.result = result
      return true
    } catch (e) {
      return false
    }
  }

  static extend<D = unknown> (template: IndicatorTemplate<D>): IndicatorConstructor<D> {
    class Custom extends IndicatorImp<D> {
      constructor () {
        super(template)
      }
    }
    return Custom
  }
}
