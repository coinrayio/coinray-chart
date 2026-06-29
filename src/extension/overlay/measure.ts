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
 * Measure overlay — TV-style "drag a box and read the diff".
 *
 *   * Two clicks define opposite corners of a rectangle.
 *   * Translucent fill: green when the drag went UP (price2 >
 *     price1), red when DOWN.
 *   * Vertical + horizontal arrows cross the centre, pointing in
 *     the directions the user dragged. Convey direction at a
 *     glance even when the rect is small.
 *   * Centre label shows three lines: absolute price diff,
 *     percentage change, and bar count between the two clicks.
 *   * Single-use — the parent host auto-removes the overlay on
 *     the next chart click after the rect lands, so it reads as
 *     a transient measurement, not a persistent annotation.
 *   * Not persisted across reloads (the parent gates this via the
 *     `save: false` flag on the overlay create call).
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import type ChartImp from '../../Chart'

const FILL_UP = 'rgba(38, 166, 154, 0.18)'
const FILL_DOWN = 'rgba(239, 83, 80, 0.18)'
const ARROW_COLOR = 'rgba(255, 255, 255, 0.95)'
const ARROW_BODY_WIDTH = 1.5
const ARROW_HEAD = 8
const LABEL_BG = 'rgba(30, 33, 41, 0.95)'
const LABEL_TEXT_COLOR = '#ffffff'
const LABEL_FONT_SIZE = 12
const LABEL_FONT_FAMILY = 'Helvetica Neue'
const LABEL_LINE_HEIGHT = 1.35
const LABEL_PADDING_H = 10
const LABEL_PADDING_V = 6

/** Number with the active symbol's price-precision — positive
 *  values print without an explicit `+` to match TV. */
function formatPrice (n: number, precision: number): string {
  return n.toFixed(precision)
}

/**
 * Pip scaling. Pip is an instrument-specific concept (1 pip
 * = 0.0001 for FX majors, 0.01 for JPY pairs, 1 for spot crypto)
 * and the engine doesn't carry per-symbol pipSize metadata. We
 * heuristic off `pricePrecision`:
 *
 *   * precision >= 3 → FX-shaped — pip = 10^-(precision-1)
 *     (5-precision majors → 0.0001, 3-precision JPY → 0.01).
 *     `delta / pip` = `delta * 10^(precision-1)`.
 *   * precision  <= 2 → stocks / crypto with whole-number-ish
 *     prices — pip = 1, so the printed value equals the raw
 *     price delta. Matches TV for BTC.
 *
 * Hosts that need different per-instrument pip sizes can override
 * by reading their own metadata and overriding the figure label,
 * but the default keeps the common cases right.
 */
function pipValue (delta: number, precision: number): number {
  if (precision >= 3) {
    return delta * Math.pow(10, precision - 1)
  }
  return delta
}

/**
 * Compact relative-time formatter. Matches TV's measure label
 * cadence: `9h 5m`, `-2d 4h`, `38m 12s`, `12s`. Sign passes
 * through naturally (positive durations omit `+`, negative keep
 * the `-`).
 */
