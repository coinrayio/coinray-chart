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
import type { LineAttrs } from '../figure/line'
import type { TextAttrs } from '../figure/text'

/**
 * ABCD overlay - ABCD harmonic pattern
 * 4 points with labels: (A), (B), (C), (D)
 * Includes dashed lines connecting A-C and B-D
 */
const abcd = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const tags = ['A', 'B', 'C', 'D']

  const line1Style = (id: string): DeepPartial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle,
      size: props.lineWidth,
      color: props.lineColor ?? props.borderColor,
      dashedValue: props.lineDashedValue
    }
  }

  const line2Style = (id: string): DeepPartial<LineStyle> => ({
    ...line1Style(id),
    style: 'dashed'
  })

  const textStyle = (id: string): DeepPartial<TextStyle> => {
    const props = properties.get(id) ?? {}
    return {
      color: props.textColor,
      family: props.textFont,
      size: props.textFontSize,
      weight: props.textFontWeight,
      backgroundColor: props.textBackgroundColor,
      paddingLeft: props.textPaddingLeft,
      paddingRight: props.textPaddingRight,
      paddingTop: props.textPaddingTop,
      paddingBottom: props.textPaddingBottom
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
    name: 'abcd',
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const id = overlay.id
      const acLineCoordinates: LineAttrs[] = []
      const bdLineCoordinates: LineAttrs[] = []

      const texts: TextAttrs[] = coordinates.map((coordinate, i) => ({
        x: coordinate.x,
        y: coordinate.y,
        baseline: 'bottom',
        text: `(${tags[i]})`
      }))

      if (coordinates.length > 2) {
        acLineCoordinates.push({ coordinates: [coordinates[0], coordinates[2]] })
        if (coordinates.length > 3) {
          bdLineCoordinates.push({ coordinates: [coordinates[1], coordinates[3]] })
        }
      }

      return [
        {
          type: 'line',
          attrs: { coordinates },
          styles: line1Style(id)
        },
        {
          type: 'line',
          attrs: [...acLineCoordinates, ...bdLineCoordinates],
          styles: line2Style(id)
        },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: texts,
          styles: textStyle(id)
        }
      ]
    },
    setProperties,
    getProperties
  }
}

export default abcd
