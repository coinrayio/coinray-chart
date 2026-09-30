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

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import {
  buildBackgroundBands,
  buildEnrichedLevels,
  buildLevelLabels,
  buildLevelLines,
  diagonalStroke,
  FIB_TV_LEVELS,
  resolveFibSettings
} from './fibonacciShared'

export const FIBONACCI_EXTENSION_LEVELS: FigureLevel[] = FIB_TV_LEVELS

const fibonacciExtension = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const fbLinesStyle = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: props.lineStyle ?? 'solid',
    size: props.lineWidth ?? 2,
    color: props.lineColor ?? props.borderColor,
    dashedValue: props.lineDashedValue
  })

  const textStyleFn = (props: DeepPartial<OverlayProperties>): Partial<TextStyle> => ({
    color: props.textColor,
    family: props.textFont,
    size: props.textFontSize,
    weight: props.textFontWeight,
    // ALTD-1894 — pass fontStyle through so Italic actually
    // takes effect (matches other fib templates).
    fontStyle: props.textFontStyle,
    backgroundColor: props.textBackgroundColor,
    paddingLeft: props.textPaddingLeft,
    paddingRight: props.textPaddingRight,
    paddingTop: props.textPaddingTop,
    paddingBottom: props.textPaddingBottom
  })

  return {
    name: 'fibonacciExtension',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ chart, yAxis, coordinates, bounding, overlay }) => {
      const props = properties.get(overlay.id) ?? {}
      const points = overlay.points

      const figures: Array<{
        type: string
        key?: string
        ignoreEvent?: boolean
        isCheckEvent?: boolean
        attrs: unknown
        styles?: Partial<LineStyle> | Partial<TextStyle> | Partial<PolygonStyle>
      }> = []

      if (coordinates.length === 0) return figures

      const settings = resolveFibSettings(overlay.extendData)

      // Diagonal renders as a poly-line through EVERY placed
      // coordinate so drawing behaves the way it used to: click
      // 1 shows the first anchor with a rubber-band trend leg
      // to the cursor, click 2 concretes it and starts the
      // retracement leg to the cursor, click 3 concretes both.
      // Uses the same isolated diagonal stroke every other fib
      // overlay's Trend Line row drives.
      if (settings.showDiagonal && coordinates.length >= 2) {
        figures.push({
          type: 'line',
          key: 'diagonal',
          attrs: { coordinates: [...coordinates] },
          styles: diagonalStroke(settings)
        })
      }

      // The rest of the render (levels + bands + labels) only
      // makes sense once the extension anchor `coordinates[2]`
      // exists.
      if (coordinates.length < 3) return figures

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

      const leftX = settings.extendLeft ? 0 : Math.min(coordinates[1].x, coordinates[2].x)
      const rightX = settings.extendRight ? bounding.width : Math.max(coordinates[1].x, coordinates[2].x)

      // Extension geometry — level 0 sits at coordinates[2]
      // (the "C" point where the retracement of the trend
      // ended); level 1 lands one full trend-leg away in the
      // same direction as coordinates[0]→coordinates[1]. Feed
      // the helper a virtual "near" point whose y / value
      // deltas match that trend leg — the helper computes
      // yDif = near.y - far.y internally, so any anchor pair
      // with the right delta produces the right levels.
      // TV's Reverse keeps level 0 on the third anchor and grows the levels the
      // other way, so it flips the leg instead of swapping the anchors.
      const dir = settings.reverse ? -1 : 1
      const yDif = (coordinates[1].y - coordinates[0].y) * dir
      const valueDif = ((points[1]?.value ?? 0) - (points[0]?.value ?? 0)) * dir
      const virtualNear = { x: coordinates[2].x, y: coordinates[2].y + yDif }
      // Log scale: the extension leg is a ratio (p1 / p0) rather than a difference.
      const p0 = points[0]?.value ?? 0
      const p1 = points[1]?.value ?? 0
      const p2 = points[2]?.value ?? 0
      const logToY = settings.logScale && yAxis?.name === 'logarithm' && p0 > 0 && p1 > 0 && p2 > 0
        ? (price: number) => yAxis.convertToPixel(price)
        : undefined
      const virtualNearValue = logToY !== undefined ? p2 * (p1 / p0) ** dir : p2 + valueDif

      const enriched = buildEnrichedLevels({
        levels: (((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_EXTENSION_LEVELS) as FigureLevel[])
          .filter(l => l.enabled),
        anchorFar: coordinates[2],
        anchorNear: virtualNear,
        valueFar: points[2]?.value ?? 0,
        valueNear: virtualNearValue,
        precision,
        chart,
        lineColour: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
        reverse: false,
        oneColor: settings.oneColor,
        logToY
      })

      if (settings.showBackground) {
        figures.push(...buildBackgroundBands(enriched, leftX, rightX, settings.backgroundOpacity))
      }

      figures.push(...buildLevelLines(enriched, leftX, rightX, fbLinesStyle(props)))

      figures.push(...buildLevelLabels(enriched, leftX, rightX, settings, props, textStyleFn(props)))

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

export default fibonacciExtension
