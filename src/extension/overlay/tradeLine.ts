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
 * Trade Line Overlay
 *
 * Each tradeLine renders TWO arrows:
 *
 * 1. MAIN ARROW — inside the candle body (one of three types):
 *    wide  — stroke_fill rect body + wider triangle head
 *    arrow — line-based stem + chevron head (smaller)
 *    tiny  — chevron head only (V for down, A for up — no stem)
 *
 * 2. LABEL ARROW — small indicator arrow between the text label and
 *    the candle, pointing toward the candle. Optional (showLabelArrow).
 *
 * Layout (sell/down example):
 *   "0.5 @2127.73"    ← text label above candle
 *        ↓             ← label arrow (optional)
 *      ┃   ┃           ← candle wick
 *   ┌──────────┐
 *   │    ▼     │       ← main arrow inside candle body
 *   └──────────┘
 */

import type DeepPartial from '../../common/DeepPartial'
import type Coordinate from '../../common/Coordinate'
import { isTransparent } from '../../common/utils/color'
import { isNumber, merge, clone } from '../../common/utils/typeChecks'
import type ChartImp from '../../Chart'
import { calcTextWidth } from '../../common/utils/canvas'

import type { ProOverlayTemplate } from './types'
import type { TradeLineProperties } from './tradeLineApi'
import { wideArrowOutline, BASE_BODY_H as WIDE_BODY_H, BASE_HEAD_H as WIDE_HEAD_H } from './tradeArrowGeometry'

// ---------------------------------------------------------------------------
// Default style constants
// ---------------------------------------------------------------------------

const defaultTradeLineStyle: Required<Omit<TradeLineProperties, 'timestamp' | 'price'>> = {
  direction: 'up',
  arrowType: 'wide',
  color: '#4CAF50',
  textColor: '#FFFFFF',
  text: '',
  textFontSize: 12,
  textGap: 2,
  gap: 4,
  showLabelArrow: true,
  borderColor: 'rgba(0, 0, 0, 0.85)'
}

// ---------------------------------------------------------------------------
// Arrow geometry constants — main arrows (inside candle body)
// ---------------------------------------------------------------------------

// Wide arrow: narrow rect body + wider triangle head (stroke_fill).
// Point geometry lives in `tradeArrowGeometry.ts` (`wideArrowOutline` over `wideArrowGeometry`) —
// the sole source of truth, also consumed outside this package via the
// `wideArrowGeometry` export in `src/index.ts`.

// Arrow (line-based): stem + chevron head — smaller than wide
const ARROW_LINE_W = 2
const ARROW_LINE_H = 6
const ARROW_HEAD_W = 7
const ARROW_HEAD_H = 4

// Tiny: filled triangle head only (no stem) — like a mini wide head
const TINY_HEAD_W = 10
const TINY_HEAD_H = 6

