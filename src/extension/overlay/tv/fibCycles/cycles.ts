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
 * Cyclic Lines, Time Cycles and Sine Line — TradingView's `cyclic_lines`,
 * `time_cycles` and `sine_line`. All three repeat with the p0 -> p1 interval;
 * cyclic lines and time cycles measure it in BARS so they stay on candles at
 * any zoom or period.
 *
 *   cyclicLines  2 points: vertical lines at p0 + k * interval, on the side
 *                p1 lies on, joined by a grey dashed guide p0 -> p1
 *   timeCycles   2 points: half circles (one interval wide) on p0's price,
 *                repeating both ways
 *   sineLine     2 points: a sine wave, half a period from p0 to p1 (a trough
 *                to a crest), repeating both ways
 *
 * Styling: lineColor / lineWidth / lineStyle. Time cycles also read
 * backgroundColor and `extendData.{showBackground, backgroundOpacity}`.
 */

import type Coordinate from '../../../../common/Coordinate'
import type ChartImp from '../../../../Chart'
import type { LineStyle } from '../../../../common/Styles'
import type DeepPartial from '../../../../common/DeepPartial'
import type { OverlayProperties, ProOverlayTemplate } from '../../types'
import { arcPoints, barIndex, cycleIndices, fillStyle, propertyStore, TREND_GREY } from './shared'
import type { Figure } from './shared'

const CYCLE_COLOR = '#80ccdb'
const TEAL_LINE = '#159980'
/** TV's fill: `rgba(106, 168, 79, 0.5)` at 50 % transparency. */
const CYCLE_FILL = '#6aa84f'

/** Sine y at `dx` px from a trough that sits at `y0`; `width` px per half period, `height` = crest - trough. */
export const sineY = (y0: number, height: number, width: number, dx: number): number =>
  y0 + height / 2 + Math.sin(dx * Math.PI / width - Math.PI / 2) * height / 2

/** Sample x positions [x0, x0 + span] at TV's step (30 per half period, at least 1 px). */
export function sineSamples (x0: number, span: number, width: number): number[] {
  const step = Math.max(1, width / 30)
  const out: number[] = []
  for (let dx = 0; dx <= span + step; dx += step) out.push(x0 + dx)
  return out
}

const lineOf = (props: DeepPartial<OverlayProperties>, color: string): Partial<LineStyle> => ({
  style: props.lineStyle ?? 'solid',
  size: props.lineWidth ?? 2,
  color: props.lineColor ?? color,
  dashedValue: props.lineDashedValue ?? [5, 2]
})

const base = (name: string): Pick<ProOverlayTemplate, 'name' | 'totalStep' | 'needDefaultPointFigure' | 'needDefaultXAxisFigure' | 'needDefaultYAxisFigure'> =>
  ({ name, totalStep: 3, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true })

export const cyclicLines = (): ProOverlayTemplate => {
  const { properties, setProperties, getProperties } = propertyStore()
  return {
    ...base('cyclicLines'),
    createPointFigures: (params) => {
      const { chart, coordinates, bounding, overlay } = params as typeof params & { chart: ChartImp }
      if (coordinates.length < 2) return []
      const props = properties.get(overlay.id) ?? {}
      const store = chart.getChartStore()
      const i0 = barIndex(chart, overlay.points[0])
      const step = barIndex(chart, overlay.points[1]) - i0
      const figures: Figure[] = [
        { type: 'line', key: 'guide', attrs: { coordinates: [coordinates[0], coordinates[1]] }, styles: { style: 'dashed', size: 1, color: TREND_GREY, dashedValue: [5, 2] } }
      ]
      const lo = store.coordinateToDataIndex(0)
      const hi = store.coordinateToDataIndex(bounding.width)
      cycleIndices(i0, step, lo, hi).forEach((i) => {
        const x = store.dataIndexToCoordinate(i)
        figures.push({ type: 'line', key: `cycle_${i}`, attrs: { coordinates: [{ x, y: 0 }, { x, y: bounding.height }] }, styles: lineOf(props, CYCLE_COLOR) })
      })
      return figures
    },
    setProperties,
    getProperties
  }
}

export const timeCycles = (): ProOverlayTemplate => {
  const { properties, setProperties, getProperties } = propertyStore()
  return {
    ...base('timeCycles'),
    createPointFigures: (params) => {
      const { chart, coordinates, bounding, overlay } = params as typeof params & { chart: ChartImp }
      if (coordinates.length < 2) return []
      const props = properties.get(overlay.id) ?? {}
      const ext = (overlay.extendData ?? {}) as { showBackground?: boolean, backgroundOpacity?: number }
      const store = chart.getChartStore()
      const a = barIndex(chart, overlay.points[0])
      const b = barIndex(chart, overlay.points[1])
      const length = Math.abs(b - a)
      if (length === 0) return []
      const lo = store.coordinateToDataIndex(0)
      const hi = store.coordinateToDataIndex(bounding.width)
      const first = Math.min(a, b)
      const y = coordinates[0].y
      const figures: Figure[] = []
      // Every start k intervals from the first, both ways; one interval of slack on the left for circles that end on screen.
      const starts = [...cycleIndices(first, -length, lo - length, hi), ...cycleIndices(first + length, length, lo - length, hi)]
      starts.forEach((i) => {
        const x0 = store.dataIndexToCoordinate(i)
        const w = store.dataIndexToCoordinate(i + length) - x0
        const r = w / 2
        const arc = arcPoints(x0 + r, y, r, Math.PI, 2 * Math.PI)
        if (ext.showBackground ?? true) {
          figures.push({ type: 'polygon', key: `fill_${i}`, ignoreEvent: true, attrs: { coordinates: arc }, styles: fillStyle(props.backgroundColor ?? CYCLE_FILL, ext.backgroundOpacity ?? 50) })
        }
        figures.push({ type: 'line', key: `cycle_${i}`, attrs: { coordinates: arc }, styles: lineOf(props, TEAL_LINE) })
      })
      return figures
    },
    setProperties,
    getProperties
  }
}

export const sineLine = (): ProOverlayTemplate => {
  const { properties, setProperties, getProperties } = propertyStore()
  return {
    ...base('sineLine'),
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) return []
      const props = properties.get(overlay.id) ?? {}
      const [p0, p1] = coordinates as [Coordinate, Coordinate]
      const width = Math.abs(p1.x - p0.x)
      if (width === 0) return []
      const height = p1.y - p0.y
      // A full period is 2 * width; walk back to the first trough left of the pane so the wave keeps its phase.
      const period = 2 * width
      const start = p0.x - Math.ceil(p0.x / period) * period
      const points = sineSamples(start, bounding.width - start, width)
        .map((x) => ({ x, y: sineY(p0.y, height, width, x - start) }))
      return [{ type: 'line', key: 'wave', attrs: { coordinates: points }, styles: lineOf(props, TEAL_LINE) }]
    },
    setProperties,
    getProperties
  }
}