function formatDuration (ms: number): string {
  if (ms === 0) return '0s'
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(ms)
  const sec = Math.floor(abs / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (day > 0) return `${sign}${day}d ${hr % 24}h`
  if (hr > 0) return `${sign}${hr}h ${min % 60}m`
  if (min > 0) return `${sign}${min}m ${sec % 60}s`
  return `${sign}${sec}s`
}

const measure: OverlayTemplate = {
  name: 'measure',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  lock: true,
  mode: 'normal',

  createPointFigures: (params) => {
    // Narrow `chart` to the impl class so we can reach the chart
    // store for the active symbol's precision. Same pattern Pin
    // and Signpost use.
    const { chart, coordinates, overlay } = params as typeof params & { chart: ChartImp }
    if (coordinates.length < 2) return []

    const a = coordinates[0]
    const b = coordinates[1]
    const points = overlay.points
    if (points.length < 2) return []
    const p1 = points[0]
    const p2 = points[1]
    const v1 = typeof p1.value === 'number' ? p1.value : null
    const v2 = typeof p2.value === 'number' ? p2.value : null
    const d1 = typeof p1.dataIndex === 'number' ? p1.dataIndex : null
    const d2 = typeof p2.dataIndex === 'number' ? p2.dataIndex : null
    const t1 = typeof p1.timestamp === 'number' ? p1.timestamp : null
    const t2 = typeof p2.timestamp === 'number' ? p2.timestamp : null
    if (v1 === null || v2 === null || d1 === null || d2 === null) return []

    // Active symbol drives price precision + pip scaling. Falls
    // back to 2 digits when no symbol is set (e.g. early bootstrap
    // before the host wires its datafeed).
    const chartStore = chart.getChartStore()
    const sym = chartStore.getSymbol()
    const pricePrecision = sym?.pricePrecision ?? 2

    // Direction: vertical = up when price went UP between click 1
    // and click 2; horizontal = right when click 2 is to the
    // right of click 1.
    const goingUp = v2 >= v1
    const goingRight = b.x >= a.x
    const fill = goingUp ? FILL_UP : FILL_DOWN

    const left = Math.min(a.x, b.x)
    const right = Math.max(a.x, b.x)
    const top = Math.min(a.y, b.y)
    const bottom = Math.max(a.y, b.y)
    const width = right - left
    const height = bottom - top
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2

    const figures: OverlayFigure[] = []

    // 1. Rect — fill only. Borderless per the spec: rect should
    //    read as a translucent measurement zone, not a boxed-in
    //    annotation.
    figures.push({
      type: 'rect',
      attrs: { x: left, y: top, width, height },
      styles: { style: 'fill', color: fill, borderSize: 0 },
      ignoreEvent: true
    })

    // 2. Vertical arrow through the horizontal centre. Body
    //    spans top → bottom of the rect; head points in the
    //    drag direction (price-up = head at the top).
    if (height > ARROW_HEAD * 2) {
      const yHeadTip = goingUp ? top : bottom
      const yHeadBase = goingUp ? top + ARROW_HEAD : bottom - ARROW_HEAD
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: cx, y: top }, { x: cx, y: bottom }] },
        styles: { color: ARROW_COLOR, size: ARROW_BODY_WIDTH, style: 'solid' },
        ignoreEvent: true
      })
      figures.push({
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: cx, y: yHeadTip },
            { x: cx - ARROW_HEAD / 2, y: yHeadBase },
            { x: cx + ARROW_HEAD / 2, y: yHeadBase }
          ]
        },
        styles: { style: 'fill', color: ARROW_COLOR },
        ignoreEvent: true
      })
    }

    // 3. Horizontal arrow through the vertical centre.
    if (width > ARROW_HEAD * 2) {
      const xHeadTip = goingRight ? right : left
      const xHeadBase = goingRight ? right - ARROW_HEAD : left + ARROW_HEAD
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: left, y: cy }, { x: right, y: cy }] },
        styles: { color: ARROW_COLOR, size: ARROW_BODY_WIDTH, style: 'solid' },
        ignoreEvent: true
      })
      figures.push({
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: xHeadTip, y: cy },
            { x: xHeadBase, y: cy - ARROW_HEAD / 2 },
            { x: xHeadBase, y: cy + ARROW_HEAD / 2 }
          ]
        },
        styles: { style: 'fill', color: ARROW_COLOR },
        ignoreEvent: true
      })
    }

    // 4. Centre label — two lines matching TV:
    //      L1: <price-diff> (<pct%>), <pip-diff>
    //      L2: <bars> bars, <duration>
    //    Bars + duration are signed so a left-going drag reads
    //    as -109 bars / -9h 5m. Price + percentage carry their
    //    natural sign (no explicit `+` on positive values).
    const priceDelta = v2 - v1
    const pctDelta = v1 !== 0 ? (priceDelta / v1) * 100 : 0
    const pip = pipValue(priceDelta, pricePrecision)
    const bars = d2 - d1
    const durationMs = (t1 !== null && t2 !== null) ? (t2 - t1) : 0
    const line1 = `${formatPrice(priceDelta, pricePrecision)} (${pctDelta.toFixed(2)}%), ${pip.toFixed(1)}`
    const line2 = `${bars} bars, ${formatDuration(durationMs)}`
    const labelText = `${line1}\n${line2}`
    figures.push({
      type: 'text',
      attrs: {
        x: cx,
        y: cy,
        text: labelText,
        align: 'center',
        baseline: 'middle'
      },
      styles: {
        color: LABEL_TEXT_COLOR,
        size: LABEL_FONT_SIZE,
        family: LABEL_FONT_FAMILY,
        weight: 'normal',
        // Background only — borderless per spec.
        backgroundColor: LABEL_BG,
        borderSize: 0,
        borderColor: 'transparent',
        borderRadius: 4,
        paddingLeft: LABEL_PADDING_H,
        paddingRight: LABEL_PADDING_H,
        paddingTop: LABEL_PADDING_V,
        paddingBottom: LABEL_PADDING_V,
        // 1.35 line-height — the `text` figure now honours the
        // multiplier so multi-line labels read at a proper book
        // weight instead of glued together.
        lineHeight: LABEL_LINE_HEIGHT
      },
      ignoreEvent: true
    })

    return figures
  }
}

export default measure
