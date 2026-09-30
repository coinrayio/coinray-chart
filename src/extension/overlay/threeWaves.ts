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
import type { TextAttrs } from '../figure/text'
import type { OverlayFigure } from '../../component/Overlay'
import { resolveDegree } from './tv/patterns/elliottDegree'
import { elliottLabelFigures } from './tv/patterns/elliott'

/** TV's label sets for its correction wave, by degree set (see elliottDegree.ts). */
const LABEL_SETS = [
  ['0', 'A', 'B', 'C'],
  ['0', 'a', 'b', 'c'],
  ['0', 'A', 'B', 'C'],
  ['0', 'a', 'b', 'c'],
  ['0', 'A', 'B', 'C']
]

/**
 * extendData: `{ degree?: TV index 0-14 or its name, showWave?: boolean }`. With a degree the
 * labels are drawn as TV does (glyph style by degree); without one, the plain `(n)` labels.
 * `showWave: false` hides the line.
 */
interface WaveExtendData {
  degree?: number | string
  showWave?: boolean
}

/**
 * Three Waves overlay - 3-wave Elliott wave pattern
 * 4 points with labels: (0), (1), (2), (3)
 */
const threeWaves = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): DeepPartial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle,
      size: props.lineWidth,
      color: props.lineColor ?? props.borderColor,
      dashedValue: props.lineDashedValue
    }
  }

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
    name: 'threeWaves',
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const id = overlay.id
      const ext = (overlay.extendData ?? {}) as WaveExtendData
      const line: OverlayFigure[] = ext.showWave === false ? [] : [{ type: 'line', attrs: { coordinates }, styles: lineStyle(id) }]
      if (ext.degree !== undefined) {
        const props = properties.get(id) ?? {}
        return [...line, ...elliottLabelFigures(coordinates, LABEL_SETS, resolveDegree(ext.degree), props.lineColor ?? props.borderColor ?? props.textColor)]
      }
      const texts: TextAttrs[] = coordinates.map((coordinate, i) => ({
        x: coordinate.x,
        y: coordinate.y,
        text: `(${i})`,
        baseline: 'bottom'
      }))

      return [
        ...line,
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

export default threeWaves
