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
 * Long Position / Short Position — TradingView's `long_position` and
 * `short_position` (risk/reward tool).
 *
 * One click places the entry; `completeDrawing` then adds the other three
 * anchors, so a saved position always has four points:
 *
 *   0 entry  — left edge, entry price
 *   1 stop   — left edge, stop price
 *   2 target — left edge, target price
 *   3 end    — right edge, entry price
 *
 * Every handle drags on its own axis only (stop/target: price, end: time,
 * entry: both, with stop/target following its time). Dragging the body moves
 * all four, like any overlay.
 *
 * Money maths follows TV: risk amount = accountSize × risk% (or `risk`
 * itself in money mode), qty = risk amount / |entry − stop| / lotSize.
 *
 * extendData: `{ accountSize = 1000, risk = 25, riskMode = 'percent' |
 * 'money', lotSize = 1, profitColor, stopColor, showLabels = true }`.
 * Properties: lineColor (entry line), textColor, textFontSize.
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import type Point from '../../common/Point'
import { merge, clone } from '../../common/utils/typeChecks'
import type ChartImp from '../../Chart'
import type { OverlayProperties, ProOverlayTemplate } from './types'

export type PositionSide = 'long' | 'short'

export interface PositionExtendData {
  accountSize?: number
  risk?: number
  riskMode?: 'percent' | 'money'
  lotSize?: number
  profitColor?: string
  stopColor?: string
  showLabels?: boolean
}

// TV defaults.
const PROFIT = 'rgba(8, 153, 129, 0.2)'
const STOP = 'rgba(242, 54, 69, 0.2)'
const PROFIT_LABEL = 'rgba(8, 153, 129, 1)'
const STOP_LABEL = 'rgba(242, 54, 69, 1)'
const CENTER_LABEL = 'rgba(88, 88, 88, 1)'
const ENTRY_LINE = '#787B86'
/** Default size of a freshly placed position, in pixels from the entry. */
const NEW_STOP_PX = 40
const NEW_TARGET_PX = 80
const NEW_WIDTH_PX = 160

/** Quantity, money at risk and money at target for a position. */
export function positionStats (entry: number, stop: number, target: number, ext: PositionExtendData): { qty: number, riskAmount: number, reward: number, ratio: number } {
  const accountSize = ext.accountSize ?? 1000
  const risk = ext.risk ?? 25
  const riskAmount = ext.riskMode === 'money' ? risk : (accountSize * risk) / 100
  const stopDistance = Math.abs(entry - stop)
  const qty = stopDistance > 0 ? riskAmount / stopDistance / (ext.lotSize ?? 1) : 0
  const reward = qty * Math.abs(target - entry) * (ext.lotSize ?? 1)
  return { qty, riskAmount, reward, ratio: stopDistance > 0 ? Math.abs(target - entry) / stopDistance : 0 }
}

interface Figure { type: string, key?: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }

const fmtAmount = (n: number): string => (Math.round(n * 100) / 100).toString()
const fmtQty = (n: number): string => (n >= 1000 ? n.toFixed(0) : n >= 1 ? n.toFixed(3) : n.toPrecision(4))

