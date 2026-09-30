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
 * Cypher Pattern (TradingView `cypher_pattern`, LineToolCypherPattern).
 * 5 points X, A, B, C, D on one polyline. Triangles X-A-B and B-C-D are
 * filled; dotted connectors X-B, A-C, B-D and X-D carry pills with the
 * ratios AB/XA, XC/XA, CD/BC and CD/XC at their midpoints. Mirrors TV's
 * CypherPaneView over Pattern5pointsPaneView.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { ProOverlayTemplate } from '../../types'
import { centredLabel, labelAbove, midpoint, patternProperties, pointLabel, ratio } from './patternShared'

/** [from, to, ratio] for each connector that has all its points, as TV rounds them. */
export function cypherConnectors (v: number[]): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  if (v.length >= 3) out.push([0, 2, ratio(v[0], v[1], v[2], 3)])
  // XC / XA, unlike the base pattern's BC / AB.
  if (v.length >= 4) out.push([1, 3, Math.round(Math.abs((v[3] - v[0]) / (v[1] - v[0])) * 1000) / 1000])
  if (v.length >= 5) {
    out.push([2, 4, ratio(v[2], v[3], v[4], 3)])
    out.push([0, 4, Math.round(Math.abs((v[4] - v[3]) / (v[0] - v[3])) * 1000) / 1000])
  }
  return out
}

const cypher = (): ProOverlayTemplate => {
  const store = patternProperties({ color: '#2962FF', background: 'rgba(41, 98, 255, 0.15)' })

  return {
    name: 'cypherPattern',
    totalStep: 6,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: c, overlay }) => {
      const id = overlay.id
      const connectors = cypherConnectors(overlay.points.map((p) => p.value ?? NaN))
      const triangles: Coordinate[][] = []
      if (c.length >= 3) triangles.push([c[0], c[1], c[2]])
      if (c.length >= 4) triangles.push([c[2], c[3], c[c.length === 5 ? 4 : 3]])
      return [
        { type: 'polygon', key: 'fill', ignoreEvent: true, attrs: triangles.map((coordinates) => ({ coordinates })), styles: store.fill(id) },
        { type: 'line', key: 'main', attrs: { coordinates: c }, styles: store.line(id) },
        { type: 'line', key: 'connectors', ignoreEvent: true, attrs: connectors.map(([a, b]) => ({ coordinates: [c[a], c[b]] })), styles: store.dotted(id) },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: [
            ...connectors.map(([a, b, r], i) => centredLabel(midpoint(c[a], c[b]), String(r), `ratio_${i}`)),
            ...c.map((p, i) => pointLabel(p, 'XABCD'[i], labelAbove(c, i), `label_${i}`))
          ],
          styles: store.label(id)
        }
      ]
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}

export default cypher
