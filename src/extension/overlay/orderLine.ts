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
 * Order Line Overlay
 *
 * A klinecharts overlay template that renders a horizontal price line with
 * body label, quantity label, and cancel button. Used for displaying orders,
 * positions, and alerts on the chart.
 */

import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'

import type { ProOverlayTemplate } from './types'
import type { OrderLineProperties } from './order'

// ---------------------------------------------------------------------------
// Default style constants
// ---------------------------------------------------------------------------

const defaultOrderLineStyle = {
  lineColor: '#00698b',
  lineWidth: 1,
  lineStyle: 'dashed' as const,
  lineDashedValue: [4, 4],
  marginRight: 60,
  bodyFontSize: 12,
  bodyFont: 'Helvetica Neue',
  bodyTextColor: '#FFFFFF',
  bodyBackgroundColor: '#00698b',
  bodyBorderColor: '#00698b',
  bodyPaddingLeft: 5,
  bodyPaddingRight: 5,
  bodyPaddingTop: 5,
  bodyPaddingBottom: 5,
  quantityFontSize: 12,
  quantityFont: 'Helvetica Neue',
  quantityColor: '#FFFFFF',
  quantityBackgroundColor: '#00698b',
  quantityBorderColor: '#00698b',
  quantityPaddingLeft: 5,
  quantityPaddingRight: 5,
  quantityPaddingTop: 5,
  quantityPaddingBottom: 5,
  cancelButtonFontSize: 12,
  cancelButtonIconColor: '#FFFFFF',
  cancelButtonBackgroundColor: '#00698b',
  cancelButtonBorderColor: '#00698b',
  cancelButtonPaddingLeft: 5,
  cancelButtonPaddingRight: 5,
  cancelButtonPaddingTop: 5,
  cancelButtonPaddingBottom: 5,
  borderStyle: 'solid' as const,
  borderSize: 1,
  borderDashedValue: [2, 2],
  borderRadius: 3
}

