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
// PriceLineProperties
// ---------------------------------------------------------------------------

export interface PriceLineEventListener {
  params: unknown
  callback: (params: unknown, event?: OverlayEvent<unknown>) => void
}

export interface PriceLineProperties {
  /** Price level for the horizontal line */
  price?: number

  // -- Line styling --
  lineColor?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed'
  lineDashedValue?: number[]

  // -- Label on chart area --
  /** Whether the label is visible (default: true) */
  labelVisible?: boolean
  /** Whether the label is editable via double-click (default: false) */
  labelEditable?: boolean
  /** Label text content */
  labelText?: string

  /** Label font family */
  labelFont?: string
  /** Label font size in pixels */
  labelFontSize?: number
  /** Label font weight */
  labelFontWeight?: number | string
  /** Label text color */
  labelTextColor?: string
  /** Label background color */
  labelBackgroundColor?: string
  /** Label border color */
  labelBorderColor?: string
  /** Label border style */
  labelBorderStyle?: 'solid' | 'dashed'
  /** Label border size */
  labelBorderSize?: number
  /** Label border dashed value */
  labelBorderDashedValue?: number[]
  /** Label border radius */
  labelBorderRadius?: number
  /** Label padding left */
  labelPaddingLeft?: number
  /** Label padding right */
  labelPaddingRight?: number
  /** Label padding top */
  labelPaddingTop?: number
  /** Label padding bottom */
  labelPaddingBottom?: number

  /** Whether label renders above, below, or centered on the line (default: 'above').
   *  'above' and 'below' apply a 6px gap between the line and label.
   *  Use labelOffsetY for custom gap control. */
  labelPosition?: 'above' | 'below' | 'center'
  /** Horizontal alignment of the label (default: 'left').
   *  Controls both the text anchor and position when labelOffsetPercentX is not set.
   *  Note: labelOffsetPercentX takes precedence over labelAlign for positioning. */
  labelAlign?: 'left' | 'center' | 'right'
  /** Horizontal offset from the aligned position in pixels (default: 10) */
  labelOffsetX?: number
  /** Vertical gap between line and label in pixels. When > 0, overrides the default 6px gap (default: 0) */
  labelOffsetY?: number
  /** Percentage (0-100) of chart width to position the label from the left.
   *  Set to -1 to disable and fall back to labelAlign positioning.
   *  When >= 0, this takes precedence over labelAlign for the X position.
   *  (default: -1) */
  labelOffsetPercentX?: number

  // -- Y-axis price label --
  /** Whether the Y-axis price label is visible (default: true) */
  yAxisLabelVisible?: boolean
  yAxisLabelFont?: string
  yAxisLabelFontSize?: number
  yAxisLabelFontWeight?: number | string
  yAxisLabelTextColor?: string
  yAxisLabelBackgroundColor?: string
  yAxisLabelBorderColor?: string
  yAxisLabelPaddingLeft?: number
  yAxisLabelPaddingRight?: number
  yAxisLabelPaddingTop?: number
  yAxisLabelPaddingBottom?: number
  yAxisLabelBorderRadius?: number

  // -- Event listeners --
  onMoveStart?: PriceLineEventListener
  onMove?: PriceLineEventListener
  onMoveEnd?: PriceLineEventListener
}

// ---------------------------------------------------------------------------
// PriceLine — fluent API
// ---------------------------------------------------------------------------

export interface PriceLine {
  /** Overlay ID on the chart */
  readonly id: string
  /** Pane ID where the overlay is rendered */
  readonly paneId: string

  // -- Core data setters (all return `this` for chaining) --
  setPrice: (price: number) => PriceLine
  setText: (text: string) => PriceLine

  // -- Label visibility & editability --
  setLabelVisible: (visible: boolean) => PriceLine
  setEditable: (editable: boolean) => PriceLine

  // -- Line styling --
  setLineColor: (color: string) => PriceLine
  setLineWidth: (width: number) => PriceLine
  setLineStyle: (style: 'solid' | 'dashed') => PriceLine
  setLineDashedValue: (dashedValue: number[]) => PriceLine

