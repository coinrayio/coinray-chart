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

import type { ProOverlayTemplate } from './types'
import { centredLabel, labelAbove, midpoint, patternProperties, pointLabel, ratio } from './tv/patterns/patternShared'

/** [from, to, ratio] for each connector that has all its points. */
export function abcdConnectors (v: number[]): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  if (v.length >= 3) out.push([0, 2, ratio(v[0], v[1], v[2], 3)])
  if (v.length >= 4) out.push([1, 3, ratio(v[1], v[2], v[3], 3)])
  return out
}

/**
 * ABCD overlay - ABCD harmonic pattern
 * 4 points labelled A, B, C, D, styled like TV's `abcd_pattern`: a border
 * line through the points and dotted connectors A-C and B-D, with TV's pill labels
 * and the ratios BC/AB and CD/BC at the connectors' midpoints.
 */
const abcd = (): ProOverlayTemplate => {
  const store = patternProperties({ color: '#089981', background: 'transparent' })
  const tags = ['A', 'B', 'C', 'D']

  return {
    name: 'abcd',
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: c, overlay }) => {
      const id = overlay.id
      const connectors = abcdConnectors(overlay.points.map((p) => p.value ?? NaN))
      return [
        { type: 'line', key: 'main', attrs: { coordinates: c }, styles: store.line(id) },
        { type: 'line', key: 'connectors', ignoreEvent: true, attrs: connectors.map(([a, b]) => ({ coordinates: [c[a], c[b]] })), styles: store.dotted(id) },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: [
            ...connectors.map(([a, b, r], i) => centredLabel(midpoint(c[a], c[b]), String(r), `ratio_${i}`)),
            ...c.map((p, i) => pointLabel(p, tags[i], labelAbove(c, i), `label_${i}`))
          ],
          styles: store.label(id)
        }
      ]
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}

export default abcd
