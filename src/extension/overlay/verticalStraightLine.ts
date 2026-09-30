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
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { TV_BLUE, lineAroundText, tvDashedValue, verticalLineText } from './tvLine'
import { HORIZONTAL_DEFAULT_WIDTH } from './horizontalRayLine'
import { timeAxisLabel } from './crossLine'

const verticalStraightLine = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    const size = props.lineWidth ?? HORIZONTAL_DEFAULT_WIDTH
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? TV_BLUE,
      size,
      dashedValue: tvDashedValue(props.lineDashedValue, size)
    }
  }

  const textStyle = (id: string): Partial<TextStyle> => {
    const props = properties.get(id) ?? {}
    return {
      color: props.textColor ?? TV_BLUE,
      size: props.textFontSize ?? 14,
      weight: props.textFontWeight ?? DEFAULT_OVERLAY_PROPERTIES.textFontWeight,
      fontStyle: props.textFontStyle ?? DEFAULT_OVERLAY_PROPERTIES.textFontStyle,
      family: props.textFont ?? DEFAULT_OVERLAY_PROPERTIES.textFont,
      paddingLeft: props.textPaddingLeft ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingLeft,
      paddingRight: props.textPaddingRight ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingRight,
      paddingTop: props.textPaddingTop ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingTop,
      paddingBottom: props.textPaddingBottom ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingBottom,
      backgroundColor: props.textBackgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.textBackgroundColor
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const current = properties.get(id) ?? {}
    const newProps = clone(current) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }

  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: 'verticalStraightLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const id = overlay.id
      const props = properties.get(id) ?? {}
      const text = props.text ?? DEFAULT_OVERLAY_PROPERTIES.text
      const figures: Array<{ type: string; attrs: unknown; styles?: unknown }> = [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: coordinates[0].x, y: 0 },
              { x: coordinates[0].x, y: bounding.height }
            ]
          },
          styles: lineStyle(id)
        }
      ]
      // TV turns the text to read along the line: top/middle/bottom are along it, left/centre/right beside it.
      const place = verticalLineText(coordinates[0].x, bounding.height, props, { horizontal: 'center', vertical: 'middle' })
      const style = textStyle(id)
      if (place.baseline === 'middle') {
        const line = [{ x: coordinates[0].x, y: 0 }, { x: coordinates[0].x, y: bounding.height }]
        figures[0] = { ...figures[0], attrs: lineAroundText(line, place, text, style).map((coordinates) => ({ coordinates })) }
      }
      figures.push({ type: 'editableText', attrs: { ...place, text }, styles: style })
      return figures
    },
    createXAxisFigures: (params) => timeAxisLabel(params, lineStyle(params.overlay.id).color),
    setProperties,
    getProperties
  }
}

export default verticalStraightLine
