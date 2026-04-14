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
 * Styled Segment Overlay
 *
 * A line between two points with optional rotated text label at the midpoint.
 * Used for trendline alerts and base segments.
 */

import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'

import type { ProOverlayTemplate } from './types'

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export interface StyledSegmentProperties {
  lineColor?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed'
  lineDashedValue?: number[]

  text?: string
  textColor?: string
  textFontSize?: number
  textFont?: string
  /** Pixel gap between the line and the text (perpendicular offset) */
  textOffset?: number

  /** Whether the line ignores mouse/touch events (default: true) */
  ignoreEvent?: boolean
}

const defaults: Required<StyledSegmentProperties> = {
  lineColor: '#3ea6ff',
  lineWidth: 1,
  lineStyle: 'solid',
  lineDashedValue: [4, 4],

  text: '',
  textColor: '#3ea6ff',
  textFontSize: 12,
  textFont: 'Helvetica Neue',
  textOffset: 12,

  ignoreEvent: true
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const styledSegment = (): ProOverlayTemplate => {
  let properties: DeepPartial<StyledSegmentProperties> = {}

  const _extRef: { data: DeepPartial<StyledSegmentProperties> | null } = { data: null }

  const prop = <K extends keyof StyledSegmentProperties>(key: K): Required<StyledSegmentProperties>[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defs = defaults as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defs[key]) as Required<StyledSegmentProperties>[K]
  }

  return {
    name: 'styledSegment',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,

    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []

      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<StyledSegmentProperties>
        : null

      const text = prop('text')
      const textColor = prop('textColor')
      const textFontSize = prop('textFontSize')
      const textFont = prop('textFont')
      const textOffset = prop('textOffset')
      const ignoreEvent = prop('ignoreEvent')

      const lineStyles = {
        style: prop('lineStyle'),
        color: prop('lineColor'),
        size: prop('lineWidth'),
        dashedValue: prop('lineDashedValue')
      }

      const { x: x1, y: y1 } = coordinates[0]
      const { x: x2, y: y2 } = coordinates[1]

      const figures: Array<{
        type: string
        key?: string
        attrs: Record<string, unknown>
        styles?: Record<string, unknown>
        ignoreEvent?: boolean
      }> = [
        {
          type: 'line',
          key: 'segment',
          attrs: { coordinates: [{ x: x1, y: y1 }, { x: x2, y: y2 }] },
          styles: lineStyles,
          ignoreEvent
        }
      ]

      if (text.length > 0) {
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const perpX = -Math.sin(angle) * textOffset
        const perpY = Math.cos(angle) * textOffset

        figures.push({
          type: 'rotatedText',
          key: 'label',
          attrs: {
            x: midX + perpX,
            y: midY + perpY,
            text,
            angle,
            align: 'center',
            baseline: 'middle'
          },
          styles: {
            color: textColor,
            size: textFontSize,
            family: textFont
          }
        })
      }

      return figures
    },

    onRightClick: (event) => {
      ;(event as unknown as { preventDefault?: () => void }).preventDefault?.()
      return false
    },

    setProperties: (_properties: DeepPartial<StyledSegmentProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<StyledSegmentProperties>
    },

    getProperties: (_id: string): DeepPartial<StyledSegmentProperties> => properties
  }
}

export default styledSegment
