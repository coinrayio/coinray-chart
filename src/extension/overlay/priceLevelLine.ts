/**
 * Price Level Line Overlay
 *
 * A horizontal price line split into two segments with plain text label
 * in the gap between them. No background or border on the text.
 * Includes a customizable Y-axis price badge.
 *
 * Layout:
 *   ─── left line ───  "Label"  ─── right line ───
 */

import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'
import { calcTextWidth } from '../../common/utils/canvas'

import type { ProOverlayTemplate } from './types'

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export interface PriceLevelLineProperties {
  price?: number
  text?: string
  textColor?: string
  textFontSize?: number
  textFont?: string
  textGap?: number

  lineColor?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed'
  lineDashedValue?: number[]

  /** Position of the text along the line (0–100%, default: 50) */
  textPositionPercent?: number
  /** Named text alignment shorthand: 'left' | 'center' | 'right' */
  textAlign?: 'left' | 'center' | 'right'

  /** Whether to show the Y-axis price label (default: true) */
  yAxisLabelVisible?: boolean
  /** Background color of the Y-axis label (falls back to lineColor) */
  yAxisLabelBackgroundColor?: string
  /** Text color of the Y-axis label (default: '#FFFFFF') */
  yAxisLabelTextColor?: string
  /** Border color of the Y-axis label (falls back to yAxisLabelBackgroundColor) */
  yAxisLabelBorderColor?: string
}

const TEXT_ALIGN_PERCENT: Record<string, number> = { left: 5, center: 50, right: 95 }

const defaults: Required<Omit<PriceLevelLineProperties, 'price' | 'textAlign' | 'yAxisLabelBackgroundColor' | 'yAxisLabelBorderColor'>> = {
  text: '',
  textColor: '#D05DDF',
  textFontSize: 12,
  textFont: 'Helvetica Neue',
  textGap: 6,

  lineColor: '#D05DDF',
  lineWidth: 1,
  lineStyle: 'solid',
  lineDashedValue: [4, 4],

  textPositionPercent: 50,

  yAxisLabelVisible: true,
  yAxisLabelTextColor: '#FFFFFF'
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const priceLevelLine = (): ProOverlayTemplate => {
  let properties: DeepPartial<PriceLevelLineProperties> = {}

  const _extRef: { data: DeepPartial<PriceLevelLineProperties> | null } = { data: null }

  const prop = <K extends keyof typeof defaults>(key: K): (typeof defaults)[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defs = defaults as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defs[key]) as (typeof defaults)[K]
  }

  return {
    name: 'priceLevelLine',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,

    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length === 0) return []

      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<PriceLevelLineProperties>
        : null

      const y = coordinates[0].y
      const text = prop('text')
      const textFontSize = prop('textFontSize')
      const textFont = prop('textFont')
      const textGap = prop('textGap')
      const lineColor = prop('lineColor')

      // textColor falls back to lineColor
      const ext = _extRef.data as Record<string, unknown> | null
      const props = properties as Record<string, unknown>
      const textColor = (ext?.textColor ?? props.textColor ?? lineColor) as string

      // Resolve text position: explicit percent > named align > default
      const textAlign = (ext?.textAlign ?? props.textAlign) as string | undefined
      const posPercent = (ext?.textPositionPercent ??
        props.textPositionPercent ??
        (textAlign != null ? TEXT_ALIGN_PERCENT[textAlign] : undefined) ??
        defaults.textPositionPercent) as number

      const lineStyles = {
        style: prop('lineStyle'),
        color: lineColor,
        size: prop('lineWidth'),
        dashedValue: prop('lineDashedValue')
      }

      const figures: Array<{ type: string; key?: string; attrs: Record<string, unknown>; styles?: Record<string, unknown>; ignoreEvent?: boolean }> = []

      if (text.length === 0) {
        // No text — single full-width horizontal line
        figures.push({
          type: 'line',
          key: 'line',
          attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          styles: lineStyles,
          ignoreEvent: true
        })
      } else {
        const textW = calcTextWidth(text, textFontSize, 'normal', textFont)
        const gapW = textW + textGap * 2

        // Position text along the line
        const centerX = bounding.width * (posPercent / 100)
        const gapLeft = centerX - gapW / 2
        const gapRight = centerX + gapW / 2

        // Left line: from left edge to gap
        figures.push({
          type: 'line',
          key: 'line-left',
          attrs: { coordinates: [{ x: 0, y }, { x: Math.max(0, gapLeft), y }] },
          styles: lineStyles,
          ignoreEvent: true
        })

        // Right line: from gap to right edge
        figures.push({
          type: 'line',
          key: 'line-right',
          attrs: { coordinates: [{ x: Math.min(bounding.width, gapRight), y }, { x: bounding.width, y }] },
          styles: lineStyles,
          ignoreEvent: true
        })

        // Text in the gap — no background, no border
        figures.push({
          type: 'text',
          key: 'label',
          attrs: {
            x: centerX,
            y,
            text,
            align: 'center',
            baseline: 'middle'
          },
          styles: {
            color: textColor,
            size: textFontSize,
            family: textFont,
            backgroundColor: 'transparent',
            borderSize: 0,
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0
          }
        })
      }

      return figures
    },

    // Y-axis label
    createYAxisFigures: ({ overlay, coordinates, chart }) => {
      if (coordinates.length === 0) return []

      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<PriceLevelLineProperties>
        : null

      const ext = _extRef.data as Record<string, unknown> | null
      const props = properties as Record<string, unknown>

      const yAxisLabelVisible = (ext?.yAxisLabelVisible ?? props.yAxisLabelVisible ?? defaults.yAxisLabelVisible) as boolean
      if (!yAxisLabelVisible) return []

      const y = coordinates[0].y
      const price = overlay.points[0]?.value
      if (price === undefined) return []

      const precision = chart.getSymbol()?.pricePrecision ?? 2
      const priceText = Number(price).toFixed(precision)
      const lineColor = prop('lineColor')

      const bgColor = (ext?.yAxisLabelBackgroundColor ?? props.yAxisLabelBackgroundColor ?? lineColor) as string
      const textColor = (ext?.yAxisLabelTextColor ?? props.yAxisLabelTextColor ?? defaults.yAxisLabelTextColor) as string
      const borderColor = (ext?.yAxisLabelBorderColor ?? props.yAxisLabelBorderColor ?? bgColor) as string

      return [{
        type: 'text',
        attrs: { x: 0, y, text: priceText, align: 'left', baseline: 'middle' },
        styles: {
          style: 'fill',
          color: textColor,
          size: 12,
          backgroundColor: bgColor,
          borderColor,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 4,
          paddingBottom: 4,
          borderRadius: 0
        },
        ignoreEvent: true
      }]
    },

    onRightClick: (event) => {
      ;(event as unknown as { preventDefault?: () => void }).preventDefault?.()
      return false
    },

    setProperties: (_properties: DeepPartial<PriceLevelLineProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<PriceLevelLineProperties>
    },

    getProperties: (_id: string): DeepPartial<PriceLevelLineProperties> => properties
  }
}

export default priceLevelLine
