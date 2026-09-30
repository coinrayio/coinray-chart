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
 * Fib Time Zone and Trend-Based Fib Time — TradingView's `fib_timezone` and
 * `fib_trend_time`. Vertical lines at Fibonacci multiples of a bar interval,
 * measured in BARS so they sit on candles at any zoom or period.
 *
 *   fibTimeZone        2 points: the interval is p0 -> p1, lines at
 *                      p0 + coeff * interval
 *   trendBasedFibTime  3 points: the interval is p0 -> p1 (the trend), lines at
 *                      p2 + coeff * interval
 *
 * Levels: `properties.figureLevels` (TV's defaults when unset). extendData:
 * `{ showLevels, showBackground, backgroundOpacity, showDiagonal,
 * diagonalColor/Width/Style/DashedValue }`. Level labels follow
 * `properties.textAlignHorizontal/Vertical` (TV: right / bottom).
 */

import type Coordinate from '../../../../common/Coordinate'
import type ChartImp from '../../../../Chart'
import type { FigureLevel, ProOverlayTemplate } from '../../types'
import {
  BLUE, DEEP_BLUE, GREEN, GREY, LIGHT_GREEN, PINK, PURPLE, RED, SKY, TEAL, TREND_GREY,
  barIndex, canvasAlign, enabledLevels, fibSettings, fillStyle, label, level, levelLineStyle, propertyStore
} from './shared'
import type { Figure, Level } from './shared'

export const FIB_TIME_ZONE_LEVELS: FigureLevel[] = [
  level(0, GREY), ...[1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((v) => level(v, BLUE))
]

export const TREND_BASED_FIB_TIME_LEVELS: FigureLevel[] = [
  level(0, GREY), level(0.382, RED), level(0.5, LIGHT_GREEN, false), level(0.618, GREEN), level(1, TEAL),
  level(1.382, SKY), level(1.618, GREY), level(2, BLUE), level(2.382, PINK), level(2.618, PURPLE), level(3, DEEP_BLUE)
]

/** Bar index a level lands on: TV rounds to whole bars. */
export const timeLevelIndex = (origin: number, interval: number, coeff: number): number => Math.round(origin + coeff * interval)

interface Kind {
  name: string
  points: 2 | 3
  levels: FigureLevel[]
  /** TV's default for the background fill. */
  fill: boolean
  trend: { color: string, width: number, dashed: boolean }
}

const KINDS = {
  timezone: { name: 'fibTimeZone', points: 2, levels: FIB_TIME_ZONE_LEVELS, fill: false, trend: { color: TREND_GREY, width: 1, dashed: true } },
  trend: { name: 'trendBasedFibTime', points: 3, levels: TREND_BASED_FIB_TIME_LEVELS, fill: true, trend: { color: GREY, width: 2, dashed: true } }
} satisfies Record<string, Kind>

const fibTime = (kind: Kind) => (): ProOverlayTemplate => {
  const { properties, setProperties, getProperties } = propertyStore()

  return {
    name: kind.name,
    totalStep: kind.points + 1,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: (params) => {
      const { chart, coordinates, bounding, overlay } = params as typeof params & { chart: ChartImp }
      const props = properties.get(overlay.id) ?? {}
      const settings = fibSettings(overlay.extendData, kind.fill, kind.trend)
      const store = chart.getChartStore()
      const figures: Figure[] = []
      const idx = overlay.points.slice(0, coordinates.length).map((p) => barIndex(chart, p))

      // The trend line(s) TV draws between the anchors.
      const trend = (a: Coordinate, b: Coordinate, key: string): void => {
        if (settings.showTrend) figures.push({ type: 'line', key, attrs: { coordinates: [a, b] }, styles: settings.trend })
      }
      if (coordinates.length >= 2) trend(coordinates[0], coordinates[1], 'trend_01')
      if (kind.points === 3 && coordinates.length >= 3) trend(coordinates[1], coordinates[2], 'trend_12')

      // Time zone shows its lines from the first click (interval 1); the
      // trend-based tool needs all three anchors and a non-empty trend.
      if (kind.points === 3 ? idx.length < 3 || idx[1] === idx[0] : idx.length < 1) return figures
      const origin = kind.points === 2 ? idx[0] : idx[2]
      const interval = kind.points === 2 ? (idx.length > 1 ? idx[1] - idx[0] : 1) : idx[1] - idx[0]

      const levels: Array<Level & { x: number }> = enabledLevels(props, kind.levels)
        .map((l) => ({ ...l, x: store.dataIndexToCoordinate(timeLevelIndex(origin, interval, l.coeff)) }))

      if (settings.showBackground) {
        for (let i = 1; i < levels.length; i++) {
          const a = levels[i - 1].x
          const b = levels[i].x
          figures.push({
            type: 'polygon',
            key: `bg_${i}`,
            ignoreEvent: true,
            attrs: { coordinates: [{ x: a, y: 0 }, { x: b, y: 0 }, { x: b, y: bounding.height }, { x: a, y: bounding.height }] },
            styles: fillStyle(levels[i].color, settings.backgroundOpacity)
          })
        }
      }

      const vert = props.textAlignVertical ?? 'bottom'
      const y = vert === 'top' ? 0 : vert === 'middle' ? bounding.height / 2 : bounding.height
      const baseline: CanvasTextBaseline = vert === 'top' ? 'top' : vert === 'middle' ? 'middle' : 'bottom'
      const align = canvasAlign(props.textAlignHorizontal, 'left')
      levels.forEach((l, i) => {
        if (l.x < -1 || l.x > bounding.width + 1) return
        if (settings.showLevels) figures.push(label(`text_${i}`, l.x, y, String(l.coeff), l.color, props.textFontSize ?? 12, align, baseline))
        figures.push({
          type: 'line',
          key: `level_${i}`,
          attrs: { coordinates: [{ x: l.x, y: 0 }, { x: l.x, y: bounding.height }] },
          styles: levelLineStyle(props, l)
        })
      })
      return figures
    },
    setProperties,
    getProperties
  }
}

export const fibTimeZone = fibTime(KINDS.timezone)
export const trendBasedFibTime = fibTime(KINDS.trend)