  // -- Label styling --
  setLabelFont: (font: string) => PriceLine
  setLabelFontSize: (size: number) => PriceLine
  setLabelFontWeight: (weight: number | string) => PriceLine
  setLabelTextColor: (color: string) => PriceLine
  setLabelBackgroundColor: (color: string) => PriceLine
  setLabelBorderColor: (color: string) => PriceLine
  setLabelBorderStyle: (style: 'solid' | 'dashed') => PriceLine
  setLabelBorderSize: (size: number) => PriceLine
  setLabelBorderRadius: (radius: number) => PriceLine
  setLabelPadding: (padding: { left?: number; right?: number; top?: number; bottom?: number }) => PriceLine

  // -- Label positioning --
  setLabelPosition: (position: 'above' | 'below' | 'center') => PriceLine
  setLabelAlign: (align: 'left' | 'center' | 'right') => PriceLine
  setLabelOffsetX: (offset: number) => PriceLine
  setLabelOffsetY: (offset: number) => PriceLine
  setLabelOffsetPercentX: (percent: number) => PriceLine

  // -- Y-axis label --
  setYAxisLabelVisible: (visible: boolean) => PriceLine
  setYAxisLabelTextColor: (color: string) => PriceLine
  setYAxisLabelBackgroundColor: (color: string) => PriceLine
  setYAxisLabelBorderColor: (color: string) => PriceLine

  // -- Event listeners --
  onMoveStart: <T>(params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void) => PriceLine
  onMove: <T>(params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void) => PriceLine
  onMoveEnd: <T>(params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void) => PriceLine

  // -- Lifecycle --
  /** Get current properties */
  getProperties: () => PriceLineProperties
  /** Remove this price line from the chart */
  remove: () => void
}

// ---------------------------------------------------------------------------
// createPriceLine factory function
// ---------------------------------------------------------------------------

/**
 * Create a price line overlay on a chart and return a fluent API for updates.
 *
 * @param chart - The klinecharts Chart instance
 * @param options - Initial price line properties
 * @returns PriceLine fluent API object
 *
 * @example
 * ```typescript
 * const line = createPriceLine(chart, { price: 50000 })
 *   .setLineColor('#ff0000')
 *   .setText('Support Level')
 *   .setEditable(true)
 *   .setLabelBackgroundColor('#ff0000')
 * ```
 */
