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
 * Fib Speed Resistance Arcs and Fib Wedge — TradingView's
 * `fib_speed_resist_arcs` and `fib_wedge`. Both draw circles around p0 with
 * radius `coeff * |p0 -> p1|` in PIXELS (so they stay round), like TV.
 *
 *   fibSpeedResistanceArcs  2 points: half circles on the side of p0 that p1
 *                           lies on (`extendData.fullCircles` closes them)
 *   fibWedge                3 points: arcs over the angle between p0->p1 and
 *                           p0->p2, plus both bounding rays
 *
 * Levels: `properties.figureLevels` (TV's defaults when unset). extendData:
 * `{ showLevels, showBackground, backgroundOpacity, showDiagonal,
 * diagonalColor/Width/Style/DashedValue, fullCircles }`.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { FigureLevel, ProOverlayTemplate } from '../../types'
import {
  BLUE, GREEN, GREY, ORANGE, PINK, RED, SKY, TEAL, TREND_GREY, DEEP_BLUE,
  arcPoints, bandPoints, enabledLevels, fibSettings, fillStyle, label, level, levelLineStyle, propertyStore
} from './shared'
import type { Figure } from './shared'

// TV's `linetoolfibspeedresistancearcs` / `linetoolfibwedge` defaults.
export const FIB_ARCS_LEVELS: FigureLevel[] = [
  level(0.236, RED), level(0.382, ORANGE), level(0.5, TEAL), level(0.618, GREEN), level(0.786, SKY), level(1, GREY),
  level(1.618, BLUE), level(2.618, PINK), level(3.618, BLUE), level(4.236, PINK), level(4.618, RED)
]

export const FIB_WEDGE_LEVELS: FigureLevel[] = [
  level(0.236, RED), level(0.382, ORANGE), level(0.5, GREEN), level(0.618, TEAL), level(0.786, SKY), level(1, GREY),
  level(1.618, BLUE, false), level(2.618, RED, false), level(3.618, DEEP_BLUE, false), level(4.236, PINK, false), level(4.618, PINK, false)
]

/** Clockwise angle (radians, 0..2π, canvas y down) of the vector a -> b. */
export const angleOf = (a: Coordinate, b: Coordinate): number => {
  const t = Math.atan2(b.y - a.y, b.x - a.x)
  return t < 0 ? t + 2 * Math.PI : t
}

/** The arc a wedge sweeps, clockwise from `from` to `to`: the shorter way round. */
export function wedgeSpan (p0: Coordinate, p1: Coordinate, p2: Coordinate): { from: number, to: number } {
  let from = angleOf(p0, p1)
  let to = angleOf(p0, p2)
  if (to < from) [from, to] = [to, from]
  if (to - from > Math.PI) [from, to] = [to, from + 2 * Math.PI]
  return { from, to }
}

const ARCS_TREND = { color: GREY, width: 2, dashed: true }
const WEDGE_TREND = { color: TREND_GREY, width: 2, dashed: false }

export const fibSpeedResistanceArcs = (): ProOverlayTemplate => {
  const { properties, setProperties, getProperties } = propertyStore()
  return {
    name: 'fibSpeedResistanceArcs',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const props = properties.get(overlay.id) ?? {}
      const settings = fibSettings(overlay.extendData, true, ARCS_TREND)
      const full = (overlay.extendData as { fullCircles?: boolean } | undefined)?.fullCircles === true
      const [c, p] = coordinates
      const length = Math.hypot(p.x - c.x, p.y - c.y)
      if (length === 0) return []
      // TV keys the half on the sign of dy (a horizontal drag picks the upper half).
      const dir = Math.sign(p.y - c.y)
      const down = dir > 0
      const a0 = full ? 0 : down ? 0 : Math.PI
      const a1 = full ? 2 * Math.PI : down ? Math.PI : 2 * Math.PI
      const levels = enabledLevels(props, FIB_ARCS_LEVELS, overlay.extendData)
      const figures: Figure[] = []

      levels.forEach((l, i) => {
        const outer = length * Math.abs(l.coeff)
        const inner = i > 0 ? length * Math.abs(levels[i - 1].coeff) : 0
        if (settings.showBackground) {
          figures.push({ type: 'polygon', key: `bg_${i}`, ignoreEvent: true, attrs: { coordinates: bandPoints(c.x, c.y, inner, outer, a0, a1) }, styles: fillStyle(l.color, settings.backgroundOpacity) })
        }
        figures.push({ type: 'line', key: `level_${i}`, attrs: { coordinates: arcPoints(c.x, c.y, outer, a0, a1) }, styles: levelLineStyle(props, l) })
        // Label on the vertical through the centre, like TV.
        if (settings.showLevels) figures.push(label(`text_${i}`, c.x, c.y + dir * outer, String(l.coeff), l.color, props.textFontSize ?? 12, 'left', 'middle'))
      })
      if (settings.showTrend) figures.push({ type: 'line', key: 'trend', attrs: { coordinates: [c, p] }, styles: settings.trend })
      return figures
    },
    setProperties,
    getProperties
  }
}

export const fibWedge = (): ProOverlayTemplate => {
  const { properties, setProperties, getProperties } = propertyStore()
  return {
    name: 'fibWedge',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const props = properties.get(overlay.id) ?? {}
      const settings = fibSettings(overlay.extendData, true, WEDGE_TREND)
      const [c, p1] = coordinates
      const length = Math.hypot(p1.x - c.x, p1.y - c.y)
      if (length === 0) return []
      const figures: Figure[] = []
      if (settings.showTrend) figures.push({ type: 'line', key: 'trend_1', attrs: { coordinates: [c, p1] }, styles: settings.trend })
      if (coordinates.length < 3) return figures

      // The second ray is p2's direction, cut to the first ray's length.
      const p2 = coordinates[2]
      const { from, to } = wedgeSpan(c, p1, p2)
      const a2 = angleOf(c, p2)
      if (settings.showTrend) {
        figures.push({ type: 'line', key: 'trend_2', attrs: { coordinates: [c, { x: c.x + length * Math.cos(a2), y: c.y + length * Math.sin(a2) }] }, styles: settings.trend })
      }

      const levels = enabledLevels(props, FIB_WEDGE_LEVELS, overlay.extendData)
      const mid = (from + to) / 2
      // Outermost first so smaller arcs paint over their fills, as TV does.
      for (let i = levels.length - 1; i >= 0; i--) {
        const l = levels[i]
        const outer = length * Math.abs(l.coeff)
        const inner = i > 0 ? length * Math.abs(levels[i - 1].coeff) : 0
        if (settings.showBackground) {
          figures.push({ type: 'polygon', key: `bg_${i}`, ignoreEvent: true, attrs: { coordinates: bandPoints(c.x, c.y, inner, outer, from, to) }, styles: fillStyle(l.color, settings.backgroundOpacity) })
        }
        figures.push({ type: 'line', key: `level_${i}`, attrs: { coordinates: arcPoints(c.x, c.y, outer, from, to) }, styles: levelLineStyle(props, l) })
        if (settings.showLevels) figures.push(label(`text_${i}`, c.x + outer * Math.cos(mid), c.y + outer * Math.sin(mid), String(l.coeff), l.color, props.textFontSize ?? 12, 'left', 'middle'))
      }
      return figures
    },
    setProperties,
    getProperties
  }
}
