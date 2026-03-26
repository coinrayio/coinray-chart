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
 * Each tradeLine renders TWO arrows:
 *
 * 1. MAIN ARROW — inside the candle body (one of three types):
 *    wide  — stroke_fill rect body + wider triangle head
 *    arrow — line-based stem + chevron head (smaller)
 *    tiny  — chevron head only (V for down, A for up — no stem)
 *
 * 2. LABEL ARROW — small indicator arrow between the text label and
 *    the candle, pointing toward the candle. Optional (showLabelArrow).
 *
 * Layout (sell/down example):
 *   "0.5 @2127.73"    ← text label above candle
 *        ↓             ← label arrow (optional)
 *      ┃   ┃           ← candle wick
 *   ┌──────────┐
 *   │    ▼     │       ← main arrow inside candle body
 *   └──────────┘
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
  gap: 4,
  showLabelArrow: true
}

// ---------------------------------------------------------------------------
// Arrow geometry constants — main arrows (inside candle body)
// ---------------------------------------------------------------------------

// Wide arrow: narrow rect body + wider triangle head (stroke_fill)
const WIDE_BODY_W = 8
const WIDE_BODY_H = 12
const WIDE_HEAD_W = 16
const WIDE_HEAD_H = 10

// Arrow (line-based): stem + chevron head — smaller than wide
const ARROW_LINE_W = 2
const ARROW_LINE_H = 6
const ARROW_HEAD_W = 7
const ARROW_HEAD_H = 4

// Tiny: filled triangle head only (no stem) — like a mini wide head
const TINY_HEAD_W = 10
const TINY_HEAD_H = 6

