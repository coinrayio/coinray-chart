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
 * Drawn like TV's own: zones that fade toward the entry, a live P&L band up
 * to the last close, a rounded frame, coloured level lines, segmented pill
 * labels and coloured price-axis labels.
 *
 * Money maths follows TV: risk amount = accountSize × risk% (or `risk`
 * itself in money mode), qty = risk amount / |entry − stop|, shown in lots
 * (rounded down); P&L = qty × (close at the right edge − entry); the pills' Amount
 * is the account after the target / stop (account + reward, account − risk).
 *
 * extendData: `{ accountSize = 1000, risk = 25, riskMode = 'percent' |
 * 'money', lotSize = 1, profitColor, stopColor (the zones' colour: the gradient
 * runs from 1.2x to 0.25x its alpha), showLabels = true, showPriceLabels = true,
 * compactStats = false, alwaysShowStats = false (off: every pill shows only
 * while hovered or selected, as in TV) }`. The level lines, pills and axis
 * labels take the stop / target colours (opaque), the entry's take lineColor.
 * Properties: lineColor, lineWidth, lineStyle (entry line), textColor and
 * textFontSize (the pills).
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import type Point from '../../common/Point'
import { merge, clone, isNumber } from '../../common/utils/typeChecks'
import { calcTextWidth } from '../../common/utils/canvas'
import { formatPrecision } from '../../common/utils/format'
import type ChartImp from '../../Chart'
import { scaleAlpha, withAlpha } from './tv/forecastData/common'
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
  showPriceLabels?: boolean
  compactStats?: boolean
  alwaysShowStats?: boolean
}

// TV defaults.
const PROFIT_ZONE = 'rgba(8, 153, 129, 0.2)'
const LOSS_ZONE = 'rgba(242, 54, 69, 0.2)'
const ENTRY_LINE = '#787B86'
const FRAME = 'rgba(67, 70, 81, 0.15)'
const PILL_FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'
const PILL_H = 20
const PILL_SIZE = 12
const PILL_GAP = 8
const PILL_PAD = 9
/** Pills sit this far past the target and stop lines. */
const PILL_OFFSET = 16
/** Default size of a freshly placed position, in pixels from the entry. */
const NEW_STOP_PX = 40
const NEW_TARGET_PX = 80
const NEW_WIDTH_PX = 160

/**
 * TV's position maths. `qty` is the raw size (risk amount / stop distance); the label shows it in
 * lots, rounded down (`lots`). `targetAmount` / `stopAmount` are the account after the target / stop
 * is hit, which is what TV's labels call Amount.
 */
export function positionStats (entry: number, stop: number, target: number, ext: PositionExtendData): { qty: number, lots: number, riskAmount: number, reward: number, ratio: number, targetAmount: number, stopAmount: number } {
  const accountSize = ext.accountSize ?? 1000
  const risk = ext.risk ?? 25
  // TV clamps a percent risk to 100% and a money risk to the account.
  const riskAmount = ext.riskMode === 'money' ? Math.min(risk, accountSize) : (accountSize * Math.min(risk, 100)) / 100
  const stopDistance = Math.abs(entry - stop)
  const qty = stopDistance > 0 ? riskAmount / stopDistance : 0
  const reward = qty * Math.abs(target - entry)
  return {
    qty,
    lots: Math.floor(qty / (ext.lotSize ?? 1) + 1e-9),
    riskAmount,
    reward,
    ratio: stopDistance > 0 ? Math.abs(target - entry) / stopDistance : 0,
    targetAmount: accountSize + reward,
    stopAmount: accountSize - riskAmount
  }
}

interface Figure { type: string, key?: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }

const fmtMoney = (n: number): string =>
  `${n < 0 ? '\u2212' : '+'}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Gradients need a 2D context to be made in, but not the one they're drawn
// on. None exists outside a browser (tests), where the zones fall back to flat.
/** `false` until first use. */
let gradientCtx: CanvasRenderingContext2D | null | false = false
function zoneFill (yFar: number, yEntry: number, color: string): string | CanvasGradient {
  if (gradientCtx === false) gradientCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (gradientCtx === null) return scaleAlpha(color, 0.75)
  const g = gradientCtx.createLinearGradient(0, yFar, 0, yEntry)
  g.addColorStop(0, scaleAlpha(color, 1.2))
  g.addColorStop(1, scaleAlpha(color, 0.25))
  return g
}

interface PillSegment { text: string, bold?: boolean, dim?: boolean }

/** A rounded pill of `|`-separated segments, centred on (cx, cy). */
function pill (cx: number, cy: number, segments: PillSegment[], bg: string, key: string, color: string, size: number): Figure[] {
  const widths = segments.map((seg) => calcTextWidth(seg.text, size, seg.bold === true ? 600 : 400, PILL_FONT))
  const w = widths.reduce((a, b) => a + b, 0) + PILL_GAP * (segments.length - 1) + PILL_PAD * 2
  const x = Math.round(cx - w / 2)
  const h = Math.max(PILL_H, Math.round(size * 1.7))
  const y = Math.round(cy - h / 2)
  const figures: Figure[] = [{
    type: 'rect',
    key,
    attrs: { x, y, width: w, height: h },
    styles: { style: 'fill', color: bg, borderRadius: h / 2 },
    ignoreEvent: true
  }]
  let tx = x + PILL_PAD
  segments.forEach((seg, i) => {
    figures.push({
      type: 'text',
      key: `${key}_${i}`,
      attrs: { x: tx, y: y + h / 2, text: seg.text, align: 'left', baseline: 'middle' },
      styles: { color: seg.dim === true ? scaleAlpha(color, 0.8) : color, size, family: PILL_FONT, weight: seg.bold === true ? 600 : 400, backgroundColor: 'transparent', paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
      ignoreEvent: true
    })
    tx += widths[i] + PILL_GAP
    if (i < segments.length - 1) {
      figures.push({
        type: 'rect',
        attrs: { x: tx - PILL_GAP / 2 - 0.5, y: y + 5, width: 1, height: h - 10 },
        styles: { style: 'fill', color: 'rgba(255, 255, 255, 0.35)' },
        ignoreEvent: true
      })
    }
  })
  return figures
}
const fmtAmount = (n: number): string => String(Number(n.toFixed(2)))

export const position = (side: PositionSide) => (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()
  const dir = side === 'long' ? 1 : -1

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const newProps = clone(properties.get(id) ?? {}) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }
  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: side === 'long' ? 'longPosition' : 'shortPosition',
    // One click; the rest comes from completeDrawing.
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    // Our own, coloured per level (see createYAxisFigures).
    needDefaultYAxisFigure: false,
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
      const store = chart.getChartStore()
      // Unselected, only the three lines grab the position, so the shaded
      // box doesn't steal hovers and clicks from the candles and drawings under it.
      const selected = store.getClickOverlayInfo().overlay?.id === overlay.id || store.isOverlaySelected(overlay.id)
      const zone = (yFar: number, color: string | CanvasGradient, key: string): Figure => ({
        type: 'rect',
        key,
        attrs: { x: left, y: Math.min(yFar, e.y), width, height: Math.abs(yFar - e.y) },
        styles: { style: 'fill', color, borderSize: 0 },
        ignoreEvent: !selected
      })
      const level = (y: number, color: string, key: string, size = 1.5, dashed = false): Figure => ({
        type: 'line', key, attrs: { coordinates: [{ x: left, y }, { x: left + width, y }] }, styles: { color, size, style: dashed ? 'dashed' : 'solid', dashedValue: props.lineDashedValue ?? [4, 4] }
      })
      const top = Math.min(t.y, s.y)
      const profitZone = ext.profitColor ?? PROFIT_ZONE
      const stopZone = ext.stopColor ?? LOSS_ZONE
      // Lines, pills and axis labels wear the zone colours, opaque.
      const profitSolid = withAlpha(profitZone, 1)
      const stopSolid = withAlpha(stopZone, 1)
      const figures: Figure[] = [
        zone(t.y, zoneFill(t.y, e.y, profitZone), 'profit'),
        zone(s.y, zoneFill(s.y, e.y, stopZone), 'stop')
      ]

      const pts = overlay.points
      const entryPrice = pts[0]?.value
      const stopPrice = pts[1]?.value
      const targetPrice = pts[2]?.value
      const priced = isNumber(entryPrice) && isNumber(stopPrice) && isNumber(targetPrice)
      const stats = priced ? positionStats(entryPrice, stopPrice, targetPrice, ext) : null

      // Live progress: shade the part of the move the last close has covered.
      // TV marks it to the close of the bar under the right edge (the last bar, when that lies past the data).
      const dataList = chart.getDataList()
      const endIndex = isNumber(pts[3]?.dataIndex) ? pts[3].dataIndex : dataList.length - 1
      const lastClose = dataList[Math.max(0, Math.min(dataList.length - 1, endIndex))]?.close
      let pnl = 0
      if (priced && stats !== null && isNumber(lastClose)) {
        const mark = lastClose
        pnl = dir * (mark - entryPrice) * stats.qty
        const yLast = (chart.convertToPixel({ value: lastClose }, { paneId: overlay.paneId }) as Partial<Coordinate>).y
        if (isNumber(yLast)) {
          const inProfit = pnl >= 0
          const limit = inProfit ? t.y : s.y
          const yEnd = Math.abs(yLast - e.y) > Math.abs(limit - e.y) ? limit : yLast
          const c = inProfit ? profitSolid : stopSolid
          figures.push(
            { type: 'rect', key: 'progress', attrs: { x: left, y: Math.min(e.y, yEnd), width, height: Math.abs(yEnd - e.y) }, styles: { style: 'fill', color: withAlpha(c, 0.18) }, ignoreEvent: true },
            { type: 'line', key: 'progress_line', attrs: { coordinates: [{ x: left, y: yEnd }, { x: left + width, y: yEnd }] }, styles: { color: withAlpha(c, 0.9), size: 1, style: 'dashed', dashedValue: [2, 3] }, ignoreEvent: true }
          )
        }
      }

      figures.push(
        { type: 'rect', key: 'frame', attrs: { x: left, y: top, width, height: Math.max(t.y, s.y) - top }, styles: { style: 'stroke', borderColor: FRAME, borderSize: 1, borderRadius: 4 }, ignoreEvent: true },
        level(t.y, profitSolid, 'target_line', props.lineWidth ?? 1.5),
        level(s.y, stopSolid, 'stop_line', props.lineWidth ?? 1.5),
        level(e.y, props.lineColor ?? ENTRY_LINE, 'entry', props.lineWidth ?? 1, props.lineStyle === 'dashed')
      )
      if (ext.showLabels === false || !priced || stats === null) return figures
      const active = selected || store.getHoverOverlayInfo().overlay?.id === overlay.id
      // TV: the pills show while hovered or selected, or always when asked.
      if (ext.alwaysShowStats !== true && !active) return figures

      const precision = chart.getChartStore().getSymbol()?.pricePrecision ?? 2
      const { lots, ratio, targetAmount, stopAmount } = stats
      const tick = 10 ** -precision
      const pct = (p: number): string => `${((Math.abs(p - entryPrice) / entryPrice) * 100).toFixed(2)}%`
      const cx = left + width / 2
      const compact = ext.compactStats === true
      const textColor = props.textColor ?? '#ffffff'
      const textSize = Number(props.textFontSize ?? PILL_SIZE)
      // Target and stop pills sit just outside their zone.
      const beyond = (y: number): number => (y <= e.y ? y - PILL_OFFSET : y + PILL_OFFSET)
      // TV's label: the distance from the entry, its percent and ticks, then the account after the level is hit.
      const pillLevel = (name: string, price: number, amount: number): PillSegment[] => [
        { text: name, bold: true },
        { text: `${Math.abs(price - entryPrice).toFixed(precision)} (${pct(price)}) ${Math.round(Math.abs(price - entryPrice) / tick)}` },
        ...(compact ? [] : [{ text: `Amount ${fmtAmount(amount)}`, dim: true }])
      ]
      figures.push(
        ...pill(cx, beyond(t.y), pillLevel('Target', targetPrice, targetAmount), withAlpha(profitSolid, 0.95), 'target_label', textColor, textSize),
        ...pill(cx, beyond(s.y), pillLevel('Stop', stopPrice, stopAmount), withAlpha(stopSolid, 0.95), 'stop_label', textColor, textSize)
      )
      figures.push(...pill(cx, e.y, [
        { text: `${side === 'long' ? 'LONG' : 'SHORT'} ${lots}`, bold: true },
        ...(compact ? [] : [{ text: `@ ${entryPrice.toFixed(precision)}` }]),
        { text: `R:R ${ratio.toFixed(2)}`, bold: true },
        ...(compact ? [] : [{ text: `P&L ${fmtMoney(pnl)}` }])
      ], withAlpha(pnl >= 0 ? profitSolid : stopSolid, 0.97, 0.8), 'center_label', textColor, textSize))
      return figures
    },
    // Target, entry and stop on the price axis, each in its level's colour.
    createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
      const ext = (overlay.extendData ?? {}) as PositionExtendData
      // TV shows the axis labels while selected even with the setting off.
      if (coordinates.length < 3 || (ext.showPriceLabels === false && !(chart as ChartImp).getChartStore().isOverlaySelected(overlay.id))) return []
      const fromZero = yAxis?.isFromZero() ?? false
      const precision = chart.getSymbol()?.pricePrecision ?? 2
      const fmt = (v: number): string => chart.getDecimalFold().format(chart.getThousandsSeparator().format(formatPrecision(v, precision)))
      const tag = (i: number, bg: string): Figure[] => {
        const v = overlay.points[i]?.value
        return isNumber(v)
          ? [{
              type: 'text',
              attrs: { x: fromZero ? 0 : bounding.width, y: coordinates[i].y, text: fmt(v), align: fromZero ? 'left' : 'right', baseline: 'middle' },
              styles: { color: '#ffffff', size: 12, backgroundColor: bg, borderRadius: 2, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 },
              ignoreEvent: true
            }]
          : []
      }
      return [...tag(2, withAlpha(ext.profitColor ?? PROFIT_ZONE, 1)), ...tag(0, properties.get(overlay.id)?.lineColor ?? ENTRY_LINE), ...tag(1, withAlpha(ext.stopColor ?? LOSS_ZONE, 1))]
    },
    setProperties,
    getProperties
  }
}
