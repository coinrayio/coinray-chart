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
 * Gann Square and Gann Square Fixed — TradingView's `gannbox_square`
 * (LineToolGannComplex) and `gannbox_fixed` (LineToolGannFixed).
 *
 * Two points spanning a box from the origin. A grid of six lines each way at
 * fifths of the box, eleven fan lines from the origin, and eleven quarter
 * ellipses around it (mirrors TV's GannComplexPaneView / GannFixedPaneView).
 *
 *   gannSquare        the box is the two points, as dragged
 *   gannSquareFixed   the box is a pixel square five times the origin→point
 *                     distance, in the direction of the point
 *
 * Reverse puts the origin on the second point and the box towards the first.
 *
 * Gann Square also writes TV's "Ranges and ratio" labels outside the box's corners:
 * the price range top-left, price per bar top-right and the bar count bottom-right.
 * Not drawn: the scale-ratio lock.
 *
 * properties.figureLevels, when set, overrides the colour and visibility of
 * those rows by position: the 6 grid levels, the 11 fan lines, the 11 arcs.
 *
 * extendData: `{ levels, fanLines, arcs, showBackground, backgroundOpacity }`,
 * where each list holds TV's rows (`levels: { color, width, visible }`,
 * `fanLines` / `arcs`: `{ x, y, color, width, visible }`) and `showBackground`
 * fills between the arcs. Missing lists fall back to TV's defaults.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { LineStyle } from '../../../../common/Styles'
import type { OverlayTemplate } from '../../../../component/Overlay'
import type { ProOverlayTemplate } from '../../types'
import { fibOneColor, withAlpha } from '../../fibonacciShared'
import { propertyStore } from './shared'

export interface GannRow { color: string, width?: number, visible: boolean, x?: number, y?: number }

const GREY = '#787b86'
const ORANGE = '#ff9800'
const SKY = '#00bcd4'
const GREEN = '#4caf50'
const MINTY = '#089981'
const BLUE = '#2962ff'
const RED = '#f23645'
const PURPLE = '#b39ddb'
const VIOLET = '#9575cd'

const fan = (color: string, visible: boolean, x: number, y: number): GannRow => ({ color, visible, x, y })

export const GANN_LEVELS: GannRow[] = [GREY, ORANGE, SKY, GREEN, MINTY, GREY].map((color) => ({ color, visible: true }))
export const GANN_FAN_LINES: GannRow[] = [
  fan(PURPLE, false, 8, 1), fan(RED, false, 5, 1), fan(GREY, false, 4, 1), fan(ORANGE, false, 3, 1),
  fan(SKY, true, 2, 1), fan(GREEN, true, 1, 1), fan(MINTY, true, 1, 2), fan(MINTY, false, 1, 3),
  fan(BLUE, false, 1, 4), fan(VIOLET, false, 1, 5), fan(PURPLE, false, 1, 8)
]
export const GANN_ARCS: GannRow[] = [
  fan(ORANGE, true, 1, 0), fan(ORANGE, true, 1, 1), fan(ORANGE, true, 1.5, 0), fan(SKY, true, 2, 0),
  fan(SKY, true, 2, 1), fan(GREEN, true, 3, 0), fan(GREEN, true, 3, 1), fan(MINTY, true, 4, 0),
  fan(MINTY, true, 4, 1), fan(BLUE, true, 5, 0), fan(BLUE, true, 5, 1)
]

interface GannSquareExtendData {
  levels?: GannRow[]
  fanLines?: GannRow[]
  arcs?: GannRow[]
  showBackground?: boolean
  backgroundOpacity?: number
  reverse?: boolean
  /** TV's "Ranges and ratio" labels; Gann Square only, on unless false. */
  showRanges?: boolean
}

/** The box a Fixed square draws: pixel-square, 5x the origin→point distance. */
export function fixedBoxEnd (origin: Coordinate, point: Coordinate): Coordinate {
  const l = Math.hypot(point.x - origin.x, point.y - origin.y)
  return { x: origin.x + 5 * l * (point.x < origin.x ? -1 : 1), y: origin.y + 5 * l * (point.y < origin.y ? -1 : 1) }
}

