/**
 *       ___           ___                   ___           ___           ___           ___           ___           ___           ___
 *      /\__\         /\__\      ___        /\__\         /\  \         /\  \         /\__\         /\  \         /\  \         /\  \
 *     /:/  /        /:/  /     /\  \      /::|  |       /::\  \       /::\  \       /:/  /        /::\  \       /::\  \        \:\  \
 *    /:/__/        /:/  /      \:\  \    /:|:|  |      /:/\:\  \     /:/\:\  \     /:/__/        /:/\:\  \     /:/\:\  \        \:\  \
 *   /::\__\____   /:/  /       /::\__\  /:/|:|  |__   /::\~\:\  \   /:/  \:\  \   /::\  \ ___   /::\~\:\  \   /::\~\:\  \       /::\  \
 *  /:/\:::::\__\ /:/__/     __/:/\/__/ /:/ |:| /\__\ /:/\:\ \:\__\ /:/__/ \:\__\ /:/\:\  /\__\ /:/\:\ \:\__\ /:/\:\ \:\__\     /:/\:\__\
 *  \/_|:|~~|~    \:\  \    /\/:/  /    \/__|:|/:/  / \:\~\:\ \/__/ \:\  \  \/__/ \/__\:\/:/  / \/__\:\/:/  / \/_|::\/:/  /    /:/  \/__/
 *     |:|  |      \:\  \   \::/__/         |:/:/  /   \:\ \:\__\    \:\  \            \::/  /       \::/  /     |:|::/  /    /:/  /
 *     |:|  |       \:\  \   \:\__\         |::/  /     \:\ \/__/     \:\  \           /:/  /        /:/  /      |:|\/__/     \/__/
 *     |:|  |        \:\__\   \/__/         /:/  /       \:\__\        \:\__\         /:/  /        /:/  /       |:|  |
 *      \|__|         \/__/                 \/__/         \/__/         \/__/         \/__/         \/__/         \|__|
 *
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

import type {
  Styles,
  LineType, PolygonType, TooltipShowRule, TooltipShowType, FeatureType, TooltipFeaturePosition,
  CandleType, CandleTooltipRectPosition
} from './common/Styles'
import type Nullable from './common/Nullable'
import type DeepPartial from './common/DeepPartial'
import type { KLineData } from './common/Data'
import type Point from './common/Point'

import { logError, logTag, logWarn } from './common/utils/logger'

import {
  clone, merge, isString, isNumber, isValid, isObject, isArray, isFunction, isBoolean
} from './common/utils/typeChecks'
import {
  formatValue,
  formatPrecision,
  formatBigNumber,
  formatThousands,
  formatFoldDecimal,
  formatTimestampByTemplate
} from './common/utils/format'
import { calcTextWidth } from './common/utils/canvas'
import type { ActionType } from './common/Action'
import type { Indicator, IndicatorCreate, IndicatorSeries, IndicatorTemplate } from './component/Indicator'
import type { Overlay, OverlayCreate, OverlayEvent, OverlayTemplate, OverlayMode, OverlayDrawingMode, OverlayTextChangeEvent, OverlayTextChangeCallback } from './component/Overlay'
import type { FigureTemplate } from './component/Figure'

import type { FormatDateType, Options, BarSpaceLimit, ZoomAnchor } from './Options'
import ChartImp, { type Chart, type DomPosition } from './Chart'
import type { ReplayStatus, ReplayEngine } from './replay/types'

import { checkCoordinateOnArc } from './extension/figure/arc'
import { checkCoordinateOnCircle } from './extension/figure/circle'
import {
  checkCoordinateOnLine,
  getLinearYFromSlopeIntercept,
  getLinearSlopeIntercept,
  getLinearYFromCoordinates
} from './extension/figure/line'
import { checkCoordinateOnPolygon } from './extension/figure/polygon'
import { checkCoordinateOnRect } from './extension/figure/rect'
import { checkCoordinateOnText } from './extension/figure/text'

import { registerFigure, getSupportedFigures, getFigureClass } from './extension/figure/index'
import { registerIndicator, getSupportedIndicators } from './extension/indicator/index'
import { registerLocale, getSupportedLocales } from './extension/i18n/index'
import {
  registerOverlay, getOverlayClass, getSupportedOverlays,
  createPriceLine, createTradeLine, isProOverlayTemplate, createPropertiesStore, DEFAULT_OVERLAY_PROPERTIES,
  FIBONACCI_RETRACEMENT_LEVELS, FIBONACCI_EXTENSION_LEVELS, FIBONACCI_CIRCLE_LEVELS, FIBONACCI_FAN_LEVELS
} from './extension/overlay/index'
import type {
  OverlayProperties, ProOverlayTemplate, OverlayPropertiesStore,
  FigureLevel,
  PriceLineProperties, PriceLine, PriceLineEventListener,
  TradeLineProperties, TradeLine, TradeLineOptions
} from './extension/overlay/index'
import { registerStyles } from './extension/styles/index'
import { registerXAxis } from './extension/x-axis'
import { registerYAxis } from './extension/y-axis'

const charts = new Map<string, ChartImp>()
let chartBaseId = 1

/**
 * Chart version
 * @return {string}
 */