export const position = (side: PositionSide) => (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()
  const dir = side === 'long' ? 1 : -1

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const newProps = clone(properties.get(id) ?? {}) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }
  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  const label = (x: number, y: number, text: string, bg: string, baseline: CanvasTextBaseline, props: DeepPartial<OverlayProperties>, key: string): Figure => ({
    type: 'text',
    key,
    attrs: { x, y, text, align: 'center', baseline },
    styles: {
      color: props.textColor ?? '#ffffff',
      size: props.textFontSize ?? 12,
      family: 'Helvetica Neue',
      weight: 'normal',
      backgroundColor: bg,
      borderSize: 0,
      borderColor: 'transparent',
      borderRadius: 2,
      paddingLeft: 6,
      paddingRight: 6,
      paddingTop: 3,
      paddingBottom: 3,
      lineHeight: 1.35
    },
    ignoreEvent: true
  })

  return {
    name: side === 'long' ? 'longPosition' : 'shortPosition',
    // One click; the rest comes from completeDrawing.
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    completeDrawing: ({ overlay, chart }) => {
      if (overlay.points.length >= 4) return
      const entry = overlay.points[0]
      const at = chart.convertToPixel(entry, { paneId: overlay.paneId }) as Partial<Coordinate>
      if (typeof at.x !== 'number' || typeof at.y !== 'number') return
      const [stop, target, end] = chart.convertFromPixel([
        { x: at.x, y: at.y + dir * NEW_STOP_PX },
        { x: at.x, y: at.y - dir * NEW_TARGET_PX },
        { x: at.x + NEW_WIDTH_PX, y: at.y }
      ], { paneId: overlay.paneId }) as Array<Partial<Point>>
      overlay.points.push(
        { timestamp: entry.timestamp, dataIndex: entry.dataIndex, value: stop.value },
        { timestamp: entry.timestamp, dataIndex: entry.dataIndex, value: target.value },
        { timestamp: end.timestamp, dataIndex: end.dataIndex, value: entry.value }
      )
    },
    performEventPressedMove: ({ points, performPointIndex }) => {
      if (points.length < 4) return
      const [entry, stop, target, end] = points
      // The right edge moves in time only, at the entry price.
      end.value = entry.value
      if (performPointIndex === 3) return
      // Stop and target live on the entry's time; a dragged one snaps back to it.
      for (const p of [stop, target]) {
        p.timestamp = entry.timestamp
        p.dataIndex = entry.dataIndex
      }
    },
    createPointFigures: (params) => {
      const { chart, coordinates, overlay } = params as typeof params & { chart: ChartImp }
      const props = properties.get(overlay.id) ?? {}
      const ext = (overlay.extendData ?? {}) as PositionExtendData
      if (coordinates.length === 0) return []
      const e = coordinates[0]
      // While placing (one point), preview at the default size.
      const s = coordinates[1] ?? { x: e.x, y: e.y + dir * NEW_STOP_PX }
      const t = coordinates[2] ?? { x: e.x, y: e.y - dir * NEW_TARGET_PX }
      const r = coordinates[3] ?? { x: e.x + NEW_WIDTH_PX, y: e.y }
      const left = Math.min(e.x, r.x)
      const width = Math.abs(r.x - e.x)
      const zone = (y0: number, y1: number, color: string, key: string): Figure => ({
        type: 'rect',
        key,
        attrs: { x: left, y: Math.min(y0, y1), width, height: Math.abs(y1 - y0) },
        styles: { style: 'fill', color, borderSize: 0 }
      })
      const figures: Figure[] = [
        zone(e.y, t.y, ext.profitColor ?? PROFIT, 'profit'),
        zone(e.y, s.y, ext.stopColor ?? STOP, 'stop'),
        { type: 'line', key: 'entry', attrs: { coordinates: [{ x: left, y: e.y }, { x: left + width, y: e.y }] }, styles: { color: props.lineColor ?? ENTRY_LINE, size: props.lineWidth ?? 1, style: 'solid' } }
      ]
      if (ext.showLabels === false) return figures

      const pts = overlay.points
      const entryPrice = pts[0]?.value
      const stopPrice = pts[1]?.value
      const targetPrice = pts[2]?.value
      if (typeof entryPrice !== 'number' || typeof stopPrice !== 'number' || typeof targetPrice !== 'number') return figures

      const precision = chart.getChartStore().getSymbol()?.pricePrecision ?? 2
      const { qty, riskAmount, reward, ratio } = positionStats(entryPrice, stopPrice, targetPrice, ext)
      const pct = (p: number): string => ((Math.abs(p - entryPrice) / entryPrice) * 100).toFixed(2)
      const cx = left + width / 2
      // Labels sit outside each zone: target past the target edge, stop past the stop edge.
      const beyond = (y: number, other: number): { y: number, baseline: CanvasTextBaseline } =>
        y <= other ? { y: y - 4, baseline: 'bottom' } : { y: y + 4, baseline: 'top' }
      const tPos = beyond(t.y, e.y)
      const sPos = beyond(s.y, e.y)
      figures.push(
        label(cx, tPos.y, `Target: ${targetPrice.toFixed(precision)} (${pct(targetPrice)}%), Amount: ${fmtAmount(reward)}`, PROFIT_LABEL, tPos.baseline, props, 'target_label'),
        label(cx, sPos.y, `Stop: ${stopPrice.toFixed(precision)} (${pct(stopPrice)}%), Amount: ${fmtAmount(riskAmount)}`, STOP_LABEL, sPos.baseline, props, 'stop_label'),
        label(cx, e.y, `Risk/Reward Ratio: ${ratio.toFixed(2)}\nQty: ${fmtQty(qty)}`, CENTER_LABEL, 'middle', props, 'center_label')
      )
      return figures
    },
    setProperties,
    getProperties
  }
}