/** Where a fan line of ratio `x`:`y` meets the box's far edge. */
export function fanLineEnd (origin: Coordinate, end: Coordinate, x: number, y: number): Coordinate {
  return x > y
    ? { x: end.x, y: origin.y + (y / x) * (end.y - origin.y) }
    : { x: origin.x + (x / y) * (end.x - origin.x), y: end.y }
}

const ARC_STEPS = 32

/**
 * The quarter ellipse for arc `x`,`y` at the origin. Its radius is measured in
 * the box squashed square, so the arc is a circle whenever the box is one.
 */
export function arcPoints (origin: Coordinate, end: Coordinate, x: number, y: number): Coordinate[] {
  const dx = end.x - origin.x
  const dy = end.y - origin.y
  if (dx === 0 || dy === 0) return []
  const r = (Math.abs(dx) / 5) * Math.hypot(x, y)
  const rx = r * Math.sign(dx)
  const ry = r * Math.abs(dy / dx) * Math.sign(dy)
  const points: Coordinate[] = []
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = (i / ARC_STEPS) * (Math.PI / 2)
    points.push({ x: origin.x + Math.cos(t) * rx, y: origin.y + Math.sin(t) * ry })
  }
  return points
}

/** The arc split into the runs that lie inside the box. */
export function arcRuns (origin: Coordinate, end: Coordinate, x: number, y: number): Coordinate[][] {
  const eps = 1e-6
  const inside = (p: Coordinate): boolean =>
    p.x >= Math.min(origin.x, end.x) - eps && p.x <= Math.max(origin.x, end.x) + eps &&
    p.y >= Math.min(origin.y, end.y) - eps && p.y <= Math.max(origin.y, end.y) + eps
  const runs: Coordinate[][] = []
  let run: Coordinate[] = []
  for (const p of arcPoints(origin, end, x, y)) {
    if (inside(p)) {
      run.push(p)
    } else if (run.length > 0) {
      runs.push(run)
      run = []
    }
  }
  if (run.length > 0) runs.push(run)
  return runs
}

const clampTo = (p: Coordinate, origin: Coordinate, end: Coordinate): Coordinate => ({
  x: Math.min(Math.max(p.x, Math.min(origin.x, end.x)), Math.max(origin.x, end.x)),
  y: Math.min(Math.max(p.y, Math.min(origin.y, end.y)), Math.max(origin.y, end.y))
})

/** Rows `custom` holds from `offset` (colour, visibility) laid over `rows`. */
const overrideRows = (rows: GannRow[], custom: Array<{ color?: string, enabled?: boolean }> | undefined, offset: number): GannRow[] =>
  custom === undefined || custom.length === 0
    ? rows
    : rows.map((r, i) => {
      const c = custom.at(offset + i)
      return c === undefined ? r : { ...r, color: c.color ?? r.color, visible: c.enabled ?? r.visible }
    })

/** Gap between a range label and the box corner it sits outside. */
const LABEL_GAP = 12

/** TV's range labels: the price span, the bar count and price per bar (to 7 decimals, trailing zeros dropped). */
export function gannRangeTexts (priceDiff: number, barDiff: number, precision: number): { price: string, bars: string, ratio: string } {
  const bars = Math.abs(barDiff)
  const price = Math.abs(priceDiff)
  return { price: price.toFixed(precision), bars: String(bars), ratio: bars === 0 ? '' : String(Number((price / bars).toFixed(7))) }
}

