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

import type { Chart } from '../../Chart'

// ---------------------------------------------------------------------------
// TradeLineProperties — stored on the overlay, read by createPointFigures
// ---------------------------------------------------------------------------

export interface TradeLineProperties {
  /** Arrow direction: 'up' for buy (below candle), 'down' for sell (above candle) */
  direction?: 'up' | 'down'
  /** Arrow visual style */
  arrowType?: 'wide' | 'arrow' | 'tiny'
  /** Arrow color (fill and stroke) */
  color?: string
  /** Text label color */
  textColor?: string
  /** Text label content */
  text?: string
  /** Text font size in pixels */
  textFontSize?: number
  /** Pixel gap between label arrow and text label */
  textGap?: number
  /** Pixel gap between candle wick (high/low) and label arrow tip */
  gap?: number
  /** Show small indicator arrow between text label and candle */
  showLabelArrow?: boolean
  /** Timestamp for positioning (milliseconds) */
  timestamp?: number
  /** Price value — used as fallback Y when candle data is unavailable */
  price?: number
}

// ---------------------------------------------------------------------------
// TradeLine — fluent API returned by createTradeLine()
// ---------------------------------------------------------------------------

export interface TradeLine {
  /** Overlay ID on the chart */
  readonly id: string
  /** Pane ID where the overlay is rendered */
  readonly paneId: string

  setDirection: (direction: 'up' | 'down') => TradeLine
  setArrowType: (type: 'wide' | 'arrow' | 'tiny') => TradeLine
  setColor: (color: string) => TradeLine
  setTextColor: (color: string) => TradeLine
  setText: (text: string) => TradeLine
  setTextFontSize: (size: number) => TradeLine
  setTextGap: (gap: number) => TradeLine
  setGap: (gap: number) => TradeLine
  setShowLabelArrow: (show: boolean) => TradeLine
  setTimestamp: (timestamp: number) => TradeLine
  setPrice: (price: number) => TradeLine

  /** Get current properties */
  getProperties: () => TradeLineProperties
  /** Remove this trade line from the chart */
  remove: () => void
}

// ---------------------------------------------------------------------------
// createTradeLine factory function
// ---------------------------------------------------------------------------

export function createTradeLine (
  chart: Chart,
  options?: Partial<TradeLineProperties>
): TradeLine {
  const properties: TradeLineProperties = { ...options }

  const result = chart.createOverlay({
    name: 'tradeLine',
    points: [{
      timestamp: properties.timestamp,
      value: properties.price ?? 0
    }],
    lock: true,
    visible: true,
    extendData: properties,
    paneId: 'candle_pane'
  })
  const overlayId = typeof result === 'string' ? result : null

  function update (): void {
    if (overlayId === null) return
    chart.overrideOverlay({
      id: overlayId,
      extendData: { ...properties },
      points: [{
        timestamp: properties.timestamp,
        value: properties.price ?? 0
      }]
    })
  }

  const self: TradeLine = {
    get id (): string {
      return overlayId ?? ''
    },

    get paneId (): string {
      return 'candle_pane'
    },

    setDirection (direction: 'up' | 'down'): TradeLine {
      properties.direction = direction
      update()
      return self
    },

    setArrowType (type: 'wide' | 'arrow' | 'tiny'): TradeLine {
      properties.arrowType = type
      update()
      return self
    },

    setColor (color: string): TradeLine {
      properties.color = color
      update()
      return self
    },

    setTextColor (color: string): TradeLine {
      properties.textColor = color
      update()
      return self
    },

    setText (text: string): TradeLine {
      properties.text = text
      update()
      return self
    },

    setTextFontSize (size: number): TradeLine {
      properties.textFontSize = size
      update()
      return self
    },

    setTextGap (gap: number): TradeLine {
      properties.textGap = gap
      update()
      return self
    },

    setGap (gap: number): TradeLine {
      properties.gap = gap
      update()
      return self
    },

    setShowLabelArrow (show: boolean): TradeLine {
      properties.showLabelArrow = show
      update()
      return self
    },

    setTimestamp (timestamp: number): TradeLine {
      properties.timestamp = timestamp
      update()
      return self
    },

    setPrice (price: number): TradeLine {
      properties.price = price
      update()
      return self
    },

    getProperties (): TradeLineProperties {
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
