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
 * Triangle Pattern (TradingView `triangle_pattern`, LineToolTrianglePattern).
 * 4 points, joined by one polyline (0-1-2-3). The two edges 0-2 and 1-3 are
 * projected to where they meet; the region between them, from the pattern's
 * left edge (or its right edge if they meet behind it) to that apex, is
 * filled and outlined dotted. Points are labelled A-D. Mirrors TV's
 * LineToolTrianglePatternPaneView.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { OverlayFigure } from '../../../../component/Overlay'
import type { ProOverlayTemplate } from '../../types'
import { labelAbove, patternProperties, pointLabel } from './patternShared'

/** The projected wedge (edge point on 0-2, edge point on 1-3, apex), or null
 *  when an edge is vertical or the two are parallel. */
export function triangleWedge (c: Coordinate[]): Coordinate[] | null {
  if (c.length !== 4) return null
  const [p0, p1, p2, p3] = c
  if (Math.abs(p2.x - p0.x) < 1 || Math.abs(p3.x - p1.x) < 1) return null
  const m1 = (p2.y - p0.y) / (p2.x - p0.x)
  const m2 = (p3.y - p1.y) / (p3.x - p1.x)
  if (Math.abs(m1 - m2) < 1e-6) return null
  const apexX = (p1.y - p0.y + (p0.x * m1 - p1.x * m2)) / (m1 - m2)
  const apex = { x: apexX, y: p0.y + (apexX - p0.x) * m1 }
  let edge = Math.min(p0.x, p1.x, p2.x, p3.x)
  if (apexX < edge) edge = Math.max(p0.x, p1.x, p2.x, p3.x)
  return [{ x: edge, y: p0.y + (edge - p0.x) * m1 }, { x: edge, y: p1.y + (edge - p1.x) * m2 }, apex]
}

const trianglePattern = (): ProOverlayTemplate => {
  const store = patternProperties({ color: '#673AB7', background: 'rgba(103, 58, 183, 0.15)' })

  return {
    name: 'trianglePattern',
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: c, overlay }) => {
      const id = overlay.id
      const width = store.getProperties(id).lineWidth ?? 2
      const wedge = triangleWedge(c)
      const figures: OverlayFigure[] = [{ type: 'line', key: 'main', attrs: { coordinates: c }, styles: store.line(id) }]
      if (wedge !== null) {
        figures.unshift({
          type: 'polygon',
          key: 'wedge',
          ignoreEvent: true,
          attrs: { coordinates: wedge },
          styles: { ...store.fill(id), style: 'stroke_fill', borderColor: store.color(id), borderSize: width, borderStyle: 'dashed', borderDashedValue: [width, width * 2] }
        })
      }
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: c.map((p, i) => pointLabel(p, 'ABCD'[i], labelAbove(c, i), `label_${i}`)),
        styles: store.label(id)
      })
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}

export default trianglePattern
