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

import type { OverlayEvent } from '../../component/Overlay'
import type { Chart } from '../../Chart'

// ---------------------------------------------------------------------------
// OrderLineProperties — stored on the overlay, read by createPointFigures
// ---------------------------------------------------------------------------

export interface OrderLineEventListener {
  params: unknown
  callback: (params: unknown, event?: OverlayEvent<unknown>) => void
}

export interface OrderLineProperties {
  /** Price level for the horizontal line */
  price?: number
  /** Body label text (e.g., "Buy BTCUSDT") */
  text?: string
  /** Quantity/size label */
  quantity?: number | string
  /** Tooltip text on hover */
  tooltip?: string
  /** Tooltip for the modify action */
  modifyTooltip?: string
  /** Right margin from canvas edge (px) */
  marginRight?: number

  // -- Line styling --
  lineColor?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed'
  lineDashedValue?: number[]
  /** How far the line extends from left (0 = full width) */
  lineLength?: number

  // -- Body label styling --
  bodyFont?: string
  bodyFontSize?: number
  bodyFontWeight?: number | string
  bodyTextColor?: string
  bodyBackgroundColor?: string
  bodyBorderColor?: string
  bodyPaddingLeft?: number
  bodyPaddingRight?: number
  bodyPaddingTop?: number
  bodyPaddingBottom?: number
  isBodyVisible?: boolean

  // -- Quantity label styling --
  quantityFont?: string
  quantityFontSize?: number
  quantityFontWeight?: number | string
  quantityColor?: string
  quantityBackgroundColor?: string
  quantityBorderColor?: string
  quantityPaddingLeft?: number
  quantityPaddingRight?: number
  quantityPaddingTop?: number
  quantityPaddingBottom?: number
  isQuantityVisible?: boolean

  // -- Cancel button styling --
  cancelButtonFontSize?: number
  cancelButtonFontWeight?: number | string
  cancelButtonIconColor?: string
  cancelButtonBackgroundColor?: string
  cancelButtonBorderColor?: string
  cancelButtonPaddingLeft?: number
  cancelButtonPaddingRight?: number
  cancelButtonPaddingTop?: number
  cancelButtonPaddingBottom?: number
  isCancelButtonVisible?: boolean

  // -- Shared border --
  borderStyle?: 'solid' | 'dashed'
  borderSize?: number
  borderDashedValue?: number[]
  borderRadius?: number

  // -- Event listeners (generic callback pattern) --
  onMoveStart?: OrderLineEventListener
  onMove?: OrderLineEventListener
  onMoveEnd?: OrderLineEventListener
  onCancel?: OrderLineEventListener
  onModify?: OrderLineEventListener
}

// ---------------------------------------------------------------------------
// OrderLine — fluent API returned by createOrderLine()
// ---------------------------------------------------------------------------

export interface OrderLine {
  /** Overlay ID on the chart */
  readonly id: string
  /** Pane ID where the overlay is rendered */
  readonly paneId: string

  // -- Core data setters (all return `this` for chaining) --
  setPrice: (price: number) => OrderLine
  setText: (text: string) => OrderLine
  setQuantity: (quantity: number | string) => OrderLine
  setTooltip: (tooltip: string) => OrderLine
  setModifyTooltip: (tooltip: string) => OrderLine

  // -- Line styling --
  setLineColor: (color: string) => OrderLine
  setLineWidth: (width: number) => OrderLine
  setLineStyle: (style: 'solid' | 'dashed') => OrderLine
  setLineDashedValue: (dashedValue: number[]) => OrderLine
  setLineLength: (length: number) => OrderLine

  // -- Body label styling --
  setBodyFont: (font: string) => OrderLine
  setBodyFontWeight: (weight: number | string) => OrderLine
  setBodyTextColor: (color: string) => OrderLine
  setBodyBackgroundColor: (color: string) => OrderLine
  setBodyBorderColor: (color: string) => OrderLine

  // -- Quantity label styling --
  setQuantityFont: (font: string) => OrderLine
  setQuantityFontWeight: (weight: number | string) => OrderLine
  setQuantityColor: (color: string) => OrderLine
  setQuantityBackgroundColor: (color: string) => OrderLine
  setQuantityBorderColor: (color: string) => OrderLine