// Label indicator arrow (between text and candle)
const LABEL_HEAD_W = 6
const LABEL_HEAD_H = 4
const LABEL_LINE_W = 1.5
const LABEL_LINE_H = 4

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const tradeLine = (): ProOverlayTemplate => {
  let properties: DeepPartial<TradeLineProperties> = {}

  const _extRef: { data: DeepPartial<TradeLineProperties> | null } = { data: null }

  const prop = <K extends keyof TradeLineProperties>(key: K): TradeLineProperties[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defaults = defaultTradeLineStyle as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defaults[key]) as TradeLineProperties[K]
  }

  return {
    name: 'tradeLine',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,

    createPointFigures: ({ chart, coordinates, overlay }) => {
      const figures: FigureArray = []

      if (coordinates.length === 0) return []

      // Sync extendData
      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<TradeLineProperties>
        : null

      const direction = prop('direction') ?? 'up'
      const arrowType = prop('arrowType') ?? 'wide'
      const color = prop('color') ?? defaultTradeLineStyle.color
      const textColor = prop('textColor') ?? defaultTradeLineStyle.textColor
      const text = prop('text') ?? ''
      const gap = prop('gap') ?? defaultTradeLineStyle.gap
      const showLabelArrow = prop('showLabelArrow') ?? defaultTradeLineStyle.showLabelArrow

      // A fill belongs to the bar it happened in, so the arrow sits on that
      // candle's centre. The overlay's own x is the exact time (a fill 12s
      // into a 1m bar is drawn 0.2 of a bar right of the candle).
      const x = barCentreX(chart as ChartImp, overlay.points[0]?.timestamp) ?? coordinates[0].x
      // coordinates[0].y is the pixel Y of the `price` prop (or 0 fallback)
      const priceY = coordinates[0].y

      // -------------------------------------------------------------------
      // 1. MAIN ARROW — anchored at the specified price level
      //    The arrow TIP sits on the price; body extends away from it.
      // -------------------------------------------------------------------
      const mainTotalH = getArrowTotalHeight(arrowType)
      // buy (up): tip at priceY, body extends downward (away from tip)
      // sell (down): tip at priceY, body extends upward (away from tip)
      const mainTipY = priceY

      // A dark 1px outline keeps the arrow readable on a candle of its own colour.
      const borderColor = prop('borderColor') ?? defaultTradeLineStyle.borderColor
      if (arrowType === 'wide') {
        drawFilledArrow(figures, wideArrowOutline(x, mainTipY, direction), color, borderColor)
      } else if (arrowType === 'arrow') {
        drawLineArrow(figures, x, mainTipY, direction, color)
      } else {
        drawTinyArrow(figures, x, mainTipY, direction, color, borderColor)
      }

      // -------------------------------------------------------------------
      // Label arrow + text — positioned beyond the main arrow base
      //
      // Layout (buy/up):
      //   main arrow tip (priceY)
      //   main arrow base (priceY + totalH)
      //     ↕ gap
      //   label arrow tip
      //     ↕ labelTotalH
      //     ↕ textGap
      //   text
      // -------------------------------------------------------------------
      if (text.length > 0) {
        const textFontSize = prop('textFontSize') ?? defaultTradeLineStyle.textFontSize
        const textGap = prop('textGap') ?? defaultTradeLineStyle.textGap

        if (showLabelArrow) {
          // Label arrow tip starts gap px beyond the main arrow base
          const mainBaseY = direction === 'up' ? mainTipY + mainTotalH : mainTipY - mainTotalH
          drawLabelArrow(figures, x, direction === 'up' ? mainBaseY + gap : mainBaseY - gap, direction, color)
        }

        // Pushed further from the candle when it would cover another fill's label.
        const stack = labelStackOffset(chart as ChartImp, overlay.id)
        const textY = labelBaseY({ direction, arrowType, gap, textGap, showLabelArrow }, priceY) +
          (direction === 'up' ? stack : -stack)

        figures.push({
          type: 'editableText',
          key: 'text',
          attrs: {
            x,
            y: textY,
            text,
            align: 'center',
            baseline: direction === 'up' ? 'top' : 'bottom'
          },
          styles: { color: textColor, size: textFontSize }
        })
      }

      return figures
    },

    // -----------------------------------------------------------------------
    // Property management
    // -----------------------------------------------------------------------
    setProperties: (_properties: DeepPartial<TradeLineProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<TradeLineProperties>
    },

    getProperties: (_id: string): DeepPartial<TradeLineProperties> => properties
  }
}

// ---------------------------------------------------------------------------
// Arrow drawing helpers
// ---------------------------------------------------------------------------

type FigureArray = Array<{
  type: string
  key?: string
  attrs: Record<string, unknown>
  styles?: Record<string, unknown>
  ignoreEvent?: boolean
}>

function barCentreX (chart: ChartImp, timestamp: number | undefined): number | null {
  if (!isNumber(timestamp)) return null
  const store = chart.getChartStore()
  return store.dataIndexToCoordinate(Math.floor(store.timestampToFloatIndex(timestamp)))
}

