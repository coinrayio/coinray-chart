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
 * Trade Line Overlay
 *
 * A klinecharts overlay template that renders directional trade arrows
 * (buy/sell) positioned relative to candle high/low. Supports three
 * arrow types: wide, arrow, and tiny.
 */

import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'

import type { ProOverlayTemplate } from './types'
import type { TradeLineProperties } from './tradeLineApi'

// ---------------------------------------------------------------------------
// Default style constants
// ---------------------------------------------------------------------------

const defaultTradeLineStyle: Required<Omit<TradeLineProperties, 'timestamp' | 'price'>> = {
  direction: 'up',
  arrowType: 'wide',
  color: '#4CAF50',
  textColor: '#FFFFFF',
  text: '',
  textFontSize: 12,
  textGap: 2,
  gap: 4
}

// ---------------------------------------------------------------------------
// Arrow geometry constants
// ---------------------------------------------------------------------------

// Wide arrow: narrow rect body + wider triangle head (stroke_fill)
const WIDE_BODY_W = 8
const WIDE_BODY_H = 12
const WIDE_HEAD_W = 16
const WIDE_HEAD_H = 10

// Arrow: line + chevron head
const ARROW_LINE_W = 2
const ARROW_LINE_H = 10
const ARROW_HEAD_W = 8
const ARROW_HEAD_H = 6

// Tiny: miniature line arrow
const TINY_LINE_W = 1
const TINY_LINE_H = 4
const TINY_HEAD_W = 4
const TINY_HEAD_H = 3

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const tradeLine = (): ProOverlayTemplate => {
  let properties: DeepPartial<TradeLineProperties> = {}

  const _extRef: { data: DeepPartial<TradeLineProperties> | null } = { data: null }

  const prop = <K extends keyof TradeLineProperties>(key: K): TradeLineProperties[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defaults = defaultTradeLineStyle as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defaults[key]) as TradeLineProperties[K]
  }

  return {
    name: 'tradeLine',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,

    createPointFigures: ({ coordinates, overlay, chart, yAxis }) => {
      const figures: Array<{
        type: string
        key?: string
        attrs: Record<string, unknown>
        styles?: Record<string, unknown>
        ignoreEvent?: boolean
      }> = []

      if (coordinates.length === 0 || yAxis == null) return []

      // Sync extendData
      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<TradeLineProperties>
        : null

      const direction = prop('direction') ?? 'up'
      const arrowType = prop('arrowType') ?? 'wide'
      const color = prop('color') ?? defaultTradeLineStyle.color
      const textColor = prop('textColor') ?? defaultTradeLineStyle.textColor
      const text = prop('text') ?? ''
      const gap = prop('gap') ?? defaultTradeLineStyle.gap

      const x = coordinates[0].x

      // Resolve Y from candle high/low at this dataIndex
      const point = overlay.points[0]
      const dataList = chart.getDataList()
      const dataIndex = point.dataIndex
      let anchorY = coordinates[0].y

      if (dataIndex != null && dataIndex >= 0 && dataIndex < dataList.length) {
        const candle = dataList[dataIndex]
        if (direction === 'up') {
          // Buy: arrow below candle low
          anchorY = yAxis.convertToPixel(candle.low)
        } else {
          // Sell: arrow above candle high
          anchorY = yAxis.convertToPixel(candle.high)
        }
      }

      // anchorY is candle edge. Arrow tip is at anchorY +/- gap
      // For 'up': tip points up toward candle, so tip is at anchorY + gap (below candle)
      //   arrow body extends downward from tip
      // For 'down': tip points down toward candle, so tip is at anchorY - gap (above candle)
      //   arrow body extends upward from tip

      const tipY = direction === 'up' ? anchorY + gap : anchorY - gap

      if (arrowType === 'wide') {
        drawWideArrow(figures, x, tipY, direction, color)
      } else if (arrowType === 'arrow') {
        drawArrow(figures, x, tipY, direction, color)
      } else {
        drawTinyArrow(figures, x, tipY, direction, color)
      }

      // Text label
      if (text.length > 0) {
        const textFontSize = prop('textFontSize') ?? defaultTradeLineStyle.textFontSize
        const textGap = prop('textGap') ?? defaultTradeLineStyle.textGap
        const textY = getTextY(tipY, direction, arrowType, textGap)
        figures.push({
          type: 'editableText',
          key: 'text',
          attrs: {
            x,
            y: textY,
            text,
            align: 'center',
            baseline: direction === 'up' ? 'top' : 'bottom'
          },
          styles: { color: textColor, size: textFontSize }
        })
      }

      return figures
    },

    // -----------------------------------------------------------------------
    // Property management
    // -----------------------------------------------------------------------
    setProperties: (_properties: DeepPartial<TradeLineProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<TradeLineProperties>
    },

    getProperties: (_id: string): DeepPartial<TradeLineProperties> => properties
  }
}