  // -- Cancel button styling --
  setCancelButtonIconColor: (color: string) => OrderLine
  setCancelButtonBackgroundColor: (color: string) => OrderLine
  setCancelButtonBorderColor: (color: string) => OrderLine

  // -- Shared border --
  setBorderStyle: (style: 'solid' | 'dashed') => OrderLine
  setBorderSize: (size: number) => OrderLine
  setBorderRadius: (radius: number) => OrderLine

  // -- Visibility toggles --
  setBodyVisible: (visible: boolean) => OrderLine
  setQuantityVisible: (visible: boolean) => OrderLine
  setCancelButtonVisible: (visible: boolean) => OrderLine

  // -- Event listeners (generic T for consumer data) --
  onMoveStart: <T>(params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void) => OrderLine
  onMove: <T>(params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void) => OrderLine
  onMoveEnd: <T>(params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void) => OrderLine
  onCancel: <T>(params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void) => OrderLine
  onModify: <T>(params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void) => OrderLine

  // -- Lifecycle --
  /** Get current properties */
  getProperties: () => OrderLineProperties
  /** Remove this order line from the chart */
  remove: () => void
}

// ---------------------------------------------------------------------------
// Default style type (used by orderLineStyleStore)
// ---------------------------------------------------------------------------

export interface OrderLineStyle {
  lineStyle: {
    style: 'solid' | 'dashed'
    size: number
    color: string
    dashedValue: number[]
  }
  labelStyle: {
    fontSize: number
    fontFamily: string
    fontWeight: string | number
    paddingLeft: number
    paddingRight: number
    paddingTop: number
    paddingBottom: number
    borderStyle: 'solid' | 'dashed'
    borderSize: number
    borderDashedValue: number[]
    borderRadius: number
    color: string
    borderColor: string
    backgroundColor: string
  }
}

// ---------------------------------------------------------------------------
// createOrderLine factory function
// ---------------------------------------------------------------------------

/**
 * Create an order line overlay on a chart and return a fluent API for updates.
 *
 * @param chart - The klinecharts Chart instance
 * @param options - Initial order line properties
 * @returns OrderLine fluent API object
 *
 * @example
 * ```typescript
 * const orderLine = createOrderLine(chart, { price: 50000, text: 'Buy' })
 *   .setLineColor('#00ff00')
 *   .setQuantity('0.5 BTC')
 *   .onCancel({ orderId: '123' }, (params) => cancelOrder(params.orderId))
 * ```
 */
