/**
 * Vertical Line Overlay
 *
 * A vertical line split into two segments with rotated (-90°) text label
 * in the gap between them.
 *
 * Layout:
 *   ─── top line ───
 *        gap
 *   "Label text"   ← rotated -90° text (reads bottom to top)
 *        gap
 *   ─── bottom line ──
 */

import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'
import { calcTextWidth } from '../../common/utils/canvas'

import type { ProOverlayTemplate } from './types'

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export interface TimeLineProperties {
  lineColor?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed'
  lineDashedValue?: number[]

  text?: string
  textColor?: string
  textFontSize?: number
  textFont?: string
  textGap?: number
}

const defaults: Required<TimeLineProperties> = {
  lineColor: '#3ea6ff',
  lineWidth: 1,
  lineStyle: 'solid',
  lineDashedValue: [4, 4],

  text: '',
  textColor: '#3ea6ff',
  textFontSize: 12,
  textFont: 'Helvetica Neue',
  textGap: 4
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const timeLine = (): ProOverlayTemplate => {
  let properties: DeepPartial<TimeLineProperties> = {}

  const _extRef: { data: DeepPartial<TimeLineProperties> | null } = { data: null }

  const prop = <K extends keyof TimeLineProperties>(key: K): TimeLineProperties[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defs = defaults as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defs[key]) as TimeLineProperties[K]
  }

  return {
    name: 'timeLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: false,

    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length === 0) return []

      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<TimeLineProperties>
        : null

      const x = coordinates[0].x
      const text = prop('text') ?? ''
      const textColor = prop('textColor') ?? defaults.textColor
      const textFontSize = prop('textFontSize') ?? defaults.textFontSize
      const textFont = prop('textFont') ?? defaults.textFont
      const textGap = prop('textGap') ?? defaults.textGap

      const lineStyles = {
        style: prop('lineStyle'),
        color: prop('lineColor'),
        size: prop('lineWidth'),
        dashedValue: prop('lineDashedValue')
      }

      const figures: Array<{ type: string; key?: string; attrs: Record<string, unknown>; styles?: Record<string, unknown>; ignoreEvent?: boolean }> = []

      if (text.length === 0) {
        figures.push({
          type: 'line',
          key: 'line',
          attrs: { coordinates: [{ x, y: 0 }, { x, y: bounding.height }] },
          styles: lineStyles
        })
      } else {
        const textW = calcTextWidth(text, textFontSize, 'normal', textFont)
        const gapH = textW + textGap * 2

        const midY = bounding.height / 2
        const gapTop = midY - gapH / 2
        const gapBottom = midY + gapH / 2

        figures.push({
          type: 'line',
          key: 'line-top',
          attrs: { coordinates: [{ x, y: 0 }, { x, y: gapTop }] },
          styles: lineStyles
        })

        figures.push({
          type: 'line',
          key: 'line-bottom',
          attrs: { coordinates: [{ x, y: gapBottom }, { x, y: bounding.height }] },
          styles: lineStyles
        })

        figures.push({
          type: 'rotatedText',
          key: 'label',
          attrs: {
            x,
            y: midY,
            text,
            angle: -Math.PI / 2,
            align: 'center',
            baseline: 'middle'
          },
          styles: { color: textColor, size: textFontSize, family: textFont }
        })
      }

      return figures
    },

    onRightClick: (event) => {
      ;(event as unknown as { preventDefault?: () => void }).preventDefault?.()
      return false
    },

    setProperties: (_properties: DeepPartial<TimeLineProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<TimeLineProperties>
    },

    getProperties: (_id: string): DeepPartial<TimeLineProperties> => properties
  }
}

export default timeLine