const gannSquare = (name: string, fixed: boolean) => (): ProOverlayTemplate => {
  const store = propertyStore()

  return {
    name,
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ chart, coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const props = store.get(overlay.id)
      const ext = (overlay.extendData ?? {}) as GannSquareExtendData
      const [origin, far] = ext.reverse === true ? [coordinates[1], coordinates[0]] : coordinates
      const end = fixed ? fixedBoxEnd(origin, far) : far
      const dx = end.x - origin.x
      const dy = end.y - origin.y
      const line = (row: GannRow): Partial<LineStyle> => ({ style: 'solid', size: row.width ?? props.lineWidth ?? 2, color: row.color })
      const figures: Array<{ type: string, key: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }> = []

      // Fill first so the lines sit on top of it.
      const oneColor = fibOneColor(overlay.extendData)
      const paint = (rows: GannRow[]): GannRow[] => oneColor === undefined ? rows : rows.map((r) => ({ ...r, color: oneColor }))
      const levels = paint(overrideRows(ext.levels ?? GANN_LEVELS, props.figureLevels, 0))
      const fanLines = paint(overrideRows(ext.fanLines ?? GANN_FAN_LINES, props.figureLevels, GANN_LEVELS.length))
      const arcs = paint(overrideRows(ext.arcs ?? GANN_ARCS, props.figureLevels, GANN_LEVELS.length + GANN_FAN_LINES.length)).filter((a) => a.visible)
      if (ext.showBackground !== false) {
        const opacity = (ext.backgroundOpacity ?? 20) / 100
        let prev: Coordinate[] = [origin]
        arcs.forEach((a, i) => {
          const ring = arcPoints(origin, end, a.x ?? 0, a.y ?? 0).map((p) => clampTo(p, origin, end))
          if (ring.length > 0) {
            figures.push({
              type: 'polygon',
              key: `arcFill_${i}`,
              ignoreEvent: true,
              attrs: { coordinates: [...ring, ...[...prev].reverse()] },
              styles: { style: 'fill', color: withAlpha(a.color, opacity) }
            })
            prev = ring
          }
        })
      }
      for (const [i, l] of levels.entries()) {
        if (!l.visible) continue
        const f = i / 5
        figures.push({ type: 'line', key: `v_${i}`, attrs: { coordinates: [{ x: origin.x + f * dx, y: origin.y }, { x: origin.x + f * dx, y: end.y }] }, styles: line(l) })
        figures.push({ type: 'line', key: `h_${i}`, attrs: { coordinates: [{ x: origin.x, y: origin.y + f * dy }, { x: end.x, y: origin.y + f * dy }] }, styles: line(l) })
      }
      for (const [i, l] of fanLines.entries()) {
        if (!l.visible) continue
        figures.push({ type: 'line', key: `fan_${i}`, attrs: { coordinates: [origin, fanLineEnd(origin, end, l.x ?? 1, l.y ?? 1)] }, styles: line(l) })
      }
      for (const [i, a] of arcs.entries()) {
        for (const [j, run] of arcRuns(origin, end, a.x ?? 0, a.y ?? 0).entries()) {
          if (run.length > 1) figures.push({ type: 'line', key: `arc_${i}_${j}`, attrs: { coordinates: run }, styles: line(a) })
        }
      }
      if (!fixed && ext.showRanges !== false) {
        const [p0, p1] = overlay.points
        if (typeof p0.value === 'number' && typeof p1.value === 'number' && typeof p0.dataIndex === 'number' && typeof p1.dataIndex === 'number') {
          const texts = gannRangeTexts(p1.value - p0.value, p1.dataIndex - p0.dataIndex, chart.getSymbol()?.pricePrecision ?? 2)
          const [left, right] = [Math.min(origin.x, end.x), Math.max(origin.x, end.x)]
          const [top, bottom] = [Math.min(origin.y, end.y), Math.max(origin.y, end.y)]
          const label = (key: string, x: number, y: number, text: string, align: 'left' | 'right', baseline: 'top' | 'bottom'): void => {
            figures.push({ type: 'text', key, ignoreEvent: true, attrs: { x, y, text, align, baseline }, styles: { color: GREY, size: 12, backgroundColor: 'transparent', borderSize: 0, paddingLeft: 0, paddingRight: 0 } })
          }
          label('range_price', left - LABEL_GAP, top - LABEL_GAP, texts.price, 'right', 'bottom')
          label('range_ratio', right + LABEL_GAP, top - LABEL_GAP, texts.ratio, 'left', 'bottom')
          label('range_bars', right + LABEL_GAP, bottom + LABEL_GAP, texts.bars, 'left', 'top')
        }
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.get
  }
}

export const gannSquareFactories: Array<() => OverlayTemplate> = [
  gannSquare('gannSquare', false),
  gannSquare('gannSquareFixed', true)
]
