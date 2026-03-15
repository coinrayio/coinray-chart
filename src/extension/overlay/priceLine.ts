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
import { merge, clone } from '../../common/utils/typeChecks'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'

import type { ProOverlayTemplate } from './types'
import type { PriceLineProperties } from './priceLineApi'

// ---------------------------------------------------------------------------
// Default style constants
// ---------------------------------------------------------------------------

const defaultPriceLineStyle = {
  lineColor: '#1677FF',
  lineWidth: 1,
  lineStyle: 'dashed' as const,
  lineDashedValue: [4, 4],

  labelVisible: true,
  labelEditable: false,
  labelText: '',

  labelFontSize: 12,
  labelFont: 'Helvetica Neue',
  labelFontWeight: 'normal' as string | number,
  labelTextColor: '#FFFFFF',
  labelBackgroundColor: '#1677FF',
  labelBorderColor: '#1677FF',
  labelBorderStyle: 'solid' as const,
  labelBorderSize: 1,
  labelBorderDashedValue: [2, 2] as number[],
  labelBorderRadius: 2,
  labelPaddingLeft: 4,
  labelPaddingRight: 4,
  labelPaddingTop: 2,
  labelPaddingBottom: 2,

  labelPosition: 'above' as 'above' | 'below' | 'center',
  labelAlign: 'left' as 'left' | 'center' | 'right',
  labelOffsetX: 10,
  labelOffsetY: 0,
  labelOffsetPercentX: -1,

  yAxisLabelVisible: true,
  yAxisLabelFontSize: 12,
  yAxisLabelFont: 'Helvetica Neue',
  yAxisLabelFontWeight: 'normal' as string | number,
  yAxisLabelTextColor: '#FFFFFF',
  yAxisLabelBackgroundColor: '#1677FF',
  yAxisLabelBorderColor: '#1677FF',
  yAxisLabelPaddingLeft: 4,
  yAxisLabelPaddingRight: 4,
  yAxisLabelPaddingTop: 2,
  yAxisLabelPaddingBottom: 2,
  yAxisLabelBorderRadius: 2
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const priceLine = (): ProOverlayTemplate => {
  let properties: DeepPartial<PriceLineProperties> = {}

  /**
   * Resolve a property value from: extendData (createPriceLine API) → closure (setProperties) → defaults.
   * createPriceLine stores data via overlay.extendData, while direct usage uses setProperties.
   */
  const _extRef: { data: DeepPartial<PriceLineProperties> | null } = { data: null }

  const prop = <K extends keyof typeof defaultPriceLineStyle>(key: K): (typeof defaultPriceLineStyle)[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defaults = defaultPriceLineStyle as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defaults[key]) as (typeof defaultPriceLineStyle)[K]
  }

  return {
    name: 'priceLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: false,

    // -----------------------------------------------------------------------
    // createPointFigures — horizontal line + optional label
    // -----------------------------------------------------------------------
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length === 0) return []

      // Sync extendData from createPriceLine API into the resolution chain
      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<PriceLineProperties>
        : null

      const y = coordinates[0].y

      const lineStyles: Partial<LineStyle> = {
        style: prop('lineStyle'),
        color: prop('lineColor'),
        size: prop('lineWidth'),
        dashedValue: prop('lineDashedValue')
      }

      const figures: Array<{ type: string; attrs: unknown; styles?: unknown; ignoreEvent?: boolean }> = [
        {
          type: 'line',
          attrs: { coordinates: [coordinates[0], { x: bounding.width, y }] },
          styles: lineStyles
        }
      ]

      // -- Optional label on the chart area --
      const labelVisible = prop('labelVisible')
      if (labelVisible) {
        const ext = _extRef.data as Record<string, unknown> | null
        const props = properties as Record<string, unknown>
        const labelText = (ext?.labelText ?? props.labelText ?? '') as string
        const labelEditable = prop('labelEditable')

        if (labelText.length > 0) {
          const labelStyles: Partial<TextStyle> = {
            color: prop('labelTextColor'),
            size: prop('labelFontSize'),
            weight: prop('labelFontWeight'),
            family: prop('labelFont'),
            paddingLeft: prop('labelPaddingLeft'),
            paddingRight: prop('labelPaddingRight'),
            paddingTop: prop('labelPaddingTop'),
            paddingBottom: prop('labelPaddingBottom'),
            backgroundColor: prop('labelBackgroundColor'),
            borderColor: prop('labelBorderColor'),
            borderStyle: prop('labelBorderStyle'),
            borderSize: prop('labelBorderSize'),
            borderDashedValue: prop('labelBorderDashedValue'),
            borderRadius: prop('labelBorderRadius')
          }

          // Text tab properties override priceLine's own label positioning
          const textAlignH = (props.textAlignHorizontal ?? ext?.textAlignHorizontal) as string | undefined
          const textAlignV = (props.textAlignVertical ?? ext?.textAlignVertical) as string | undefined

          const labelPosition = prop('labelPosition')
          const labelAlign = prop('labelAlign')
          const offsetX = prop('labelOffsetX')
          const offsetY = prop('labelOffsetY')
          const percentX = prop('labelOffsetPercentX')
          const gap = 6

          // Compute label X
          // Priority: textAlignHorizontal (Text tab) > percentX > labelAlign
          const { labelX, align } = textAlignH != null
            ? {
                labelX: textAlignH === 'left'
                  ? Math.round(bounding.width * 0.04)
                  : textAlignH === 'right'
                    ? Math.round(bounding.width * 0.96)
                    : bounding.width / 2,
                align: textAlignH as CanvasTextAlign
              }
            : percentX >= 0
              ? { labelX: bounding.width * (percentX / 100), align: labelAlign as CanvasTextAlign }
              : labelAlign === 'right'
                ? { labelX: bounding.width - offsetX, align: 'right' as CanvasTextAlign }
                : labelAlign === 'left'
                  ? { labelX: offsetX, align: 'left' as CanvasTextAlign }
                  : { labelX: bounding.width / 2 + offsetX, align: 'center' as CanvasTextAlign }

          // Compute label Y — textAlignVertical overrides if set
          const effectiveVAlign = textAlignV ?? (labelPosition === 'above' ? 'top' : labelPosition === 'below' ? 'bottom' : 'middle')
          const labelY = effectiveVAlign === 'top'
            ? y - (offsetY > 0 ? offsetY : gap)
            : effectiveVAlign === 'bottom'
              ? y + (offsetY > 0 ? offsetY : gap)
              : y + offsetY
          const baseline: CanvasTextBaseline = effectiveVAlign === 'top'
            ? 'bottom'
            : effectiveVAlign === 'bottom'
              ? 'top'
              : 'middle'

          figures.push({
            type: labelEditable ? 'editableText' : 'text',
            attrs: {
              x: labelX,
              y: labelY,
              text: labelText,
              align,
              baseline
            },
            styles: labelStyles
          })
        }
      }

      return figures
    },

    // -----------------------------------------------------------------------
    // createYAxisFigures — price label on Y-axis, always visible
    // -----------------------------------------------------------------------
    createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
      if (coordinates.length === 0) return []

      // Sync extendData from createPriceLine API into the resolution chain
      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<PriceLineProperties>
        : null

      const yAxisLabelVisible = prop('yAxisLabelVisible')
      if (!yAxisLabelVisible) return []

      const y = coordinates[0].y

      // Determine price precision
      let precision = 0
      if (yAxis?.isInCandle() ?? true) {
        precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
      } else {
        const indicators = chart.getIndicators({ paneId: overlay.paneId })
        indicators.forEach(indicator => {
          precision = Math.max(precision, indicator.precision)
        })
      }

      const { value = 0 } = overlay.points[0]
      const priceText = chart.getDecimalFold().format(
        chart.getThousandsSeparator().format(value.toFixed(precision))
      )

      // Align to the correct side of the Y-axis
      const yAxisTyped = yAxis as unknown as { isFromZero?: () => boolean } | undefined
      const isFromZero = yAxisTyped?.isFromZero?.() ?? false
      const textAlign: CanvasTextAlign = isFromZero ? 'left' : 'right'
      const x = isFromZero ? 0 : bounding.width

      return [
        {
          type: 'text',
          attrs: {
            x,
            y,
            text: priceText,
            align: textAlign,
            baseline: 'middle' as CanvasTextBaseline
          },
          styles: {
            color: prop('yAxisLabelTextColor'),
            size: prop('yAxisLabelFontSize'),
            weight: prop('yAxisLabelFontWeight'),
            family: prop('yAxisLabelFont'),
            paddingLeft: prop('yAxisLabelPaddingLeft'),
            paddingRight: prop('yAxisLabelPaddingRight'),
            paddingTop: prop('yAxisLabelPaddingTop'),
            paddingBottom: prop('yAxisLabelPaddingBottom'),
            backgroundColor: prop('yAxisLabelBackgroundColor'),
            borderColor: prop('yAxisLabelBorderColor'),
            borderRadius: prop('yAxisLabelBorderRadius')
          },
          ignoreEvent: true
        }
      ]
    },

    // -----------------------------------------------------------------------
    // Event handlers
    // -----------------------------------------------------------------------
    onRightClick: () => false,

    onPressedMoveStart: (event) => {
      const ext = (event.overlay.extendData != null && typeof event.overlay.extendData === 'object')
        ? event.overlay.extendData as DeepPartial<PriceLineProperties>
        : null
      const listener = ext?.onMoveStart ?? properties.onMoveStart
      if (listener?.callback != null) {
        listener.callback(listener.params, event)
      }
      return false
    },

    onPressedMoving: (event) => {
      const ext = (event.overlay.extendData != null && typeof event.overlay.extendData === 'object')
        ? event.overlay.extendData as DeepPartial<PriceLineProperties>
        : null
      const listener = ext?.onMove ?? properties.onMove
      if (listener?.callback != null) {
        listener.callback(listener.params, event)
      }
      return false
    },

    onPressedMoveEnd: (event) => {
      const ext = (event.overlay.extendData != null && typeof event.overlay.extendData === 'object')
        ? event.overlay.extendData as DeepPartial<PriceLineProperties>
        : null
      const listener = ext?.onMoveEnd ?? properties.onMoveEnd
      if (listener?.callback != null) {
        listener.callback(listener.params, event)
      }
      return false
    },

    // -----------------------------------------------------------------------
    // Property management
    // -----------------------------------------------------------------------
    setProperties: (_properties: DeepPartial<PriceLineProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<PriceLineProperties>
    },

    getProperties: (_id: string): DeepPartial<PriceLineProperties> => properties
  }
}

export default priceLine
