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
 * Shared engine helpers for the fibonacci overlay family
 * (retracement / channel / extension). Every template's Style
 * tab exposes the same feature set (Trend Line diagonal,
 * background bands, reverse, prices/levels/format, text
 * alignment); this module holds the pieces that don't differ
 * between templates, so each template file only owns its own
 * geometry (anchor mapping, x-limits).
 */

import type { LineStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import type DeepPartial from '../../common/DeepPartial'
import type { FigureLevel, OverlayProperties } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'

/** Grey used as the default colour for the "anchor" ratios
 *  (0 and 1) across every fib family. These ratios ARE the
 *  anchor points, so they read as boundary markers rather than
 *  levels of their own — grey keeps them unobtrusive against
 *  the coloured intermediates. Same value the circle + fan use
 *  for level-1 / anchor-0, so families feel consistent when
 *  more than one is drawn on the same chart. */
export const FIB_ANCHOR_GREY = '#787b86'

/** Default colour per fib ratio, shared by every line-based fib
 *  family (retracement / channel / segment / extension). Same
 *  ratio → same colour across families so a user reading a
 *  0.618 retracement and a 0.618 extension on the same chart
 *  sees the same yellow, matching how the circle family paints
 *  its 0.618 ring. Unlisted ratios (user-added or non-default)
 *  fall back to `props.lineColor`. */
export const FIB_LEVEL_COLOURS: Record<string, string> = {
  0: FIB_ANCHOR_GREY,
  0.236: '#f44336',
  0.382: '#ff9800',
  0.5: '#ffc107',
  0.618: '#fdd835',
  0.786: '#cddc39',
  1: FIB_ANCHOR_GREY,
  1.618: '#4caf50',
  2.618: '#00bcd4',
  3.618: '#2196f3',
  4.236: '#5c6bc0',
  4.618: '#9c27b0'
}

/** Lookup a default fib-level colour by ratio. Extracted so
 *  the various family `LEVELS` constants can build with a
 *  one-liner per row instead of stringifying the numeric key
 *  each time. Returns undefined when the ratio isn't in the
 *  palette so callers can fall through to `props.lineColor`
 *  at render time. */
export const fibLevelDefaultColour = (ratio: number): string | undefined =>
  FIB_LEVEL_COLOURS[ratio]

/** All extendData fields the fib Style tab exposes (ALTD-1894). */
export interface FibExtendData {
  extendLeft?: boolean
  extendRight?: boolean
  showDiagonal?: boolean
  diagonalColor?: string
  diagonalWidth?: number
  diagonalStyle?: string
  diagonalDashedValue?: number[]
  showBackground?: boolean
  backgroundOpacity?: number
  reverse?: boolean
  showPrices?: boolean
  showLevels?: boolean
  levelFormat?: 'values' | 'percent'
  showText?: boolean
}

/** Every extendData flag resolved with defaults matching the
 *  classic-fib behaviour, so a template can drop the raw
 *  extendData bag through `resolveFibSettings` once and pass
 *  the concrete values to the downstream helpers. */
export interface ResolvedFibSettings {
  extendLeft: boolean
  extendRight: boolean
  showDiagonal: boolean
  showBackground: boolean
  backgroundOpacity: number
  reverse: boolean
  showPrices: boolean
  showLevels: boolean
  levelFormat: 'values' | 'percent'
  showText: boolean
  diagonalColor?: string
  diagonalWidth?: number
  diagonalStyle?: string
  diagonalDashedValue?: number[]
}

export const resolveFibSettings = (extendData: unknown): ResolvedFibSettings => {
  const ext = (extendData ?? {}) as FibExtendData
  return {
    extendLeft: ext.extendLeft === true,
    extendRight: ext.extendRight === true,
    // Diagonal defaults ON to match TV — same call the retracement
    // template makes so all three fib overlays render their
    // trend line without a settings visit.
    showDiagonal: ext.showDiagonal !== false,
    // Background defaults ON at a faint 10 % tint — matches the
    // circle family's out-of-box look and gives users the level
    // grouping right after drop. Same opt-out pattern as
    // showDiagonal so an explicit `false` in extendData wins.
    showBackground: ext.showBackground !== false,
    backgroundOpacity: typeof ext.backgroundOpacity === 'number' ? ext.backgroundOpacity : 10,
    reverse: ext.reverse === true,
    showPrices: ext.showPrices !== false,
    showLevels: ext.showLevels !== false,
    levelFormat: ext.levelFormat === 'values' ? 'values' : 'percent',
    showText: ext.showText !== false,
    diagonalColor: ext.diagonalColor,
    diagonalWidth: ext.diagonalWidth,
    diagonalStyle: ext.diagonalStyle,
    diagonalDashedValue: ext.diagonalDashedValue
  }
}

/** Coerce any CSS colour string to `rgba(r, g, b, alpha)` with
 *  the given alpha (0-1), overriding whatever alpha the input
 *  carried. Handles hex, CSS Level 3 (comma-separated
 *  `rgb`/`rgba`) AND CSS Level 4 (space-separated `rgb`/`rgba
 *  with / alpha`) syntaxes. Level 4 support is load-bearing:
 *  chroma-js v3 (the host's Color picker) emits Level 4 by
 *  default, so any picked colour arrives space-separated and a
 *  comma-only regex would silently no-op. */
export const withAlpha = (colour: string, alpha: number): string => {
  const a = Math.max(0, Math.min(1, alpha))
  if (colour.startsWith('#')) {
    const raw = colour.slice(1)
    const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw
    if (full.length !== 6) return colour
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    if ([r, g, b].some(v => Number.isNaN(v))) return colour
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(colour)
  if (match !== null) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${a})`
  }
  return colour
}

export interface EnrichedFibLevel {
  percent: number
  y: number
  price: string
  color: string
}

/** Compute each enabled level's rendered y, formatted price,
 *  and effective colour (per-level override → props.lineColor
 *  → engine default). Sorted ascending by y so downstream
 *  band-rendering walks a canonical top-to-bottom order.
 *
 *  `reverse` swaps the anchor / value pairs — level 0 sits at
 *  `anchorFar` normally, at `anchorNear` when reversed.
 *  Templates hand in the "far" and "near" pairs based on their
 *  own point → level mapping. */
export const buildEnrichedLevels = (opts: {
  levels: FigureLevel[]
  anchorFar: { x: number, y: number }
  anchorNear: { x: number, y: number }
  valueFar: number
  valueNear: number
  precision: number
  chart: { getDecimalFold: () => { format: (v: string) => string }, getThousandsSeparator: () => { format: (v: string) => string } }
  lineColour: string
  reverse: boolean
}): EnrichedFibLevel[] => {
  const { levels, anchorFar, anchorNear, valueFar, valueNear, precision, chart, lineColour, reverse } = opts
  const swap = reverse
  const near = swap ? anchorFar : anchorNear
  const far = swap ? anchorNear : anchorFar
  const nearVal = swap ? valueFar : valueNear
  const farVal = swap ? valueNear : valueFar
  const yDif = near.y - far.y
  const valueDif = nearVal - farVal
  const decimalFold = chart.getDecimalFold()
  const thousandsSeparator = chart.getThousandsSeparator()
  return levels
    .map(level => {
      const percent = level.value
      const y = far.y + yDif * percent
      const rawPrice = (farVal + valueDif * percent).toFixed(precision)
      const price = decimalFold.format(thousandsSeparator.format(rawPrice))
      const color = level.color ?? lineColour
      return { percent, y, price, color }
    })
    .sort((a, b) => a.y - b.y)
}

/** Base spec for any figure a fib template emits. Concrete
 *  templates cast into their own template-specific figure
 *  shape via `as unknown as ...` at return time; this local
 *  alias just keeps the helpers agnostic. */
export interface FibFigureSpec {
  type: string
  key?: string
  ignoreEvent?: boolean
  isCheckEvent?: boolean
  attrs: unknown
  styles?: Partial<LineStyle> | Partial<TextStyle> | Partial<PolygonStyle>
}

/** One filled polygon per gap between adjacent enriched levels.
 *  Fill colour is derived from the LOWER level's colour (the
 *  band belongs to that level) and the slider alpha is
 *  applied via `withAlpha` — the level colour's own alpha is
 *  ignored so the Style-tab Background slider stays
 *  authoritative regardless of what the level colour carries. */
export const buildBackgroundBands = (
  enriched: EnrichedFibLevel[],
  leftX: number,
  rightX: number,
  backgroundOpacity: number
): FibFigureSpec[] => {
  if (enriched.length < 2) return []
  const figures: FibFigureSpec[] = []
  for (let i = 0; i < enriched.length - 1; i++) {
    const top = enriched[i]
    const bot = enriched[i + 1]
    const tint = withAlpha(bot.color, backgroundOpacity / 100)
    figures.push({
      type: 'polygon',
      key: `bg_${top.percent}_${bot.percent}`,
      ignoreEvent: true,
      attrs: {
        coordinates: [
          { x: leftX, y: top.y },
          { x: rightX, y: top.y },
          { x: rightX, y: bot.y },
          { x: leftX, y: bot.y }
        ]
      },
      styles: { style: 'fill', color: tint }
    })
  }
  return figures
}

/** Level lines — one line FIGURE per enriched level so each
 *  can carry its own stroke colour. The canvas line figure
 *  reads `styles.color` once per figure and applies it to every
 *  segment in `attrs`, so batching multiple levels into a
 *  single figure would force all of them to share one colour;
 *  fanning out is the only way per-level colour reaches the
 *  canvas without an engine change. Width / style / dash still
 *  come from the shared `styles` bag so a Style-tab thickness
 *  change moves every ring together. */
export const buildLevelLines = (
  enriched: EnrichedFibLevel[],
  leftX: number,
  rightX: number,
  styles: Partial<LineStyle>
): FibFigureSpec[] =>
  enriched.map(l => ({
    type: 'line',
    key: `level_${l.percent}`,
    attrs: { coordinates: [{ x: leftX, y: l.y }, { x: rightX, y: l.y }] },
    styles: { ...styles, color: l.color }
  }))

/** Ratio text — percent or decimal, per `levelFormat`. Extracted
 *  so the label-composer stays declarative. */
export const formatFibRatio = (percent: number, levelFormat: 'values' | 'percent'): string =>
  levelFormat === 'percent' ? `${(percent * 100).toFixed(1)}%` : percent.toFixed(3)

/** Level labels — one text figure per enriched level, emitted
 *  only when `showText` AND at least one of `showLevels` /
 *  `showPrices` is on (empty labels would be noise).
 *
 *  `textAlignHorizontal` picks the x anchor from the level
 *  segment's leftX / midpoint / rightX; `textAlignVertical`
 *  maps to canvas baseline. */
export const buildLevelLabels = (
  enriched: EnrichedFibLevel[],
  leftX: number,
  rightX: number,
  settings: ResolvedFibSettings,
  props: DeepPartial<OverlayProperties>,
  labelStyles: Partial<TextStyle>
): FibFigureSpec | null => {
  if (!settings.showText || (!settings.showLevels && !settings.showPrices)) return null
  const hAlign = props.textAlignHorizontal ?? 'left'
  const vAlign = props.textAlignVertical ?? 'top'
  const textX = hAlign === 'right' ? rightX : hAlign === 'center' ? (leftX + rightX) / 2 : leftX
  // 'left' / 'right' put the text OUTSIDE the fib width (past
  // the left / right anchor). The anchor stays at the endpoint;
  // canvas text-align flips so glyphs run AWAY from the fib.
  // 'center' keeps the natural centred behaviour inside.
  let canvasAlign: CanvasTextAlign = 'center'
  if (hAlign === 'left') canvasAlign = 'right'
  else if (hAlign === 'right') canvasAlign = 'left'
  const baseline: CanvasTextBaseline = vAlign === 'middle' ? 'middle' : vAlign === 'bottom' ? 'top' : 'bottom'
  const texts = enriched.map(l => {
    let content = ''
    if (settings.showLevels) content = formatFibRatio(l.percent, settings.levelFormat)
    if (settings.showPrices) content = content.length > 0 ? `${content} (${l.price})` : `(${l.price})`
    return {
      key: `level_${l.percent}_text`,
      x: textX,
      y: l.y,
      text: content,
      align: canvasAlign,
      baseline
    }
  })
  return {
    type: 'text',
    isCheckEvent: false,
    attrs: texts,
    styles: labelStyles
  }
}

/** Diagonal line from `start` to `end`. Stroke reads only from
 *  extendData's diagonal-specific fields — no fallback to
 *  `props.lineColor` etc, so changing the general Line row
 *  never bleeds into the Trend Line. */
export const buildDiagonal = (
  start: { x: number, y: number },
  end: { x: number, y: number },
  settings: ResolvedFibSettings
): FibFigureSpec | null => {
  if (!settings.showDiagonal) return null
  const dColor = settings.diagonalColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
  const dWidth = settings.diagonalWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth
  const dStyle = (settings.diagonalStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle) as LineStyle['style']
  const dDashed = settings.diagonalDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
  return {
    type: 'line',
    key: 'diagonal',
    attrs: { coordinates: [start, end] },
    styles: { style: dStyle, size: dWidth, color: dColor, dashedValue: dDashed }
  }
}
