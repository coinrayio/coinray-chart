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
import { barIndex, barRange, dataKey, propertyStore, withAlpha } from './common'
import type { Figure } from './common'
import { tvDashedValue } from '../../tvLine'
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
  showBase?: boolean
  // Per-line style, set from the dialog: `${line}Color/Width/Style/DashedValue` for base, upper, lower.
  [style: string]: unknown
}

// TV's defaults: blue up/down lines, a red dashed base line; each channel is filled with its
// outer line's colour at 30% (the lower one takes the base line's red).
const COLOR = '#2962FF'
const BASE_COLOR = '#F23645'

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

type Edge = Array<{ x: number, y: number }>

/**
 * TV's fills: the visible lines, taken in the order base, lower, upper, are re-ordered as
 * [second, first, third] and each neighbouring pair is filled in the colour of the later one.
 * So all three give lower|base in the base colour and base|upper in the upper's; with the lower or
 * upper line off, one fill between base and the other stays, in the base colour; with the base line
 * off, one fill spans lower|upper in the lower's colour; with one line left, none.
 */
export function regressionFills (lines: ReadonlyArray<readonly [string, Edge | null]>, colorOf: (name: string) => string, override?: string): Figure[] {
  const visible = lines.flatMap(([name, edge]) => edge === null ? [] : [{ name, edge }])
  const ordered = [1, 0, 2].flatMap((i) => i < visible.length ? [visible[i]] : [])
  const figures: Figure[] = []
  for (let i = 1; i < ordered.length; i++) {
    const [a, b] = [ordered[i - 1].edge, ordered[i].edge]
    figures.push({ type: 'polygon', key: `fill_${i}`, attrs: { coordinates: [a[0], a[1], b[1], b[0]] }, styles: { style: 'fill', color: override ?? withAlpha(colorOf(ordered[i].name), 0.3) }, ignoreEvent: true })
  }
  return figures
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
      // One line's style: the dialog's per-line value, else the drawing's, else TV's default.
      const styleOf = (line: 'base' | 'upper' | 'lower', fallback: { color: string, size: number, style: string, dashedValue?: number[] }): object => {
        const size = (ext[`${line}Width`] ?? fallback.size) as number
        return {
          color: ext[`${line}Color`] ?? fallback.color,
          size,
          style: ext[`${line}Style`] ?? fallback.style,
          // Dashes scale with the stroke, as in TV.
          dashedValue: tvDashedValue((ext[`${line}DashedValue`] ?? fallback.dashedValue) as number[] | undefined, size)
        }
      }
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
      const figures: Figure[] = regressionFills(
        [['base', ext.showBase === false ? null : base], ['lower', lower], ['upper', upper]],
        (name) => (ext[`${name}Color`] ?? (name === 'base' ? props.lineColor ?? BASE_COLOR : color)) as string,
        props.backgroundColor
      )
      if (ext.showBase !== false) figures.push({ type: 'line', key: 'base', attrs: { coordinates: base }, styles: styleOf('base', { color: props.lineColor ?? BASE_COLOR, size: 1, style: 'dashed', dashedValue: [4, 4] }) })
      if (upper !== null) figures.push({ type: 'line', key: 'upper', attrs: { coordinates: upper }, styles: styleOf('upper', { color, size, style: 'solid' }) })
      if (lower !== null) figures.push({ type: 'line', key: 'lower', attrs: { coordinates: lower }, styles: styleOf('lower', { color, size, style: 'solid' }) })
      if (ext.showPearsons !== false) {
        const anchor = lower ?? base
        figures.push({ type: 'text', key: 'pearsons', attrs: { x: xa, y: anchor[0].y + 4, text: String(fit.pearsons), align: 'center', baseline: 'top' }, styles: { color, size: 12, family: 'Helvetica Neue', weight: 'normal', backgroundColor: 'transparent', borderSize: 0 }, ignoreEvent: true })
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