interface LabelGeometry {
  direction: 'up' | 'down'
  arrowType: 'wide' | 'arrow' | 'tiny'
  gap: number
  textGap: number
  showLabelArrow: boolean
}

/** Y of the text's candle-side edge (its top for a buy, its bottom for a sell). */
function labelBaseY ({ direction, arrowType, gap, textGap, showLabelArrow }: LabelGeometry, priceY: number): number {
  let away = getArrowTotalHeight(arrowType) + gap
  if (showLabelArrow) away += LABEL_HEAD_H + LABEL_LINE_H + textGap
  return direction === 'up' ? priceY + away : priceY - away
}

// ---------------------------------------------------------------------------
// Label stacking — fills at (about) the same price on neighbouring bars, or
// several fills in one bar, would draw their labels on top of each other.
// Every trade line on the chart is laid out together, left to right, and a
// label that would cover one already placed moves further from the candle.
// One layout per draw pass: computed by the first trade line that asks,
// dropped in a microtask, so the rest of the pass reuses it.
// ---------------------------------------------------------------------------

const LABEL_SPACING = 2
const LABEL_PAD_X = 4

const stackLayouts = new WeakMap<ChartImp, Map<string, number>>()

function labelStackOffset (chart: ChartImp, id: string): number {
  let layout = stackLayouts.get(chart)
  if (layout === undefined) {
    layout = computeLabelStack(chart)
    stackLayouts.set(chart, layout)
    queueMicrotask(() => { stackLayouts.delete(chart) })
  }
  return layout.get(id) ?? 0
}

interface PlacedLabel { id: string, sign: 1 | -1, left: number, right: number, near: number, height: number }

function computeLabelStack (chart: ChartImp): Map<string, number> {
  const offsets = new Map<string, number>()
  const overlays = chart.getOverlays({ name: 'tradeLine' })
  if (overlays.length < 2) return offsets
  const store = chart.getChartStore()
  const yAxis = chart.getDrawPaneById('candle_pane')?.getAxisComponent()
  if (yAxis === undefined) return offsets

  const labels: PlacedLabel[] = []
  for (const overlay of overlays) {
    const ext = (overlay.extendData ?? {}) as Partial<TradeLineProperties>
    const text = ext.text ?? ''
    const point = overlay.points[0]
    if (!overlay.visible || text.length === 0 || !isNumber(point?.timestamp) || !isNumber(point.value)) continue
    const direction = ext.direction ?? defaultTradeLineStyle.direction
    const size = ext.textFontSize ?? defaultTradeLineStyle.textFontSize
    const x = store.dataIndexToCoordinate(Math.floor(store.timestampToFloatIndex(point.timestamp)))
    const halfW = calcTextWidth(text, size) / 2 + LABEL_PAD_X
    const near = labelBaseY({
      direction,
      arrowType: ext.arrowType ?? defaultTradeLineStyle.arrowType,
      gap: ext.gap ?? defaultTradeLineStyle.gap,
      textGap: ext.textGap ?? defaultTradeLineStyle.textGap,
      showLabelArrow: ext.showLabelArrow ?? defaultTradeLineStyle.showLabelArrow
    }, yAxis.convertToPixel(point.value))
    labels.push({ id: overlay.id, sign: direction === 'up' ? 1 : -1, left: x - halfW, right: x + halfW, near, height: size })
  }
  // Left to right; a stable sort, so on one bar the earlier fill keeps its place.
  labels.sort((a, b) => a.left + a.right - b.left - b.right)

  const placed: PlacedLabel[] = []
  for (const label of labels) {
    // Measured along the label's own direction (down for a buy, up for a
    // sell), each label spans [start, start + height].
    const base = label.near * label.sign
    let shift = 0
    let moved = true
    while (moved) {
      moved = false
      const start = base + shift
      for (const other of placed) {
        if (other.sign !== label.sign || other.right <= label.left || other.left >= label.right) continue
        const otherStart = other.near * other.sign
        if (start < otherStart + other.height + LABEL_SPACING && otherStart < start + label.height + LABEL_SPACING) {
          shift = otherStart + other.height + LABEL_SPACING - base
          moved = true
          break
        }
      }
    }
    if (shift > 0) offsets.set(label.id, shift)
    placed.push({ ...label, near: label.near + label.sign * shift })
  }
  return offsets
}

