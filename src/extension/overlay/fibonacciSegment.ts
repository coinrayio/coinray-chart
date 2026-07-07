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

import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'

import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'

import type { LineAttrs } from '../figure/line'
import type { TextAttrs } from '../figure/text'

import { FIBONACCI_RETRACEMENT_LEVELS } from './fibonacciLine'

/** Coerce any CSS colour string to `rgba(r, g, b, alpha)` with
 *  the given alpha (0-1), overriding whatever alpha the input
 *  carried. Handles `#RGB`, `#RRGGBB`, and both CSS Color
 *  Level 3 (`rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`) and
 *  CSS Color Level 4 (`rgb(255 0 0)`, `rgba(255 0 0 / 0.5)`)
 *  syntaxes.
 *
 *  Level-4 space-separated support is load-bearing: chroma-js
 *  v3 (used by the host's Color picker) emits Level-4 syntax
 *  by default, so a level colour picked in the modal arrives
 *  as `rgba(255 0 0 / 0.5)`. A comma-only regex would silently
 *  no-op and the band would keep the level colour's alpha
 *  instead of the slider's — visible as the fib background
 *  suddenly ignoring the transparency slider once the user
 *  touches any colour picker.
 *
 *  Falls back to the raw input for unrecognised formats so we
 *  never emit an obviously-broken colour string. Alpha is
 *  clamped to [0, 1] so a stray 200% doesn't produce an
 *  invalid value. */
