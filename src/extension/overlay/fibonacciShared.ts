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
 *  ratio -> same colour across families. These are TradingView's
 *  own defaults. Unlisted ratios (user-added) fall back to
 *  `props.lineColor`. */
export const FIB_LEVEL_COLOURS: Record<string, string> = {
  0: FIB_ANCHOR_GREY,
  0.236: '#f23645',
  0.382: '#ff9800',
  0.5: '#4caf50',
  0.618: '#089981',
  0.786: '#00bcd4',
  1: FIB_ANCHOR_GREY,
  1.272: '#ff9800',
  1.414: '#f23645',
  1.618: '#2962ff',
  2: '#089981',
  2.272: '#ff9800',
  2.414: '#4caf50',
  2.618: '#f23645',
  3: '#00bcd4',
  3.272: FIB_ANCHOR_GREY,
  3.414: '#2962ff',
  3.618: '#9c27b0',
  4: '#f23645',
  4.236: '#e91e63',
  4.272: '#9c27b0',
  4.414: '#e91e63',
  4.618: '#ff9800',
  4.764: '#089981'
}

/** TradingView's level list for the line-based fibs, in its order: the
 *  first eleven draw by default, the rest are opt-in. */
export const FIB_TV_LEVELS: FigureLevel[] = [
  0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236,
  1.272, 1.414, 2.272, 2.414, 2, 3, 3.272, 3.414, 4, 4.272, 4.414, 4.618, 4.764
].map((value, i) => ({ value, enabled: i < 11, color: FIB_LEVEL_COLOURS[value] }))

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
  /** TV's "Text" row: whether the per-level custom text (`FigureLevel.text`) shows. */
  showText?: boolean
  /** Where the custom text sits, TV's `horzTextAlign` / `vertTextAlign`. Default center / middle. */
  levelTextAlignHorizontal?: 'left' | 'center' | 'right'
  levelTextAlignVertical?: 'top' | 'middle' | 'bottom'
  /** TV `fibLevelsBasedOnLogScale`: level prices interpolate in log space. */
  logScale?: boolean
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
  levelTextAlignHorizontal: 'left' | 'center' | 'right'
  levelTextAlignVertical: 'top' | 'middle' | 'bottom'
  logScale: boolean
  oneColor?: string
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
    backgroundOpacity: typeof ext.backgroundOpacity === 'number' ? ext.backgroundOpacity : 20,
    reverse: ext.reverse === true,
    showPrices: ext.showPrices !== false,
    showLevels: ext.showLevels !== false,
    levelFormat: ext.levelFormat === 'percent' ? 'percent' : 'values',
    showText: ext.showText !== false,
    levelTextAlignHorizontal: ext.levelTextAlignHorizontal ?? 'center',
    levelTextAlignVertical: ext.levelTextAlignVertical ?? 'middle',
    logScale: ext.logScale === true,
    oneColor: fibOneColor(extendData),
    diagonalColor: ext.diagonalColor,
    diagonalWidth: ext.diagonalWidth,
    diagonalStyle: ext.diagonalStyle,
    diagonalDashedValue: ext.diagonalDashedValue
  }
}

/** TV's "Use one color": the colour every level draws in, when the box is
 *  ticked (`useOneColor`); undefined otherwise. */
export const fibOneColor = (extendData: unknown): string | undefined => {
  const ext = (extendData ?? {}) as { useOneColor?: boolean, oneColor?: string }
  return ext.useOneColor === true ? ext.oneColor ?? FIB_ANCHOR_GREY : undefined
}

/** Stroke of the trend line (`diagonal`) every fib draws between its anchors.
 *  Reads only the diagonal fields; defaults are TV's: grey, 2px, dashed. */
export const diagonalStroke = (s: Pick<ResolvedFibSettings, 'diagonalColor' | 'diagonalWidth' | 'diagonalStyle' | 'diagonalDashedValue'>): Partial<LineStyle> => ({
  style: (s.diagonalStyle ?? 'dashed') as LineStyle['style'],
  size: s.diagonalWidth ?? 2,
  color: s.diagonalColor ?? FIB_ANCHOR_GREY,
  dashedValue: s.diagonalDashedValue ?? [4, 4]
})

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
  text?: string
  lineStyle?: FigureLevel['lineStyle']
  lineWidth?: number
  lineDashedValue?: number[]
}

/** Y for a level at `ratio` between the two anchors: linear in pixels, or, for
 *  TV's `fibLevelsBasedOnLogScale`, linear in ln(price) then mapped through
 *  the axis. Needs both prices positive; otherwise falls back to linear. */
export const fibLevelPosition = (
  ratio: number,
  far: { y: number },
  near: { y: number },
  farVal: number,
  nearVal: number,
  toY?: (price: number) => number
): { y: number, value: number } => {
  if (toY !== undefined && farVal > 0 && nearVal > 0) {
    const value = Math.exp(Math.log(farVal) + ratio * (Math.log(nearVal) - Math.log(farVal)))
    return { y: toY(value), value }
  }
  return { y: far.y + (near.y - far.y) * ratio, value: farVal + (nearVal - farVal) * ratio }
}

