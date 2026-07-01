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
import type { LineStyle, TextStyle } from '../../common/Styles'
import { isNumber, merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { computeTextPosition } from './textUtils'
import { formatPrecision } from '../../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'

/** Which side the ray extends after its single-click anchor. */
type RayDirection = 'left' | 'right'

const horizontalRayLine = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      size: props.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth,
      dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
    }
  }

  const textStyle = (id: string): Partial<TextStyle> => {
    const props = properties.get(id) ?? {}
    return {
      color: props.textColor ?? DEFAULT_OVERLAY_PROPERTIES.textColor,
      size: props.textFontSize ?? DEFAULT_OVERLAY_PROPERTIES.textFontSize,
      weight: props.textFontWeight ?? DEFAULT_OVERLAY_PROPERTIES.textFontWeight,
      // Italic flows through `fontStyle` — matching the same
      // fix on segment.ts (phase C). Without this, toggling
      // Italic in the Text tab wrote to properties but never
      // reached the canvas's `ctx.font`.
      fontStyle: props.textFontStyle ?? DEFAULT_OVERLAY_PROPERTIES.textFontStyle,
      family: props.textFont ?? DEFAULT_OVERLAY_PROPERTIES.textFont,
      paddingLeft: props.textPaddingLeft ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingLeft,
      paddingRight: props.textPaddingRight ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingRight,
      paddingTop: props.textPaddingTop ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingTop,
      paddingBottom: props.textPaddingBottom ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingBottom,
      backgroundColor: props.textBackgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.textBackgroundColor
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const current = properties.get(id) ?? {}
    const newProps = clone(current) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }

  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: 'horizontalRayLine',
    // Single-click placement (ALTD-1892). Direction lives on
    // extendData (default 'right'), so the second click the
    // legacy `totalStep: 3` required is no longer needed —
    // matches every other one-click horizontal tool.
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const id = overlay.id
      const ext = overlay.extendData as {
        direction?: RayDirection
        showPriceLabels?: boolean
      } | undefined
      const direction: RayDirection = ext?.direction ?? 'right'
      // The ray is anchored at coordinates[0] and extends to
      // whichever chart edge `direction` selects. Left = x 0,
      // right = x bounding.width. No second point is
      // consulted; a saved legacy overlay whose extendData is
      // absent picks up the 'right' default automatically.
      const rayEnd = { x: direction === 'left' ? 0 : bounding.width, y: coordinates[0].y }

      const figures: Array<{
        type: string
        attrs: unknown
        styles?: Partial<LineStyle> | Partial<TextStyle>
      }> = [
        {
          type: 'line',
          attrs: { coordinates: [coordinates[0], rayEnd] },
          styles: lineStyle(id)
        }
      ]

      const props = properties.get(id) ?? {}
      const text = props.text ?? ''
      figures.push({
        type: 'editableText',
        attrs: { ...computeTextPosition(coordinates[0].x, coordinates[0].y, props, bounding.width, 'center', 'top'), text },
        styles: textStyle(id)
      })

      return figures
    },
    // Persistent Y-axis price label at the anchor's price, per
    // spec Style-tab checkbox. Mirrors segment.ts's
    // `createYAxisFigures` — same format chain (`decimalFold`
    // ∘ `thousandsSeparator` ∘ `formatPrecision`) so every
    // Y-axis label source in the chart reads identically.
    createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
      const ext = overlay.extendData as { showPriceLabels?: boolean } | undefined
      if (ext?.showPriceLabels !== true) return []
      if (coordinates.length === 0) return []

      const isFromZero = yAxis?.isFromZero() ?? false
      const textAlign: CanvasTextAlign = isFromZero ? 'left' : 'right'
      const x = isFromZero ? 0 : bounding.width

      const precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
      const decimalFold = chart.getDecimalFold()
      const thousandsSeparator = chart.getThousandsSeparator()
      const value = overlay.points[0]?.value
      if (!isNumber(value)) return []
      const labelText = decimalFold.format(thousandsSeparator.format(formatPrecision(value, precision)))

      return [{
        type: 'text',
        attrs: {
          x,
          y: coordinates[0].y,
          text: labelText,
          align: textAlign,
          baseline: 'middle' as CanvasTextBaseline
        }
      }]
    },
    performEventPressedMove: ({ points, performPoint }) => {
      // Anchor is one point now, but the engine's move handler
      // still stamps both slots so legacy saved overlays with
      // two points don't drift apart when dragged.
      points[0].value = performPoint.value
      if (points.length > 1) {
        points[1].value = performPoint.value
      }
    },
    setProperties,
    getProperties
  }
}

export default horizontalRayLine
