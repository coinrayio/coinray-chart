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
 * Head and Shoulders (TradingView `head_and_shoulders`, LineToolHeadAndShoulders).
 * 7 points: 0 start, 1 left shoulder, 2 left trough, 3 head, 4 right trough,
 * 5 right shoulder, 6 end. The dotted neckline runs through the troughs (2, 4)
 * and is extended to where it meets the outer legs (0-1 and 5-6), or off
 * either side when it doesn't. The head and the two shoulder wedges are
 * filled between the neckline and the outline. Mirrors TV's
 * LineToolHeadAndShouldersPaneView.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { OverlayFigure } from '../../../../component/Overlay'
import type { ProOverlayTemplate } from '../../types'
import { along, labelAbove, lineCrossesSegment, patternProperties, pointLabel } from './patternShared'

const LABELS: Record<number, string> = { 1: 'Left Shoulder', 3: 'Head', 5: 'Right Shoulder' }

/** The neckline's two ends, given the pixel points seen so far. */
export function necklineEnds (c: Coordinate[]): { left: Coordinate | null, right: Coordinate | null } {
  if (c.length < 5) return { left: null, right: null }
  const cross = (p: Coordinate, q: Coordinate): Coordinate | null => {
    const t = lineCrossesSegment(c[2], c[4], p, q)
    return t === null ? null : along(c[2], c[4], t)
  }
  return { left: cross(c[0], c[1]), right: c.length === 7 ? cross(c[5], c[6]) : null }
}

const headAndShoulders = (): ProOverlayTemplate => {
  const store = patternProperties({ color: '#089981', background: 'rgba(8, 153, 129, 0.15)' })

  return {
    name: 'headAndShoulders',
    totalStep: 8,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: c, overlay }) => {
      const id = overlay.id
      const { left, right } = necklineEnds(c)
      const wedges: Coordinate[][] = []
      if (c.length >= 5) wedges.push([c[2], c[3], c[4]])
      if (left !== null) wedges.push([left, c[1], c[2]])
      if (right !== null) wedges.push([c[4], c[5], right])

      const figures: OverlayFigure[] = [
        { type: 'polygon', key: 'fill', ignoreEvent: true, attrs: wedges.map((coordinates) => ({ coordinates })), styles: store.fill(id) },
        { type: 'line', key: 'main', attrs: { coordinates: c }, styles: store.line(id) }
      ]
      if (c.length >= 5) {
        figures.push({
          type: 'line',
          key: 'neckline',
          attrs: { coordinates: [left ?? c[2], right ?? c[4]] },
          styles: store.dotted(id, store.getProperties(id).lineWidth ?? 2)
        })
      }
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: [1, 3, 5].filter((i) => i < c.length).map((i) => pointLabel(c[i], LABELS[i], labelAbove(c, i), `label_${i}`)),
        styles: store.label(id)
      })
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}

export default headAndShoulders