// Approximate widths for layout calculations
const CANCEL_BTN_WIDTH = 26
const QUANTITY_WIDTH = 60

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const orderLine = (): ProOverlayTemplate => {
  let properties: DeepPartial<OrderLineProperties> = {}

  const prop = <K extends keyof OrderLineProperties>(key: K): OrderLineProperties[K] =>
    ((properties as Record<string, unknown>)[key] as OrderLineProperties[K] ??
      (defaultOrderLineStyle as Record<string, unknown>)[key] as OrderLineProperties[K])

  return {
    name: 'orderLine',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,

    // -----------------------------------------------------------------------
    // createPointFigures
    // -----------------------------------------------------------------------
    createPointFigures: ({ coordinates, bounding }) => {
      const figures: Array<{
        type: string
        key?: string
        attrs: Record<string, unknown>
        styles?: Record<string, unknown>
        ignoreEvent?: boolean
      }> = []

      if (coordinates.length === 0) return []
      const y = coordinates[0].y

      const marginRight = prop('marginRight') ?? defaultOrderLineStyle.marginRight
      const cancelBtnWidth = CANCEL_BTN_WIDTH
      const quantityWidth = QUANTITY_WIDTH

      const lineColor = prop('lineColor') ?? defaultOrderLineStyle.lineColor
      const lineWidth = prop('lineWidth') ?? defaultOrderLineStyle.lineWidth
      const lineStyle = prop('lineStyle') ?? defaultOrderLineStyle.lineStyle
      const lineDashedValue = prop('lineDashedValue') ?? defaultOrderLineStyle.lineDashedValue

      const fontSize = prop('bodyFontSize') ?? defaultOrderLineStyle.bodyFontSize
      const fontFamily = prop('bodyFont') ?? defaultOrderLineStyle.bodyFont
      const borderRadius = prop('borderRadius') ?? defaultOrderLineStyle.borderRadius

      // -- a. Price line --
      figures.push({
        type: 'line',
        key: 'price-line',
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width - marginRight, y }
          ]
        },
        styles: {
          style: lineStyle,
          color: lineColor,
          size: lineWidth,
          dashedValue: lineDashedValue
        }
      })

      // -- b. Body label --
      const isBodyVisible = properties.isBodyVisible
      if (isBodyVisible !== false) {
        const bodyText = properties.text ?? 'Position Line'
        const bodyTextColor = prop('bodyTextColor') ?? defaultOrderLineStyle.bodyTextColor
        const bodyBgColor = prop('bodyBackgroundColor') ?? defaultOrderLineStyle.bodyBackgroundColor
        const bodyBorderColor = prop('bodyBorderColor') ?? defaultOrderLineStyle.bodyBorderColor
        const bodyPaddingLeft = prop('bodyPaddingLeft') ?? defaultOrderLineStyle.bodyPaddingLeft
        const bodyPaddingRight = prop('bodyPaddingRight') ?? defaultOrderLineStyle.bodyPaddingRight
        const bodyPaddingTop = prop('bodyPaddingTop') ?? defaultOrderLineStyle.bodyPaddingTop
        const bodyPaddingBottom = prop('bodyPaddingBottom') ?? defaultOrderLineStyle.bodyPaddingBottom

        figures.push({
          type: 'text',
          key: 'body',
          attrs: {
            x: bounding.width - marginRight - cancelBtnWidth - quantityWidth,
            y,
            text: bodyText,
            align: 'right',
            baseline: 'middle'
          },
          styles: {
            style: 'fill',
            color: bodyTextColor,
            fontSize,
            fontFamily,
            backgroundColor: bodyBgColor,
            borderColor: bodyBorderColor,
            borderStyle: prop('borderStyle') ?? defaultOrderLineStyle.borderStyle,
            borderSize: prop('borderSize') ?? defaultOrderLineStyle.borderSize,
            borderDashedValue: prop('borderDashedValue') ?? defaultOrderLineStyle.borderDashedValue,
            borderRadius,
            paddingLeft: bodyPaddingLeft,
            paddingRight: bodyPaddingRight,
            paddingTop: bodyPaddingTop,
            paddingBottom: bodyPaddingBottom
          }
        })
      }

      // -- c. Quantity label --
      const isQuantityVisible = properties.isQuantityVisible
      if (isQuantityVisible !== false) {
        const quantityText = String(properties.quantity ?? 'Size')
        const quantityColor = prop('quantityColor') ?? defaultOrderLineStyle.quantityColor
        const quantityBgColor = prop('quantityBackgroundColor') ?? defaultOrderLineStyle.quantityBackgroundColor
        const quantityBorderColor = prop('quantityBorderColor') ?? defaultOrderLineStyle.quantityBorderColor
        const quantityPaddingLeft = prop('quantityPaddingLeft') ?? defaultOrderLineStyle.quantityPaddingLeft
        const quantityPaddingRight = prop('quantityPaddingRight') ?? defaultOrderLineStyle.quantityPaddingRight
        const quantityPaddingTop = prop('quantityPaddingTop') ?? defaultOrderLineStyle.quantityPaddingTop
        const quantityPaddingBottom = prop('quantityPaddingBottom') ?? defaultOrderLineStyle.quantityPaddingBottom
        const quantityFontSize = prop('quantityFontSize') ?? defaultOrderLineStyle.quantityFontSize
        const quantityFontFamily = prop('quantityFont') ?? defaultOrderLineStyle.quantityFont

        figures.push({
          type: 'text',
          key: 'quantity',
          attrs: {
            x: bounding.width - marginRight - cancelBtnWidth,
            y,
            text: quantityText,
            align: 'right',
            baseline: 'middle'
          },
          styles: {
            style: 'fill',
            color: quantityColor,
            fontSize: quantityFontSize,
            fontFamily: quantityFontFamily,
            backgroundColor: quantityBgColor,
            borderColor: quantityBorderColor,
            borderStyle: prop('borderStyle') ?? defaultOrderLineStyle.borderStyle,
            borderSize: prop('borderSize') ?? defaultOrderLineStyle.borderSize,
            borderDashedValue: prop('borderDashedValue') ?? defaultOrderLineStyle.borderDashedValue,
            borderRadius,
            paddingLeft: quantityPaddingLeft,
            paddingRight: quantityPaddingRight,
            paddingTop: quantityPaddingTop,
            paddingBottom: quantityPaddingBottom
          }
        })
      }

      // -- d. Cancel button --
      const isCancelButtonVisible = properties.isCancelButtonVisible
      if (isCancelButtonVisible !== false) {
        const cancelIconColor = prop('cancelButtonIconColor') ?? defaultOrderLineStyle.cancelButtonIconColor
        const cancelBgColor = prop('cancelButtonBackgroundColor') ?? defaultOrderLineStyle.cancelButtonBackgroundColor
        const cancelBorderColor = prop('cancelButtonBorderColor') ?? defaultOrderLineStyle.cancelButtonBorderColor
        const cancelFontSize = prop('cancelButtonFontSize') ?? defaultOrderLineStyle.cancelButtonFontSize
        const cancelPaddingLeft = prop('cancelButtonPaddingLeft') ?? defaultOrderLineStyle.cancelButtonPaddingLeft
        const cancelPaddingRight = prop('cancelButtonPaddingRight') ?? defaultOrderLineStyle.cancelButtonPaddingRight
        const cancelPaddingTop = prop('cancelButtonPaddingTop') ?? defaultOrderLineStyle.cancelButtonPaddingTop
        const cancelPaddingBottom = prop('cancelButtonPaddingBottom') ?? defaultOrderLineStyle.cancelButtonPaddingBottom

        figures.push({
          type: 'text',
          key: 'cancel-button',
          attrs: {
            x: bounding.width - marginRight,
            y,
            text: '\ue900',
            align: 'right',
            baseline: 'middle'
          },
          styles: {
            style: 'fill',
            color: cancelIconColor,
            fontSize: cancelFontSize,
            fontFamily: 'icomoon',
            backgroundColor: cancelBgColor,
            borderColor: cancelBorderColor,
            borderStyle: prop('borderStyle') ?? defaultOrderLineStyle.borderStyle,
            borderSize: prop('borderSize') ?? defaultOrderLineStyle.borderSize,
            borderDashedValue: prop('borderDashedValue') ?? defaultOrderLineStyle.borderDashedValue,
            borderRadius,
            paddingLeft: cancelPaddingLeft,
            paddingRight: cancelPaddingRight,
            paddingTop: cancelPaddingTop,
            paddingBottom: cancelPaddingBottom
          }
        })
      }

      return figures
    },

    // -----------------------------------------------------------------------
    // createYAxisFigures
    // -----------------------------------------------------------------------
    createYAxisFigures: ({ overlay, coordinates }) => {
      const y = coordinates.length > 0 ? coordinates[0].y : 0
      const price = properties.price

      let priceText = ''
      if (typeof overlay.extendData === 'function') {
        priceText = String((overlay.extendData as (v: unknown) => string)(price))
      } else if (price !== undefined) {
        priceText = String(price)
      }

      const lineColor = prop('lineColor') ?? defaultOrderLineStyle.lineColor
      const bodyTextColor = prop('bodyTextColor') ?? defaultOrderLineStyle.bodyTextColor
      const fontSize = prop('bodyFontSize') ?? defaultOrderLineStyle.bodyFontSize
      const fontFamily = prop('bodyFont') ?? defaultOrderLineStyle.bodyFont

      return [
        {
          type: 'text',
          attrs: {
            x: 0,
            y,
            text: priceText,
            align: 'left',
            baseline: 'middle'
          },
          styles: {
            style: 'fill',
            color: bodyTextColor,
            fontSize,
            fontFamily,
            backgroundColor: lineColor,
            borderColor: lineColor,
            paddingLeft: 4,
            paddingRight: 4,
            paddingTop: 2,
            paddingBottom: 2,
            borderRadius: 2
          }
        }
      ]
    },

    // -----------------------------------------------------------------------
    // Event handlers
    // -----------------------------------------------------------------------
    onSelected: ({ overlay }) => {
      overlay.mode = 'normal'
      return false
    },

    onRightClick: () => false,

    onPressedMoveStart: (event) => {
      if (properties.onMoveStart?.callback != null) {
        properties.onMoveStart.callback(properties.onMoveStart.params, event)
      }
      return false
    },

    onPressedMoving: (event) => {
      // Update the price from the y-coordinate conversion
      const points = event.overlay.points
      if (points.length > 0 && points[0].value !== undefined) {
        properties.price = points[0].value
      }
      if (properties.onMove?.callback != null) {
        properties.onMove.callback(properties.onMove.params, event)
      }
      return false
    },

    onPressedMoveEnd: (event) => {
      if (properties.onMoveEnd?.callback != null) {
        properties.onMoveEnd.callback(properties.onMoveEnd.params, event)
      }
      return false
    },

    onClick: (event) => {
      const figureKey = event.figure?.key
      if (figureKey === 'cancel-button' && properties.onCancel?.callback != null) {
        properties.onCancel.callback(properties.onCancel.params, event)
      } else if (figureKey === 'quantity' && properties.onModify?.callback != null) {
        properties.onModify.callback(properties.onModify.params, event)
      }
      return false
    },

    // -----------------------------------------------------------------------
    // Property management
    // -----------------------------------------------------------------------
    setProperties: (_properties: DeepPartial<OrderLineProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<OrderLineProperties>
    },

    getProperties: (_id: string): DeepPartial<OrderLineProperties> => properties
  }
}

export default orderLine