/** Base line style with a level's own style / width / dash laid over it. */
export const levelLineStyle = (base: Partial<LineStyle>, l: Pick<EnrichedFibLevel, 'color' | 'lineStyle' | 'lineWidth' | 'lineDashedValue'>): Partial<LineStyle> => ({
  ...base,
  color: l.color,
  ...(l.lineStyle !== undefined ? { style: l.lineStyle, dashedValue: l.lineDashedValue ?? base.dashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue } : {}),
  ...(l.lineWidth !== undefined ? { size: l.lineWidth } : {})
})

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
  /** Set to price → y to place levels in log space (`logScale`). */
  logToY?: (price: number) => number
  /** Paints every level in this colour (`fibOneColor`). */
  oneColor?: string
}): EnrichedFibLevel[] => {
  const { levels, anchorFar, anchorNear, valueFar, valueNear, precision, chart, lineColour, reverse, logToY, oneColor } = opts
  const swap = reverse
  const near = swap ? anchorFar : anchorNear
  const far = swap ? anchorNear : anchorFar
  const nearVal = swap ? valueFar : valueNear
  const farVal = swap ? valueNear : valueFar
  const decimalFold = chart.getDecimalFold()
  const thousandsSeparator = chart.getThousandsSeparator()
  return levels
    .map(level => {
      const percent = level.value
      const { y, value } = fibLevelPosition(percent, far, near, farVal, nearVal, logToY)
      const price = decimalFold.format(thousandsSeparator.format(value.toFixed(precision)))
      const color = oneColor ?? level.color ?? lineColour
      return { percent, y, price, color, text: level.text, lineStyle: level.lineStyle, lineWidth: level.lineWidth, lineDashedValue: level.lineDashedValue }
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
    styles: levelLineStyle(styles, l)
  }))

/** Ratio text — percent or decimal, per `levelFormat`. Extracted
 *  so the label-composer stays declarative. */
export const formatFibRatio = (percent: number, levelFormat: 'values' | 'percent'): string =>
  levelFormat === 'percent' ? `${(percent * 100).toFixed(2)}%` : String(+percent.toFixed(3))

/** Where a label sits: the x it anchors to and the canvas alignment that keeps
 *  the glyphs off the fib. 'left' / 'right' put the text OUTSIDE the fib width
 *  (past the left / right anchor) unless the fib is extended that way, then
 *  it runs inward; 'center' is centred inside. */
const labelPlacement = (
  hAlign: string,
  vAlign: string,
  leftX: number,
  rightX: number,
  settings: Pick<ResolvedFibSettings, 'extendLeft' | 'extendRight'>
): { x: number, align: CanvasTextAlign, baseline: CanvasTextBaseline } => {
  let align: CanvasTextAlign = 'center'
  if (hAlign === 'left') align = settings.extendLeft ? 'left' : 'right'
  else if (hAlign === 'right') align = settings.extendRight ? 'right' : 'left'
  return {
    x: hAlign === 'right' ? rightX : hAlign === 'center' ? (leftX + rightX) / 2 : leftX,
    align,
    baseline: vAlign === 'middle' ? 'middle' : vAlign === 'top' ? 'top' : 'bottom'
  }
}

/** Level labels — one text figure per enriched level, emitted when at least one
 *  of `showLevels` / `showPrices` is on (empty labels would be noise).
 *
 *  A level's custom text (TV's "Text" row: `showText`, `FigureLevel.text`) is
 *  placed by `levelTextAlign*`; where that is the same spot as the label the
 *  two share a figure, "0.236 · text", as TradingView draws them. */
export const buildLevelLabels = (
  enriched: EnrichedFibLevel[],
  leftX: number,
  rightX: number,
  settings: ResolvedFibSettings,
  props: DeepPartial<OverlayProperties>,
  labelStyles: Partial<TextStyle>
): FibFigureSpec[] => {
  const hAlign = props.textAlignHorizontal ?? 'left'
  const vAlign = props.textAlignVertical ?? 'middle'
  const withLabel = settings.showLevels || settings.showPrices
  const label = labelPlacement(hAlign, vAlign, leftX, rightX, settings)
  const custom = labelPlacement(settings.levelTextAlignHorizontal, settings.levelTextAlignVertical, leftX, rightX, settings)
  const sameSpot = hAlign === settings.levelTextAlignHorizontal && vAlign === settings.levelTextAlignVertical
  const figures: FibFigureSpec[] = []
  // One figure per label: TV paints each label in its own level's colour
  // (an explicit `textColor` still wins).
  const push = (key: string, l: EnrichedFibLevel, text: string, at: typeof label): void => {
    figures.push({
      type: 'text',
      key,
      isCheckEvent: false,
      attrs: { key, x: at.x, y: l.y, text, align: at.align, baseline: at.baseline },
      styles: { ...labelStyles, color: labelStyles.color ?? l.color }
    })
  }
  for (const l of enriched) {
    let content = ''
    if (settings.showLevels) content = formatFibRatio(l.percent, settings.levelFormat)
    if (settings.showPrices) content = content.length > 0 ? `${content} (${l.price})` : `(${l.price})`
    const text = settings.showText ? l.text ?? '' : ''
    if (withLabel && text !== '' && sameSpot) {
      push(`level_${l.percent}_text`, l, `${content} · ${text}`, label)
      continue
    }
    if (withLabel) push(`level_${l.percent}_text`, l, content, label)
    if (text !== '') push(`level_${l.percent}_custom`, l, text, custom)
  }
  return figures
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
  return {
    type: 'line',
    key: 'diagonal',
    attrs: { coordinates: [start, end] },
    styles: diagonalStroke(settings)
  }
}
