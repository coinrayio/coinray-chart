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
 * Forecast and Projection — TradingView's `forecast` (LineToolPrediction) and
 * `projection` (LineToolProjection).
 *
 *   forecast    2 points: source, target. A quarter ellipse centred on the source's
 *               time and the target's price: it leaves the source horizontally
 *               and reaches the target vertically, ending in an arrowhead;
 *               a label sits on each end (TV's balloons).
 *   projection  3 points: centre, base, direction. The third point only sets
 *               a direction: it is pulled onto the same radius as the base
 *               (TV's ProjectionLinePaneView), and the wedge between the two
 *               radii is filled.
 *
 * Properties: lineColor, lineWidth, backgroundColor (projection fill),
 * textColor. forecast extendData: `{ sourceBackColor, sourceStrokeColor,
 * sourceTextColor, targetBackColor, targetStrokeColor, targetTextColor,
 * centersColor }`.
 */

import type Coordinate from '../../../../common/Coordinate'
import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { formatDuration } from '../../measure'
import { arrowHeadCoordinates } from '../../utils'
import { barIndex, propertyStore } from './common'
import type { Figure } from './common'

export interface ForecastExtendData {
  sourceBackColor?: string
  sourceStrokeColor?: string
  sourceTextColor?: string
  targetBackColor?: string
  targetStrokeColor?: string
  targetTextColor?: string
  centersColor?: string
}

// TV defaults.
const BLUE = '#2962FF'
const WHITE = '#ffffff'
const CENTERS = '#202020'
const PROJECTION_FILL = 'rgba(41, 98, 255, 0.2)'
const ARC_STEPS = 32
const LABEL_GAP = 8

/** The quarter ellipse from source `a` (horizontal tangent) to target `b` (vertical tangent). */
export function predictionArc (a: Coordinate, b: Coordinate, steps = ARC_STEPS): Coordinate[] {
  const out: Coordinate[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2)
    out.push({ x: a.x + (b.x - a.x) * Math.sin(t), y: b.y + (a.y - b.y) * Math.cos(t) })
  }
  return out
}

/**
 * Projection geometry: the direction point pulled onto the base radius, and
 * the arc between the two radii (shortest way round).
 */
export function projectionWedge (center: Coordinate, base: Coordinate, dir: Coordinate, steps = ARC_STEPS): { edge: Coordinate, arc: Coordinate[] } {
  const radius = Math.hypot(base.x - center.x, base.y - center.y)
  const a1 = Math.atan2(base.y - center.y, base.x - center.x)
  const a2 = Math.atan2(dir.y - center.y, dir.x - center.x)
  let sweep = a2 - a1
  if (sweep > Math.PI) sweep -= 2 * Math.PI
  if (sweep < -Math.PI) sweep += 2 * Math.PI
  const at = (a: number): Coordinate => ({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) })
  const arc: Coordinate[] = []
  for (let i = 0; i <= steps; i++) arc.push(at(a1 + (sweep * i) / steps))
  return { edge: at(a1 + sweep), arc }
}

const balloon = (x: number, y: number, text: string, baseline: CanvasTextBaseline, back: string, stroke: string, color: string, key: string): Figure => ({
  type: 'text',
  key,
  attrs: { x, y, text, align: 'center', baseline },
  styles: {
    color,
    size: 12,
    family: 'Helvetica Neue',
    weight: 'normal',
    backgroundColor: back,
    borderColor: stroke,
    borderSize: 2,
    borderRadius: 3,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 3,
    paddingBottom: 3,
    lineHeight: 1.35
  },
  ignoreEvent: true
})

export const forecast = (): ProOverlayTemplate => {
  const store = propertyStore()
  return {
    name: 'forecast',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: (params) => {
      const { chart, coordinates, overlay } = params as typeof params & { chart: ChartImp }
      if (coordinates.length < 2) return []
      const props = store.get(overlay.id)
      const ext = (overlay.extendData ?? {}) as ForecastExtendData
      const [a, b] = coordinates
      const color = props.lineColor ?? BLUE
      const arc = predictionArc(a, b)
      const figures: Figure[] = [
        { type: 'line', key: 'arc', attrs: { coordinates: arc }, styles: { color, size: props.lineWidth ?? 2, style: 'solid' } },
        { type: 'polygon', key: 'head', attrs: { coordinates: arrowHeadCoordinates(arc[arc.length - 2], b, Math.max(8, 4 * (props.lineWidth ?? 2))) }, styles: { style: 'fill', color } },
        { type: 'circle', key: 'target_dot', attrs: { x: b.x, y: b.y, r: 3 }, styles: { style: 'fill', color: ext.centersColor ?? CENTERS }, ignoreEvent: true }
      ]

      const pts = overlay.points
      const chartStore = chart.getChartStore()
      const precision = chartStore.getSymbol()?.pricePrecision ?? 2
      const v0 = pts[0]?.value
      const v1 = pts[1]?.value
      if (typeof v0 !== 'number' || typeof v1 !== 'number') return figures
      const i0 = barIndex(chart, pts[0])
      const i1 = barIndex(chart, pts[1])
      const bars = i0 !== null && i1 !== null ? Math.round(i1 - i0) : 0
      const ms = typeof pts[0].timestamp === 'number' && typeof pts[1].timestamp === 'number' ? pts[1].timestamp - pts[0].timestamp : 0
      const pct = v0 !== 0 ? ((v1 - v0) / v0) * 100 : 0
      // Source label sits on the far side of the source from the target, the target label past the target.
      const up = b.y <= a.y
      figures.push(
        balloon(a.x, up ? a.y + LABEL_GAP : a.y - LABEL_GAP, v0.toFixed(precision), up ? 'top' : 'bottom', ext.sourceBackColor ?? BLUE, ext.sourceStrokeColor ?? BLUE, ext.sourceTextColor ?? WHITE, 'source_label'),
        balloon(b.x, up ? b.y - LABEL_GAP : b.y + LABEL_GAP, `${v1.toFixed(precision)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)\n${bars} bars, ${formatDuration(ms)}`, up ? 'bottom' : 'top', ext.targetBackColor ?? BLUE, ext.targetStrokeColor ?? BLUE, ext.targetTextColor ?? WHITE, 'target_label')
      )
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}

export const projection = (): ProOverlayTemplate => {
  const store = propertyStore()
  return {
    name: 'projection',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const props = store.get(overlay.id)
      const line = { color: props.lineColor ?? BLUE, size: props.lineWidth ?? 1, style: 'solid' }
      const [c, base] = coordinates
      const figures: Figure[] = [{ type: 'line', key: 'base', attrs: { coordinates: [c, base] }, styles: line }]
      if (coordinates.length < 3) return figures
      const { edge, arc } = projectionWedge(c, base, coordinates[2])
      figures.push(
        { type: 'polygon', key: 'wedge', attrs: { coordinates: [c, ...arc] }, styles: { style: 'fill', color: props.backgroundColor ?? PROJECTION_FILL } },
        { type: 'line', key: 'edge', attrs: { coordinates: [c, edge] }, styles: line },
        { type: 'line', key: 'arc', attrs: { coordinates: arc }, styles: line }
      )
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