// Label indicator arrow (between text and candle)
const LABEL_HEAD_W = 6
const LABEL_HEAD_H = 4
const LABEL_LINE_W = 1.5
const LABEL_LINE_H = 4

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

    createPointFigures: ({ coordinates, overlay }) => {
      const figures: FigureArray = []

      if (coordinates.length === 0) return []

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
      const showLabelArrow = prop('showLabelArrow') ?? defaultTradeLineStyle.showLabelArrow

      const x = coordinates[0].x
      // coordinates[0].y is the pixel Y of the `price` prop (or 0 fallback)
      const priceY = coordinates[0].y

      // -------------------------------------------------------------------
      // 1. MAIN ARROW — anchored at the specified price level
      //    The arrow tip points toward the price; body extends away from it.
      // -------------------------------------------------------------------
      const mainTotalH = getArrowTotalHeight(arrowType)
      // buy (up): tip at priceY, body extends downward
      // sell (down): tip at priceY, body extends upward
      const mainTipY = direction === 'up'
        ? priceY - mainTotalH
        : priceY + mainTotalH

      if (arrowType === 'wide') {
        drawWideArrow(figures, x, mainTipY, direction, color)
      } else if (arrowType === 'arrow') {
        drawLineArrow(figures, x, mainTipY, direction, color)
      } else {
        drawTinyArrow(figures, x, mainTipY, direction, color)
      }

      // -------------------------------------------------------------------
      // Label arrow + text — positioned below the main arrow (away from price)
      //
      // Layout (buy/up):
      //   price level (priceY)
      //   main arrow (tip at priceY - totalH, base at priceY)
      //     ↕ gap
      //   label arrow tip
      //     ↕ labelTotalH
      //     ↕ textGap
      //   text
      // -------------------------------------------------------------------
      // Main arrow base: the end opposite the tip
      const mainBaseY = direction === 'up'
        ? mainTipY + mainTotalH
        : mainTipY - mainTotalH

      if (text.length > 0) {
        const textFontSize = prop('textFontSize') ?? defaultTradeLineStyle.textFontSize
        const textGap = prop('textGap') ?? defaultTradeLineStyle.textGap
        const labelTotalH = LABEL_HEAD_H + LABEL_LINE_H

        if (showLabelArrow) {
          // Label arrow tip starts gap px beyond the main arrow base
          // buy (up): label tip below main base → mainBaseY + gap
          // sell (down): label tip above main base → mainBaseY - gap
          const labelTipY = direction === 'up'
            ? mainBaseY + gap
            : mainBaseY - gap

          drawLabelArrow(figures, x, labelTipY, direction, color)

          // Text beyond the label arrow
          const textY = direction === 'up'
            ? labelTipY + labelTotalH + textGap
            : labelTipY - labelTotalH - textGap

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
        } else {
          // No label arrow — text directly beyond main arrow base
          const textY = direction === 'up'
            ? mainBaseY + gap
            : mainBaseY - gap

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

function getArrowTotalHeight (arrowType: 'wide' | 'arrow' | 'tiny'): number {
  return arrowType === 'wide'
    ? WIDE_HEAD_H + WIDE_BODY_H
    : arrowType === 'arrow'
      ? ARROW_HEAD_H + ARROW_LINE_H
      : TINY_HEAD_H
}

// ---------------------------------------------------------------------------
// Main arrow type 1: WIDE — stroke_fill rect body + wider triangle head
// ---------------------------------------------------------------------------

function drawWideArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfBodyW = WIDE_BODY_W / 2
  const halfHeadW = WIDE_HEAD_W / 2
  const strokeFillStyle = { style: 'stroke_fill', color, borderColor: color, borderSize: 1 }

  if (direction === 'up') {
    const headBase = tipY + WIDE_HEAD_H
    figures.push({
      type: 'polygon',
      key: 'main-head',
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
    figures.push({
      type: 'polygon',
      key: 'main-body',
      attrs: {
        coordinates: [
          { x: x - halfBodyW, y: headBase },
          { x: x + halfBodyW, y: headBase },
          { x: x + halfBodyW, y: headBase + WIDE_BODY_H },
          { x: x - halfBodyW, y: headBase + WIDE_BODY_H }
        ]
      },
      styles: strokeFillStyle,
      ignoreEvent: true
    })
  } else {
    const headBase = tipY - WIDE_HEAD_H
    figures.push({
      type: 'polygon',
      key: 'main-body',
      attrs: {
        coordinates: [
          { x: x - halfBodyW, y: headBase - WIDE_BODY_H },
          { x: x + halfBodyW, y: headBase - WIDE_BODY_H },
          { x: x + halfBodyW, y: headBase },
          { x: x - halfBodyW, y: headBase }
        ]
      },
      styles: strokeFillStyle,
      ignoreEvent: true
    })
    figures.push({
      type: 'polygon',
      key: 'main-head',
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

// ---------------------------------------------------------------------------
// Main arrow type 2: ARROW — line stem + chevron head
// ---------------------------------------------------------------------------

function drawLineArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfHeadW = ARROW_HEAD_W / 2
  const sign = direction === 'up' ? 1 : -1
  const headBase = tipY + ARROW_HEAD_H * sign

  // Single 3-point polyline for chevron head: left-arm → tip → right-arm
  figures.push({
    type: 'line',
    key: 'main-head',
    attrs: {
      coordinates: [
        { x: x - halfHeadW, y: headBase },
        { x, y: tipY },
        { x: x + halfHeadW, y: headBase }
      ]
    },
    styles: { color, size: ARROW_LINE_W },
    ignoreEvent: true
  })
  // Vertical stem from tip extending away
  figures.push({
    type: 'line',
    key: 'main-stem',
    attrs: {
      coordinates: [
        { x, y: tipY },
        { x, y: tipY + (ARROW_HEAD_H + ARROW_LINE_H) * sign }
      ]
    },
    styles: { color, size: ARROW_LINE_W },
    ignoreEvent: true
  })
}

// ---------------------------------------------------------------------------
// Main arrow type 3: TINY — filled triangle head only (no stem)
// ---------------------------------------------------------------------------

function drawTinyArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfHeadW = TINY_HEAD_W / 2
  const headBase = direction === 'up' ? tipY + TINY_HEAD_H : tipY - TINY_HEAD_H

  figures.push({
    type: 'polygon',
    key: 'main-head',
    attrs: {
      coordinates: [
        { x, y: tipY },
        { x: x - halfHeadW, y: headBase },
        { x: x + halfHeadW, y: headBase }
      ]
    },
    styles: { style: 'stroke_fill', color, borderColor: color, borderSize: 1 },
    ignoreEvent: true
  })
}

// ---------------------------------------------------------------------------
// LABEL ARROW — small indicator between text and candle
// ---------------------------------------------------------------------------

function drawLabelArrow (figures: FigureArray, x: number, tipY: number, direction: 'up' | 'down', color: string): void {
  const halfHeadW = LABEL_HEAD_W / 2
  const sign = direction === 'up' ? 1 : -1
  const headBase = tipY + LABEL_HEAD_H * sign

  // Single 3-point polyline for chevron
  figures.push({
    type: 'line',
    key: 'label-head',
    attrs: {
      coordinates: [
        { x: x - halfHeadW, y: headBase },
        { x, y: tipY },
        { x: x + halfHeadW, y: headBase }
      ]
    },
    styles: { color, size: LABEL_LINE_W },
    ignoreEvent: true
  })
  // Short stem extending away from tip
  figures.push({
    type: 'line',
    key: 'label-stem',
    attrs: {
      coordinates: [
        { x, y: tipY },
        { x, y: tipY + (LABEL_HEAD_H + LABEL_LINE_H) * sign }
      ]
    },
    styles: { color, size: LABEL_LINE_W },
    ignoreEvent: true
  })
}

export default tradeLine