export function createPriceLine (
  chart: Chart,
  options?: Partial<PriceLineProperties>
): PriceLine {
  const properties: PriceLineProperties = { ...options }

  const result = chart.createOverlay({
    name: 'priceLine',
    points: [{ value: options?.price ?? 0 }],
    mode: 'normal',
    modeSensitivity: 4,
    lock: false,
    visible: true,
    paneId: 'candle_pane',
    onTextChange: ({ text: newText }) => {
      properties.labelText = newText
      update()
    }
  })
  const overlayId = typeof result === 'string' ? result : null

  // Push initial properties to the overlay's Pro property store
  if (overlayId !== null) {
    chart.overrideOverlay({
      id: overlayId,
      extendData: { ...properties }
    })
  }

  function update (): void {
    if (overlayId === null) return
    chart.overrideOverlay({
      id: overlayId,
      extendData: { ...properties },
      points: [{ value: properties.price ?? 0 }]
    })
  }

  const self: PriceLine = {
    get id (): string {
      return overlayId ?? ''
    },

    get paneId (): string {
      return 'candle_pane'
    },

    // -- Core data setters --
    setPrice (price: number): PriceLine {
      properties.price = price
      update()
      return self
    },

    setText (text: string): PriceLine {
      properties.labelText = text
      update()
      return self
    },

    // -- Label visibility & editability --
    setLabelVisible (visible: boolean): PriceLine {
      properties.labelVisible = visible
      update()
      return self
    },

    setEditable (editable: boolean): PriceLine {
      properties.labelEditable = editable
      update()
      return self
    },

    // -- Line styling --
    setLineColor (color: string): PriceLine {
      properties.lineColor = color
      update()
      return self
    },

    setLineWidth (width: number): PriceLine {
      properties.lineWidth = width
      update()
      return self
    },

    setLineStyle (style: 'solid' | 'dashed'): PriceLine {
      properties.lineStyle = style
      update()
      return self
    },

    setLineDashedValue (dashedValue: number[]): PriceLine {
      properties.lineDashedValue = dashedValue
      update()
      return self
    },

    // -- Label styling --
    setLabelFont (font: string): PriceLine {
      properties.labelFont = font
      update()
      return self
    },

    setLabelFontSize (size: number): PriceLine {
      properties.labelFontSize = size
      update()
      return self
    },

    setLabelFontWeight (weight: number | string): PriceLine {
      properties.labelFontWeight = weight
      update()
      return self
    },

    setLabelTextColor (color: string): PriceLine {
      properties.labelTextColor = color
      update()
      return self
    },

    setLabelBackgroundColor (color: string): PriceLine {
      properties.labelBackgroundColor = color
      update()
      return self
    },

    setLabelBorderColor (color: string): PriceLine {
      properties.labelBorderColor = color
      update()
      return self
    },

    setLabelBorderStyle (style: 'solid' | 'dashed'): PriceLine {
      properties.labelBorderStyle = style
      update()
      return self
    },

    setLabelBorderSize (size: number): PriceLine {
      properties.labelBorderSize = size
      update()
      return self
    },

    setLabelBorderRadius (radius: number): PriceLine {
      properties.labelBorderRadius = radius
      update()
      return self
    },

    setLabelPadding (padding: { left?: number; right?: number; top?: number; bottom?: number }): PriceLine {
      if (padding.left !== undefined) properties.labelPaddingLeft = padding.left
      if (padding.right !== undefined) properties.labelPaddingRight = padding.right
      if (padding.top !== undefined) properties.labelPaddingTop = padding.top
      if (padding.bottom !== undefined) properties.labelPaddingBottom = padding.bottom
      update()
      return self
    },

    // -- Label positioning --
    setLabelPosition (position: 'above' | 'below' | 'center'): PriceLine {
      properties.labelPosition = position
      update()
      return self
    },

    setLabelAlign (align: 'left' | 'center' | 'right'): PriceLine {
      properties.labelAlign = align
      update()
      return self
    },

    setLabelOffsetX (offset: number): PriceLine {
      properties.labelOffsetX = offset
      update()
      return self
    },

    setLabelOffsetY (offset: number): PriceLine {
      properties.labelOffsetY = offset
      update()
      return self
    },

    setLabelOffsetPercentX (percent: number): PriceLine {
      properties.labelOffsetPercentX = percent
      update()
      return self
    },

    // -- Y-axis label --
    setYAxisLabelVisible (visible: boolean): PriceLine {
      properties.yAxisLabelVisible = visible
      update()
      return self
    },

    setYAxisLabelTextColor (color: string): PriceLine {
      properties.yAxisLabelTextColor = color
      update()
      return self
    },

    setYAxisLabelBackgroundColor (color: string): PriceLine {
      properties.yAxisLabelBackgroundColor = color
      update()
      return self
    },

    setYAxisLabelBorderColor (color: string): PriceLine {
      properties.yAxisLabelBorderColor = color
      update()
      return self
    },

    // -- Event listeners --
    onMoveStart<T> (params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void): PriceLine {
      properties.onMoveStart = { params, callback: callback as (p: unknown, e?: OverlayEvent<unknown>) => void }
      update()
      return self
    },

    onMove<T> (params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void): PriceLine {
      properties.onMove = { params, callback: callback as (p: unknown, e?: OverlayEvent<unknown>) => void }
      update()
      return self
    },

    onMoveEnd<T> (params: T, callback: (params: T, event?: OverlayEvent<unknown>) => void): PriceLine {
      properties.onMoveEnd = { params, callback: callback as (p: unknown, e?: OverlayEvent<unknown>) => void }
      update()
      return self
    },

    // -- Lifecycle --
    getProperties (): PriceLineProperties {
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