const withAlpha = (colour: string, alpha: number): string => {
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
  // Grab the first three numeric components regardless of
  // whether they're separated by commas (Level 3) or spaces
  // (Level 4). `[\s,]+` swallows any mix of whitespace + commas
  // between components, so `rgba(255 , 0 ,0)` also works.
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(colour)
  if (match !== null) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${a})`
  }
  return colour
}

const fibonacciSegment = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const fbLinesStyle = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: props.lineStyle ?? 'solid',
    size: props.lineWidth,
    color: props.lineColor ?? props.borderColor,
    dashedValue: props.lineDashedValue
  })

  const textStyle = (props: DeepPartial<OverlayProperties>): Partial<TextStyle> => ({
    color: props.textColor,
    family: props.textFont,
    size: props.textFontSize,
    weight: props.textFontWeight,
    // Italic: same wire-up as segment / horizontalRayLine so the
    // Style-tab Text toggle actually leans the labels.
    fontStyle: props.textFontStyle,
    backgroundColor: props.textBackgroundColor,
    paddingLeft: props.textPaddingLeft,
    paddingRight: props.textPaddingRight,
    paddingTop: props.textPaddingTop,
    paddingBottom: props.textPaddingBottom
  })

  return {
    name: 'fibonacciSegment',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay, chart, yAxis }) => {
      const props = properties.get(overlay.id) ?? {}
      // ALTD-1894 phase 3 — the Style-tab controls live on
      // `extendData`. All optional; defaults resolve to "classic
      // fib retracement" (levels + prices, no diagonal, no
      // background) so overlays saved before this phase render
      // unchanged.
      const ext = (overlay.extendData ?? {}) as {
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
      const extendLeft = ext.extendLeft === true
      const extendRight = ext.extendRight === true
      const reverse = ext.reverse === true
      // Diagonal defaults ON — matches TV's fib retracement
      // default. Only false when the user explicitly ticks it
      // off. Old saved overlays that predate the field render
      // WITH the diagonal now; if that surprises anyone, the
      // Style-tab checkbox turns it back off.
      const showDiagonal = ext.showDiagonal !== false
      const showBackground = ext.showBackground === true
      const backgroundOpacity = typeof ext.backgroundOpacity === 'number' ? ext.backgroundOpacity : 20
      const showPrices = ext.showPrices !== false
      const showLevels = ext.showLevels !== false
      const levelFormat = ext.levelFormat === 'values' ? 'values' : 'percent'
      const showText = ext.showText !== false

      const figures: Array<{
        type: string
        key?: string
        ignoreEvent?: boolean
        isCheckEvent?: boolean
        attrs: unknown
        styles?: Partial<LineStyle> | Partial<TextStyle> | Partial<PolygonStyle>
      }> = []

      if (coordinates.length <= 1) {
        return figures
      }

      let precision = 0
      const symbol = chart.getSymbol()
      if ((yAxis?.isInCandle() ?? true) && symbol != null) {
        precision = symbol.pricePrecision
      } else {
        precision = SymbolDefaultPrecisionConstants.PRICE
        const indicators = chart.getIndicators({ paneId: overlay.paneId })
        indicators.forEach(indicator => {
          precision = Math.max(precision, indicator.precision)
        })
      }

      const leftX = extendLeft ? 0 : Math.min(coordinates[0].x, coordinates[1].x)
      const rightX = extendRight ? bounding.width : Math.max(coordinates[0].x, coordinates[1].x)

      // Reverse swaps the anchor semantics — level 0 sits at
      // point 0 instead of point 1, and price interpolation
      // flips accordingly. Everything downstream (line render,
      // text, background bands) still walks the same enriched-
      // levels list, so no downstream branch needs to know.
      const anchorFar = reverse ? coordinates[0] : coordinates[1]
      const anchorNear = reverse ? coordinates[1] : coordinates[0]
      const valueFar = reverse ? (overlay.points[0]?.value ?? 0) : (overlay.points[1]?.value ?? 0)
      const valueNear = reverse ? (overlay.points[1]?.value ?? 0) : (overlay.points[0]?.value ?? 0)
      const yDif = anchorNear.y - anchorFar.y
      const valueDif = valueNear - valueFar

      const enabledLevels = ((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_RETRACEMENT_LEVELS)
        .filter(l => l.enabled === true)

      const decimalFold = chart.getDecimalFold()
      const thousandsSeparator = chart.getThousandsSeparator()

      // Enrich each enabled level with its resolved y position,
      // formatted price, and effective colour (per-level override
      // → lineColor fallback → engine default). Sort ascending by
      // y so background-band rendering has a canonical order.
      const enrichedLevels = enabledLevels
        .map(level => {
          const percent = level.value ?? 0
          const y = anchorFar.y + yDif * percent
          const rawPrice = (valueFar + valueDif * percent).toFixed(precision)
          const price = decimalFold.format(thousandsSeparator.format(rawPrice))
          const color = level.color ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
          return { percent, y, price, color }
        })
        .sort((a, b) => a.y - b.y)

      // Background bands — filled polygons between consecutive
      // enriched levels. Fill colour is derived from the LOWER
      // level's colour (the band belongs to that level) at the
      // Style-tab opacity slider. Pushed before the line figures
      // so the strokes render on top of the tints.
      if (showBackground && enrichedLevels.length >= 2) {
        for (let i = 0; i < enrichedLevels.length - 1; i++) {
          const top = enrichedLevels[i]
          const bot = enrichedLevels[i + 1]
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
      }

      // Level lines — one line per enriched level, keyed for
      // per-level colour overrides via the host's figureStyles
      // map (host's LevelsSection writes `level_${percent}`).
      const lines: LineAttrs[] = enrichedLevels.map(l => ({
        key: `level_${l.percent}`,
        coordinates: [{ x: leftX, y: l.y }, { x: rightX, y: l.y }]
      }))
      figures.push({
        type: 'line',
        attrs: lines,
        styles: fbLinesStyle(props)
      })

      // Level labels — only emitted when the master `showText`
      // is on AND at least one of the ratio / price toggles is
      // on (empty labels would be noise). Ratio format follows
      // `levelFormat`; horizontal / vertical alignment follow
      // `textAlignHorizontal` / `textAlignVertical`.
      if (showText && (showLevels || showPrices)) {
        const hAlign = props.textAlignHorizontal ?? 'left'
        const vAlign = props.textAlignVertical ?? 'top'
        const textX = hAlign === 'right' ? rightX : hAlign === 'center' ? (leftX + rightX) / 2 : leftX
        const baseline: CanvasTextBaseline = vAlign === 'middle' ? 'middle' : vAlign === 'bottom' ? 'top' : 'bottom'

        const texts: TextAttrs[] = enrichedLevels.map(l => {
          let content = ''
          if (showLevels) {
            content = levelFormat === 'percent'
              ? `${(l.percent * 100).toFixed(1)}%`
              : l.percent.toFixed(3)
          }
          if (showPrices) {
            content = content.length > 0 ? `${content} (${l.price})` : `(${l.price})`
          }
          return {
            key: `level_${l.percent}_text`,
            x: textX,
            y: l.y,
            text: content,
            align: hAlign,
            baseline
          }
        })
        figures.push({
          type: 'text',
          isCheckEvent: false,
          attrs: texts,
          styles: textStyle(props)
        })
      }

      // Diagonal — the two-anchor trend line, rendered on top of
      // levels + labels so it stays visible when they cluster.
      // Deliberately skips the `props.lineColor` fallback: the
      // Style-tab general Line-colour picker drives the level
      // lines; the diagonal owns a separate `diagonalColor` on
      // extendData and falls back only to the engine default.
      // Changing lineColor never bleeds into the diagonal.
      if (showDiagonal) {
        // Diagonal reads its stroke fields off extendData — no
        // fallback to `props.lineColor` / `props.lineWidth` /
        // etc. The Style-tab Trend Line row's colour picker
        // line variant is the ONLY input; changing the general
        // Line row's picker never bleeds into the diagonal.
        // Defaults resolve to engine constants so a picker the
        // user has never opened still produces a sane stroke.
        const dColor = ext.diagonalColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
        const dWidth = ext.diagonalWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth
        // extendData carries `diagonalStyle` as a plain string
        // (that's what the modal writes); coerce to the LineType
        // enum shape LineStyle expects at the boundary.
        const dStyle = (ext.diagonalStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle) as LineStyle['style']
        const dDashed = ext.diagonalDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
        figures.push({
          type: 'line',
          key: 'diagonal',
          attrs: { coordinates: [coordinates[0], coordinates[1]] },
          styles: {
            style: dStyle,
            size: dWidth,
            color: dColor,
            dashedValue: dDashed
          }
        })
      }

      return figures
    },
    setProperties: (_properties: DeepPartial<OverlayProperties>, id: string) => {
      const current = properties.get(id) ?? {}
      const newProps = clone(current) as Record<string, unknown>
      merge(newProps, _properties)
      properties.set(id, newProps as DeepPartial<OverlayProperties>)
    },
    getProperties: (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}
  }
}

export default fibonacciSegment