export function createOrderLine (
  chart: Chart,
  options?: Partial<OrderLineProperties>
): OrderLine {
  // 1. Create the overlay on the chart
  const result = chart.createOverlay({
    name: 'orderLine',
    points: [{ value: options?.price ?? 0 }],
    mode: 'normal',
    modeSensitivity: 4,
    lock: false,
    visible: true,
    extendData: options,
    paneId: 'candle_pane'
  })
  const overlayId = typeof result === 'string' ? result : null

  // 2. Store properties internally
  const properties: OrderLineProperties = { ...options }

  // 3. Update helper — pushes current properties back to the overlay
  function update (): void {
    if (overlayId === null) return
    chart.overrideOverlay({
      id: overlayId,
      extendData: { ...properties },
      points: [{ value: properties.price ?? 0 }]
    })
  }

  // 4. Build the fluent API object
  const self: OrderLine = {
    // -- Readonly getters --
    get id (): string {
      return overlayId ?? ''
    },

    get paneId (): string {
      return 'candle_pane'
    },

    // -- Core data setters --
    setPrice (price: number): OrderLine {
      properties.price = price
      update()
      return self
    },

    setText (text: string): OrderLine {
      properties.text = text
      update()
      return self
    },

    setQuantity (quantity: number | string): OrderLine {
      properties.quantity = quantity
      update()
      return self
    },

    setTooltip (tooltip: string): OrderLine {
      properties.tooltip = tooltip
      update()
      return self
    },

    setModifyTooltip (tooltip: string): OrderLine {
      properties.modifyTooltip = tooltip
      update()
      return self
    },

    // -- Line styling --
    setLineColor (color: string): OrderLine {
      properties.lineColor = color
      update()
      return self
    },

    setLineWidth (width: number): OrderLine {
      properties.lineWidth = width
      update()
      return self
    },

    setLineStyle (style: 'solid' | 'dashed'): OrderLine {
      properties.lineStyle = style
      update()
      return self
    },

    setLineDashedValue (dashedValue: number[]): OrderLine {
      properties.lineDashedValue = dashedValue
      update()
      return self
    },

    setLineLength (length: number): OrderLine {
      properties.lineLength = length
      update()
      return self
    },

    // -- Body label styling --
    setBodyFont (font: string): OrderLine {
      properties.bodyFont = font
      update()
      return self
    },

    setBodyFontWeight (weight: number | string): OrderLine {
      properties.bodyFontWeight = weight
      update()
      return self
    },

    setBodyTextColor (color: string): OrderLine {
      properties.bodyTextColor = color
      update()
      return self
    },

    setBodyBackgroundColor (color: string): OrderLine {
      properties.bodyBackgroundColor = color
      update()
      return self
    },

    setBodyBorderColor (color: string): OrderLine {
      properties.bodyBorderColor = color
      update()
      return self
    },

    // -- Quantity label styling --
    setQuantityFont (font: string): OrderLine {
      properties.quantityFont = font
      update()
      return self
    },

    setQuantityFontWeight (weight: number | string): OrderLine {
      properties.quantityFontWeight = weight
      update()
      return self
    },

    setQuantityColor (color: string): OrderLine {
      properties.quantityColor = color
      update()
      return self
    },

    setQuantityBackgroundColor (color: string): OrderLine {
      properties.quantityBackgroundColor = color
      update()
      return self
    },

    setQuantityBorderColor (color: string): OrderLine {
      properties.quantityBorderColor = color
      update()
      return self
    },

    // -- Cancel button styling --
    setCancelButtonIconColor (color: string): OrderLine {
      properties.cancelButtonIconColor = color
      update()
      return self
    },

    setCancelButtonBackgroundColor (color: string): OrderLine {
      properties.cancelButtonBackgroundColor = color
      update()
      return self
    },

    setCancelButtonBorderColor (color: string): OrderLine {
      properties.cancelButtonBorderColor = color
      update()
      return self
    },

    // -- Shared border --
    setBorderStyle (style: 'solid' | 'dashed'): OrderLine {
      properties.borderStyle = style
      update()
      return self
    },

    setBorderSize (size: number): OrderLine {
      properties.borderSize = size
      update()
      return self
    },

    setBorderRadius (radius: number): OrderLine {
      properties.borderRadius = radius
      update()
      return self
    },

    // -- Visibility toggles --
    setBodyVisible (visible: boolean): OrderLine {
      properties.isBodyVisible = visible
      update()
      return self
    },

    setQuantityVisible (visible: boolean): OrderLine {
      properties.isQuantityVisible = visible
      update()
      return self
    },

    setCancelButtonVisible (visible: boolean): OrderLine {
      properties.isCancelButtonVisible = visible
      update()
      return self
    },

    // -- Event listeners --
    onMoveStart<T> (params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void): OrderLine {
      properties.onMoveStart = { params, callback: callback as (p: unknown, e?: OverlayEvent<unknown>) => void }
      update()
      return self
    },

    onMove<T> (params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void): OrderLine {
      properties.onMove = { params, callback: callback as (p: unknown, e?: OverlayEvent<unknown>) => void }
      update()
      return self
    },

    onMoveEnd<T> (params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void): OrderLine {
      properties.onMoveEnd = { params, callback: callback as (p: unknown, e?: OverlayEvent<unknown>) => void }
      update()
      return self
    },

    onCancel<T> (params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void): OrderLine {
      properties.onCancel = { params, callback: callback as (p: unknown, e?: OverlayEvent<unknown>) => void }
      update()
      return self
    },

    onModify<T> (params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void): OrderLine {
      properties.onModify = { params, callback: callback as (p: unknown, e?: OverlayEvent<unknown>) => void }
      update()
      return self
    },

    // -- Lifecycle --
    getProperties (): OrderLineProperties {
      return { ...properties }
    },

    remove (): void {
      if (overlayId !== null) {
        chart.removeOverlay({ id: overlayId })
      }
    }
  }

  return self
}