// ---------------------------------------------------------------------------
// Arrow drawing helpers
// ---------------------------------------------------------------------------

type FigureArray = Array<{
  type: string
  key?: string
  attrs: Record<string, unknown>
  styles?: Record<string, unknown>
  ignoreEvent?: boolean
}>

function drawWideArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfBodyW = WIDE_BODY_W / 2
  const halfHeadW = WIDE_HEAD_W / 2
  const strokeFillStyle = { style: 'stroke_fill', color, borderColor: color, borderSize: 1 }

  if (direction === 'up') {
    // Tip at tipY, arrow extends downward
    // Triangle head: tip -> left -> right (tip pointing up)
    const headBase = tipY + WIDE_HEAD_H
    figures.push({
      type: 'polygon',
      key: 'head',
      attrs: {
        coordinates: [
          { x, y: tipY },
          { x: x - halfHeadW, y: headBase },
          { x: x + halfHeadW, y: headBase }
        ]
      },
      styles: strokeFillStyle,
      ignoreEvent: true
    })
    // Rect body below head
    const bodyTop = headBase
    const bodyBottom = bodyTop + WIDE_BODY_H
    figures.push({
      type: 'polygon',
      key: 'body',
      attrs: {
        coordinates: [
          { x: x - halfBodyW, y: bodyTop },
          { x: x + halfBodyW, y: bodyTop },
          { x: x + halfBodyW, y: bodyBottom },
          { x: x - halfBodyW, y: bodyBottom }
        ]
      },
      styles: strokeFillStyle,
      ignoreEvent: true
    })
  } else {
    // Tip at tipY, arrow extends upward
    // Rect body above head
    const bodyBottom = tipY - WIDE_HEAD_H
    const bodyTop = bodyBottom - WIDE_BODY_H
    figures.push({
      type: 'polygon',
      key: 'body',
      attrs: {
        coordinates: [
          { x: x - halfBodyW, y: bodyTop },
          { x: x + halfBodyW, y: bodyTop },
          { x: x + halfBodyW, y: bodyBottom },
          { x: x - halfBodyW, y: bodyBottom }
        ]
      },
      styles: strokeFillStyle,
      ignoreEvent: true
    })
    // Triangle head: tip -> left -> right (tip pointing down)
    const headBase = tipY - WIDE_HEAD_H
    figures.push({
      type: 'polygon',
      key: 'head',
      attrs: {
        coordinates: [
          { x, y: tipY },
          { x: x - halfHeadW, y: headBase },
          { x: x + halfHeadW, y: headBase }
        ]
      },
      styles: strokeFillStyle,
      ignoreEvent: true
    })
  }
}

function drawArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfHeadW = ARROW_HEAD_W / 2

  if (direction === 'up') {
    // Chevron head at tip pointing up
    const headBase = tipY + ARROW_HEAD_H
    figures.push({
      type: 'line',
      key: 'head-left',
      attrs: { coordinates: [{ x, y: tipY }, { x: x - halfHeadW, y: headBase }] },
      styles: { color, size: ARROW_LINE_W },
      ignoreEvent: true
    })
    figures.push({
      type: 'line',
      key: 'head-right',
      attrs: { coordinates: [{ x, y: tipY }, { x: x + halfHeadW, y: headBase }] },
      styles: { color, size: ARROW_LINE_W },
      ignoreEvent: true
    })
    // Vertical line from tip down
    figures.push({
      type: 'line',
      key: 'stem',
      attrs: { coordinates: [{ x, y: tipY }, { x, y: tipY + ARROW_HEAD_H + ARROW_LINE_H }] },
      styles: { color, size: ARROW_LINE_W },
      ignoreEvent: true
    })
  } else {
    // Chevron head at tip pointing down
    const headBase = tipY - ARROW_HEAD_H
    figures.push({
      type: 'line',
      key: 'head-left',
      attrs: { coordinates: [{ x, y: tipY }, { x: x - halfHeadW, y: headBase }] },
      styles: { color, size: ARROW_LINE_W },
      ignoreEvent: true
    })
    figures.push({
      type: 'line',
      key: 'head-right',
      attrs: { coordinates: [{ x, y: tipY }, { x: x + halfHeadW, y: headBase }] },
      styles: { color, size: ARROW_LINE_W },
      ignoreEvent: true
    })
    // Vertical line from tip up
    figures.push({
      type: 'line',
      key: 'stem',
      attrs: { coordinates: [{ x, y: tipY }, { x, y: tipY - ARROW_HEAD_H - ARROW_LINE_H }] },
      styles: { color, size: ARROW_LINE_W },
      ignoreEvent: true
    })
  }
}

function drawTinyArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfHeadW = TINY_HEAD_W / 2

  if (direction === 'up') {
    const headBase = tipY + TINY_HEAD_H
    figures.push({
      type: 'line',
      key: 'head-left',
      attrs: { coordinates: [{ x, y: tipY }, { x: x - halfHeadW, y: headBase }] },
      styles: { color, size: TINY_LINE_W },
      ignoreEvent: true
    })
    figures.push({
      type: 'line',
      key: 'head-right',
      attrs: { coordinates: [{ x, y: tipY }, { x: x + halfHeadW, y: headBase }] },
      styles: { color, size: TINY_LINE_W },
      ignoreEvent: true
    })
    figures.push({
      type: 'line',
      key: 'stem',
      attrs: { coordinates: [{ x, y: tipY }, { x, y: tipY + TINY_HEAD_H + TINY_LINE_H }] },
      styles: { color, size: TINY_LINE_W },
      ignoreEvent: true
    })
  } else {
    const headBase = tipY - TINY_HEAD_H
    figures.push({
      type: 'line',
      key: 'head-left',
      attrs: { coordinates: [{ x, y: tipY }, { x: x - halfHeadW, y: headBase }] },
      styles: { color, size: TINY_LINE_W },
      ignoreEvent: true
    })
    figures.push({
      type: 'line',
      key: 'head-right',
      attrs: { coordinates: [{ x, y: tipY }, { x: x + halfHeadW, y: headBase }] },
      styles: { color, size: TINY_LINE_W },
      ignoreEvent: true
    })
    figures.push({
      type: 'line',
      key: 'stem',
      attrs: { coordinates: [{ x, y: tipY }, { x, y: tipY - TINY_HEAD_H - TINY_LINE_H }] },
      styles: { color, size: TINY_LINE_W },
      ignoreEvent: true
    })
  }
}

function getTextY (tipY: number, direction: 'up' | 'down', arrowType: 'wide' | 'arrow' | 'tiny', textGap: number): number {
  const totalHeight = arrowType === 'wide'
    ? WIDE_HEAD_H + WIDE_BODY_H
    : arrowType === 'arrow'
      ? ARROW_HEAD_H + ARROW_LINE_H
      : TINY_HEAD_H + TINY_LINE_H

  // Text goes at the far end of the arrow (opposite the tip)
  if (direction === 'up') {
    // Arrow extends downward from tip, text below
    return tipY + totalHeight + textGap
  } else {
    // Arrow extends upward from tip, text above
    return tipY - totalHeight - textGap
  }
}

export default tradeLine
