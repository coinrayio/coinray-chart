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
 *               a label sits on each end (TV's balloons). Once the target bar
 *               is in the data, a Success / Failure strip joins the target
 *               balloon: success when that bar's own high (low, for a down
 *               forecast) reached the target, failure when it did not and it is
 *               not the last bar.
 *   projection  3 points: centre, base, direction. The third point only sets
 *               a direction: it is pulled onto the same radius as the base
 *               (TV's ProjectionLinePaneView), and the wedge between the two
 *               radii is filled.
 *
 * Properties: lineColor, lineWidth, backgroundColor (projection fill, at the
 * centre; extendData.backgroundColor2 at the rim, TV's radial gradient), textColor. forecast extendData: `{ sourceBackColor, sourceStrokeColor,
 * sourceTextColor, targetBackColor, targetStrokeColor, targetTextColor,
 * centersColor }`.
 */

import type Coordinate from '../../../../common/Coordinate'
import type ChartImp from '../../../../Chart'
import type { ProOverlayTemplate } from '../../types'
import { arrowHeadCoordinates } from '../../utils'
import { calcTextWidth } from '../../../../common/utils/canvas'
import { formatTimestampByTemplate } from '../../../../common/utils/format'
import { barIndex, gradientContext, propertyStore, timeSpan } from './common'
import type { Figure } from './common'

export interface ForecastExtendData {
  sourceBackColor?: string
  sourceStrokeColor?: string
  sourceTextColor?: string
  targetBackColor?: string
  targetStrokeColor?: string
  targetTextColor?: string
  successTextColor?: string
  successBackColor?: string
  failureTextColor?: string
  failureBackColor?: string
  centersColor?: string
}

// TV defaults.
const BLUE = '#2962FF'
const SOURCE_BACK = 'rgba(41, 98, 255, 0.9)'
const SUCCESS = '#4caf50'
const FAILURE = '#F23645'
const PROJECTION_LINE = '#9598A1'
const WHITE = '#ffffff'
const CENTERS = '#202020'
const PROJECTION_FILL = 'rgba(41, 98, 255, 0.2)'
const PROJECTION_FILL_2 = 'rgba(156, 39, 176, 0.2)'
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

const BALLOON_FONT = 'Helvetica Neue'
const BALLOON_SIZE = 12

const balloon = (x: number, y: number, text: string, baseline: CanvasTextBaseline, back: string, stroke: string, color: string, key: string): Figure => ({
  type: 'text',
  key,
  attrs: { x, y, text, align: 'center', baseline },
  styles: {
    color,
    size: BALLOON_SIZE,
    family: BALLOON_FONT,
    weight: 'normal',
    style: 'stroke_fill',
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
      const dash = { style: props.lineStyle ?? 'solid', dashedValue: props.lineDashedValue ?? [4, 4] }
      const figures: Figure[] = [
        { type: 'line', key: 'arc', attrs: { coordinates: arc }, styles: { color, size: props.lineWidth ?? 2, ...dash } },
        { type: 'polygon', key: 'head', attrs: { coordinates: arrowHeadCoordinates(arc[arc.length - 2], b, Math.max(8, 4 * (props.lineWidth ?? 2))) }, styles: { style: 'fill', color } },
        { type: 'circle', key: 'target_dot', attrs: { x: b.x, y: b.y, r: 3 }, styles: { style: 'fill', color: ext.centersColor ?? CENTERS }, ignoreEvent: true }
      ]

      const pts = overlay.points
      const chartStore = chart.getChartStore()
      const precision = chartStore.getSymbol()?.pricePrecision ?? 2
      const v0 = pts[0]?.value
      const v1 = pts[1]?.value
      if (typeof v0 !== 'number' || typeof v1 !== 'number') return figures
      const i1 = barIndex(chart, pts[1])
      const ms = typeof pts[0].timestamp === 'number' && typeof pts[1].timestamp === 'number' ? pts[1].timestamp - pts[0].timestamp : 0
      const pct = v0 !== 0 ? ((v1 - v0) / Math.abs(v0)) * 100 : 0
      const delta = v1 - v0
      const period = chartStore.getPeriod()
      const dateOnly = period !== null && ['day', 'week', 'month', 'year'].includes(period.type)
      const when = (ts: number | undefined): string => typeof ts === 'number' ? formatTimestampByTemplate(chartStore.getDateTimeFormat(), ts, dateOnly ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm') : ''
      // TV's two-line balloons: source `price / date`, target `change (pct) in span / price date`.
      const sourceText = `${v0.toFixed(precision)}\n${when(pts[0].timestamp)}`
      const targetText = `${delta.toFixed(precision)} (${pct.toFixed(2)}%) in ${timeSpan(ms)}\n${v1.toFixed(precision)} ${when(pts[1].timestamp)}`
      // Source label sits on the far side of the source from the target, the target label past the target.
      const up = b.y <= a.y
      figures.push(
        balloon(a.x, up ? a.y + LABEL_GAP : a.y - LABEL_GAP, sourceText, up ? 'top' : 'bottom', ext.sourceBackColor ?? SOURCE_BACK, ext.sourceStrokeColor ?? BLUE, ext.sourceTextColor ?? WHITE, 'source_label'),
        balloon(b.x, up ? b.y - LABEL_GAP : b.y + LABEL_GAP, targetText, up ? 'bottom' : 'top', ext.targetBackColor ?? BLUE, ext.targetStrokeColor ?? BLUE, ext.targetTextColor ?? WHITE, 'target_label')
      )
      // Outcome, decided on the target bar alone (TV's recalculateStateByData).
      const data = chart.getDataList()
      const bar = i1 === null ? undefined : data[Math.round(i1)]
      if (bar !== undefined && i1 !== null) {
        const reached = up ? bar.high >= v1 : bar.low <= v1
        if (reached || Math.round(i1) !== data.length - 1) {
          const [label, back, color] = reached ? ['\u2713 SUCCESS', ext.successBackColor ?? SUCCESS, ext.successTextColor ?? WHITE] : ['\u2715 FAILURE', ext.failureBackColor ?? FAILURE, ext.failureTextColor ?? WHITE]
          // Sits on the balloon's outer edge, as wide as the balloon.
          const lines = targetText.split('\n')
          const balloonW = Math.max(...lines.map((l) => calcTextWidth(l, BALLOON_SIZE, 'normal', BALLOON_FONT))) + 16
          const pad = Math.max(6, (balloonW - calcTextWidth(label, BALLOON_SIZE, 'bold', BALLOON_FONT)) / 2)
          const balloonH = lines.length * BALLOON_SIZE * 1.35 + 10
          figures.push({
            type: 'text',
            key: 'status',
            attrs: { x: b.x, y: up ? b.y - LABEL_GAP - balloonH - 4 : b.y + LABEL_GAP + balloonH + 4, text: label, align: 'center', baseline: up ? 'bottom' : 'top' },
            styles: { color, size: BALLOON_SIZE, family: BALLOON_FONT, weight: 'bold', backgroundColor: back, borderColor: back, borderSize: 0, borderRadius: 4, paddingLeft: pad, paddingRight: pad, paddingTop: 2, paddingBottom: 2 },
            ignoreEvent: true
          })
        }
      }
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
      const line = { color: props.lineColor ?? PROJECTION_LINE, size: props.lineWidth ?? 2, style: props.lineStyle ?? 'solid', dashedValue: props.lineDashedValue ?? [4, 4] }
      const [c, base] = coordinates
      const figures: Figure[] = [{ type: 'line', key: 'base', attrs: { coordinates: [c, base] }, styles: line }]
      if (coordinates.length < 3) return figures
      const { edge, arc } = projectionWedge(c, base, coordinates[2])
      // TV fills the wedge with a radial gradient, first colour at the centre, second at the rim.
      const inner = props.backgroundColor ?? PROJECTION_FILL
      const outer = (overlay.extendData as { backgroundColor2?: string } | undefined)?.backgroundColor2 ?? PROJECTION_FILL_2
      const ctx = gradientContext()
      let fill: string | CanvasGradient = inner
      if (ctx !== null) {
        fill = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.hypot(base.x - c.x, base.y - c.y))
        fill.addColorStop(0, inner)
        fill.addColorStop(1, outer)
      }
      figures.push(
        { type: 'polygon', key: 'wedge', attrs: { coordinates: [c, ...arc] }, styles: { style: 'fill', color: fill } },
        { type: 'line', key: 'edge', attrs: { coordinates: [c, edge] }, styles: line },
        { type: 'line', key: 'arc', attrs: { coordinates: arc }, styles: line }
      )
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}