function getArrowTotalHeight (arrowType: 'wide' | 'arrow' | 'tiny'): number {
  return arrowType === 'wide'
    ? WIDE_HEAD_H + WIDE_BODY_H
    : arrowType === 'arrow'
      ? ARROW_HEAD_H + ARROW_LINE_H
      : TINY_HEAD_H
}

// ---------------------------------------------------------------------------
// Main arrow types 1 and 3: WIDE and TINY — one filled outline with a border
// ---------------------------------------------------------------------------

function drawFilledArrow (figures: FigureArray, outline: Coordinate[], color: string, borderColor: string): void {
  const bordered = borderColor !== '' && !isTransparent(borderColor)
  figures.push({
    type: 'polygon',
    key: 'main-head',
    attrs: { coordinates: outline },
    styles: { style: 'stroke_fill', color, borderColor: bordered ? borderColor : color, borderSize: 1 }
  })
}

// ---------------------------------------------------------------------------
// Main arrow type 2: ARROW — line stem + chevron head
// ---------------------------------------------------------------------------

function drawLineArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfHeadW = ARROW_HEAD_W / 2
  const sign = direction === 'up' ? 1 : -1
  const headBase = tipY + ARROW_HEAD_H * sign

  // Single 3-point polyline for chevron head: left-arm → tip → right-arm
  figures.push({
    type: 'line',
    key: 'main-head',
    attrs: {
      coordinates: [
        { x: x - halfHeadW, y: headBase },
        { x, y: tipY },
        { x: x + halfHeadW, y: headBase }
      ]
    },
    styles: { color, size: ARROW_LINE_W }
  })
  // Vertical stem from tip extending away
  figures.push({
    type: 'line',
    key: 'main-stem',
    attrs: {
      coordinates: [
        { x, y: tipY },
        { x, y: tipY + (ARROW_HEAD_H + ARROW_LINE_H) * sign }
      ]
    },
    styles: { color, size: ARROW_LINE_W }
  })
}

// ---------------------------------------------------------------------------
// Main arrow type 3: TINY — filled triangle head only (no stem)
// ---------------------------------------------------------------------------

function drawTinyArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string, borderColor: string): void {
  const halfHeadW = TINY_HEAD_W / 2
  const headBase = direction === 'up' ? tipY + TINY_HEAD_H : tipY - TINY_HEAD_H
  drawFilledArrow(figures, [
    { x, y: tipY },
    { x: x - halfHeadW, y: headBase },
    { x: x + halfHeadW, y: headBase }
  ], color, borderColor)
}

// ---------------------------------------------------------------------------
// LABEL ARROW — small indicator between text and candle
// ---------------------------------------------------------------------------

function drawLabelArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfHeadW = LABEL_HEAD_W / 2
  const sign = direction === 'up' ? 1 : -1
  const headBase = tipY + LABEL_HEAD_H * sign

  // Single 3-point polyline for chevron
  figures.push({
    type: 'line',
    key: 'label-head',
    attrs: {
      coordinates: [
        { x: x - halfHeadW, y: headBase },
        { x, y: tipY },
        { x: x + halfHeadW, y: headBase }
      ]
    },
    styles: { color, size: LABEL_LINE_W }
  })
  // Short stem extending away from tip
  figures.push({
    type: 'line',
    key: 'label-stem',
    attrs: {
      coordinates: [
        { x, y: tipY },
        { x, y: tipY + (LABEL_HEAD_H + LABEL_LINE_H) * sign }
      ]
    },
    styles: { color, size: LABEL_LINE_W }
  })
}

export default tradeLine
