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
 * Regression Trend — TradingView's `regression_trend` (LineToolRegressionTrend).
 *
 * Two points bound a bar range. A least-squares line is fitted through the
 * source price (close by default) of the bars in it; channel lines sit
 * `upperDeviation` / `lowerDeviation` standard deviations of the residuals
 * off the base line (TV's study: sqrt(sum of squared residuals / (n - 1))),
 * with the bands filled and Pearson's R written under the lower line.
 *
 * Cached per overlay against the bar range, data fingerprint and source.
 *
 * Properties: lineColor (channel lines; the base line is dashed in the same
 * colour), lineWidth, backgroundColor (band fill).
 * extendData: `{ source = 'close', upperDeviation = 2, lowerDeviation = -2,
 * useUpper = true, useLower = true, extendRight, showPearsons = true }`.
 */

import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { barIndex, barRange, dataKey, propertyStore } from './common'
import type { Figure } from './common'
import { sourcePrice } from './anchoredVwap'
import type { VwapSource } from './anchoredVwap'

export interface RegressionExtendData {
  source?: VwapSource
  upperDeviation?: number
  lowerDeviation?: number
  useUpper?: boolean
  useLower?: boolean
  extendRight?: boolean
  showPearsons?: boolean
}

// TV's defaults: blue up/down lines, a red dashed base line; each channel is filled with its
// outer line's colour at 30% (the lower one takes the base line's red).
const COLOR = '#2962FF'
const FILL = 'rgba(41, 98, 255, 0.3)'
const BASE_COLOR = '#F23645'
const BASE_FILL = 'rgba(242, 54, 69, 0.3)'

export interface Regression { intercept: number, slope: number, stdDev: number, pearsons: number }

/** Least-squares fit of `y` against 0..n-1, with TV's deviation and Pearson's R. */
export function linearRegression (y: number[]): Regression {
  const n = y.length
  const mean = y.reduce((a, b) => a + b, 0) / n
  const xMean = (n - 1) / 2
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (i - xMean) * (y[i] - mean)
    sxx += (i - xMean) ** 2
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = mean - slope * xMean
  let residual = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    residual += (y[i] - (intercept + slope * i)) ** 2
    syy += (y[i] - mean) ** 2
  }
  return {
    intercept,
    slope,
    stdDev: Math.sqrt(residual / (n > 1 ? n - 1 : 1)),
    // Pearson's R of price against bar index: signed, so a falling trend is negative.
    pearsons: syy === 0 || sxx === 0 ? 0 : sxy / Math.sqrt(sxx * syy)
  }
}

interface Cached { key: string, fit: Regression, count: number }

export const regressionTrend = (): ProOverlayTemplate => {
  const store = propertyStore()
  const cache = new WeakMap<object, Cached>()
  return {
    name: 'regressionTrend',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: (params) => {
      const { chart, overlay, coordinates, yAxis, bounding } = params as typeof params & { chart: ChartImp }
      if (coordinates.length < 2 || yAxis === null) return []
      const data = chart.getDataList()
      const i0 = barIndex(chart, overlay.points[0])
      const i1 = barIndex(chart, overlay.points[1])
      const range = i0 !== null && i1 !== null ? barRange(i0, i1, data.length) : null
      if (range === null) return []

      const ext = (overlay.extendData ?? {}) as RegressionExtendData
      const source = ext.source ?? 'close'
      const key = `${range.from}|${range.to}|${dataKey(data)}|${source}`
      let cached = cache.get(overlay)
      if (cached?.key !== key) {
        const values: number[] = []
        for (let i = range.from; i <= range.to; i++) values.push(sourcePrice(data[i], source))
        cached = { key, fit: linearRegression(values), count: values.length }
        cache.set(overlay, cached)
      }
      const { fit, count } = cached

      const props = store.get(overlay.id)
      const color = props.lineColor ?? COLOR
      const size = props.lineWidth ?? 2
      const xa = Math.min(coordinates[0].x, coordinates[1].x)
      const xb = ext.extendRight === true ? bounding.width : Math.max(coordinates[0].x, coordinates[1].x)
      // The fit runs over count - 1 bar steps between the two x positions; extending continues it.
      const xEnd = Math.max(coordinates[0].x, coordinates[1].x)
      const perPx = xEnd > xa ? (count - 1) / (xEnd - xa) : 0
      const at = (offset: number): Array<{ x: number, y: number }> => [xa, xb].map((x) => ({ x, y: yAxis.convertToPixel(fit.intercept + offset + fit.slope * (x - xa) * perPx) }))

      const base = at(0)
      const upper = ext.useUpper === false ? null : at(fit.stdDev * (ext.upperDeviation ?? 2))
      const lower = ext.useLower === false ? null : at(fit.stdDev * (ext.lowerDeviation ?? -2))
      const fill = props.backgroundColor ?? FILL
      const lowerFill = props.backgroundColor ?? (props.lineColor === undefined ? BASE_FILL : FILL)
      const figures: Figure[] = []
      for (const [name, edge, edgeFill] of [['upper', upper, fill], ['lower', lower, lowerFill]] as const) {
        if (edge !== null) figures.push({ type: 'polygon', key: `${name}_fill`, attrs: { coordinates: [base[0], base[1], edge[1], edge[0]] }, styles: { style: 'fill', color: edgeFill }, ignoreEvent: true })
      }
      figures.push({ type: 'line', key: 'base', attrs: { coordinates: base }, styles: { color: props.lineColor ?? BASE_COLOR, size: 1, style: 'dashed', dashedValue: [4, 4] } })
      if (upper !== null) figures.push({ type: 'line', key: 'upper', attrs: { coordinates: upper }, styles: { color, size, style: 'solid' } })
      if (lower !== null) figures.push({ type: 'line', key: 'lower', attrs: { coordinates: lower }, styles: { color, size, style: 'solid' } })
      if (ext.showPearsons !== false) {
        const anchor = lower ?? base
        figures.push({ type: 'text', key: 'pearsons', attrs: { x: xa, y: anchor[0].y + 4, text: fit.pearsons.toFixed(3), align: 'center', baseline: 'top' }, styles: { color, size: 12, family: 'Helvetica Neue', weight: 'normal', backgroundColor: 'transparent', borderSize: 0 }, ignoreEvent: true })
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