function version (): string {
  return '__VERSION__'
}

/**
 * Init chart instance
 * @param ds
 * @param options
 * @returns {Chart}
 */
function init (ds: HTMLElement | string, options?: Options): Nullable<Chart> {
  if (options?.debug !== false) {
    logTag()
  }
  let dom: Nullable<HTMLElement> = null
  if (isString(ds)) {
    dom = document.getElementById(ds)
  } else {
    dom = ds
  }
  if (dom === null) {
    logError('', '', 'The chart cannot be initialized correctly. Please check the parameters. The chart container cannot be null and child elements need to be added!!!')
    return null
  }
  let chart = charts.get(dom.id)
  if (isValid(chart)) {
    logWarn('', '', 'The chart has been initialized on the dom！！！')
    return chart
  }
  const id = `k_line_chart_${chartBaseId++}`
  chart = new ChartImp(dom, options)
  chart.id = id
  dom.setAttribute('k-line-chart-id', id)
  charts.set(id, chart)
  return chart
}

/**
 * Destroy chart instance
 * @param dcs
 */
function dispose (dcs: HTMLElement | Chart | string): void {
  let id: Nullable<string> = null
  if (dcs instanceof ChartImp) {
    id = dcs.id
  } else {
    let dom: Nullable<HTMLElement> = null
    if (isString(dcs)) {
      dom = document.getElementById(dcs)
    } else {
      dom = dcs as HTMLElement
    }
    id = dom?.getAttribute('k-line-chart-id') ?? null
  }
  if (id !== null) {
    charts.get(id)?.destroy()
    charts.delete(id)
  }
}

const utils = {
  clone,
  merge,
  isString,
  isNumber,
  isValid,
  isObject,
  isArray,
  isFunction,
  isBoolean,
  formatValue,
  formatPrecision,
  formatBigNumber,
  formatDate: formatTimestampByTemplate,
  formatThousands,
  formatFoldDecimal,
  calcTextWidth,
  getLinearSlopeIntercept,
  getLinearYFromSlopeIntercept,
  getLinearYFromCoordinates,
  checkCoordinateOnArc,
  checkCoordinateOnCircle,
  checkCoordinateOnLine,
  checkCoordinateOnPolygon,
  checkCoordinateOnRect,
  checkCoordinateOnText
}

export {
  version, init, dispose,
  registerFigure, getSupportedFigures, getFigureClass,
  registerIndicator, getSupportedIndicators,
  registerOverlay, getSupportedOverlays, getOverlayClass,
  registerLocale, getSupportedLocales,
  registerStyles,
  registerXAxis, registerYAxis,
  utils,
  // Pro overlay utilities
  createPriceLine, createTradeLine, isProOverlayTemplate, createPropertiesStore, DEFAULT_OVERLAY_PROPERTIES,
  // Default fibonacci levels
  FIBONACCI_RETRACEMENT_LEVELS, FIBONACCI_EXTENSION_LEVELS, FIBONACCI_CIRCLE_LEVELS, FIBONACCI_FAN_LEVELS,
  // Replay engine type — exported for consumer type annotations (sc.replay: ReplayEngine | null)
  type ReplayEngine,
  // Core consumer types
  type Chart, type Nullable, type DeepPartial, type KLineData, type Point, type Styles, type Options,
  type Overlay, type OverlayCreate, type OverlayEvent, type OverlayTemplate,
  type Indicator, type IndicatorCreate, type IndicatorTemplate,
  type FigureTemplate,
  // Style / enum types
  type LineType, type PolygonType, type TooltipShowRule, type TooltipShowType, type FeatureType, type TooltipFeaturePosition, type CandleTooltipRectPosition,
  type CandleType, type FormatDateType, type BarSpaceLimit, type ZoomAnchor,
  type DomPosition, type ActionType, type IndicatorSeries, type OverlayMode, type OverlayDrawingMode, type OverlayTextChangeEvent, type OverlayTextChangeCallback,
  // Pro overlay types
  type OverlayProperties, type ProOverlayTemplate, type OverlayPropertiesStore, type FigureLevel,
  type PriceLineProperties, type PriceLine, type PriceLineEventListener,
  type TradeLineProperties, type TradeLine, type TradeLineOptions,
  // Replay types
  type ReplayStatus
}
