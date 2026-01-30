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
import type { LineStyle, TextStyle, PolygonStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import type { LineAttrs } from '../figure/line'
import type { TextAttrs } from '../figure/text'

interface PolygonAttrs {
  coordinates: Array<{ x: number; y: number }>
}

/**
 * XABCD overlay - XABCD harmonic pattern
 * 5 points with labels: (X), (A), (B), (C), (D)
 * Includes dashed lines connecting X-B, A-C, B-D
 * Includes filled polygons for triangular regions
 */
const xabcd = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const tags = ['X', 'A', 'B', 'C', 'D']

  const polygonStyle = (id: string): DeepPartial<PolygonStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.style ?? 'fill',
      color: props.backgroundColor ?? 'rgba(22, 119, 255, 0.15)',
      borderColor: props.lineColor ?? props.borderColor,
      borderSize: props.borderWidth,
      borderStyle: props.borderStyle ?? props.lineStyle
    }
  }

  const lineStyle = (id: string): DeepPartial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle,
      size: props.lineWidth,
      color: props.lineColor ?? props.borderColor,
      dashedValue: props.lineDashedValue
    }
  }

  const dashedLineStyle = (id: string): DeepPartial<LineStyle> => ({
    ...lineStyle(id),
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
    name: 'xabcd',
    totalStep: 6,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    styles: {
      polygon: {
        color: 'rgba(22, 119, 255, 0.15)'
      }
    },
    createPointFigures: ({ coordinates, overlay }) => {
      const id = overlay.id
      const dashedLines: LineAttrs[] = []
      const polygons: PolygonAttrs[] = []

      const texts: TextAttrs[] = coordinates.map((coordinate, i) => ({
        x: coordinate.x,
        y: coordinate.y,
        baseline: 'bottom',
        text: `(${tags[i]})`
      }))

      if (coordinates.length > 2) {
        dashedLines.push({ coordinates: [coordinates[0], coordinates[2]] })
        polygons.push({ coordinates: [coordinates[0], coordinates[1], coordinates[2]] })
        if (coordinates.length > 3) {
          dashedLines.push({ coordinates: [coordinates[1], coordinates[3]] })
          if (coordinates.length > 4) {
            dashedLines.push({ coordinates: [coordinates[2], coordinates[4]] })
            polygons.push({ coordinates: [coordinates[2], coordinates[3], coordinates[4]] })
          }
        }
      }

      return [
        {
          type: 'line',
          attrs: { coordinates },
          styles: lineStyle(id)
        },
        {
          type: 'line',
          attrs: dashedLines,
          styles: dashedLineStyle(id)
        },
        {
          type: 'polygon',
          ignoreEvent: true,
          attrs: polygons,
          styles: polygonStyle(id)
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

export default xabcd
