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
 * Three Drives Pattern (TradingView `3divers_pattern`, LineToolThreeDrivers).
 * 7 points, joined by one polyline. Points 1, 3 and 5 are the drive tops
 * (or bottoms): dotted connectors 1-3 and 3-5 carry the retracement ratio of
 * each drive against the pullback before it, as a pill at their midpoint.
 * TV draws no fill for this tool. Mirrors LineToolThreeDrivesPaneView.
 */

import type { ProOverlayTemplate } from '../../types'
import { centredLabel, midpoint, patternProperties, ratio } from './patternShared'

const threeDrives = (): ProOverlayTemplate => {
  const store = patternProperties({ color: '#673AB7', background: 'rgba(149, 40, 204, 0.5)' })

  return {
    name: 'threeDrives',
    totalStep: 8,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates: c, overlay }) => {
      const id = overlay.id
      const v = overlay.points.map((p) => p.value ?? NaN)
      const connectors: Array<[number, number, number]> = []
      // [from, to, ratio], only once the drive's last point exists.
      if (c.length >= 4) connectors.push([1, 3, ratio(v[1], v[2], v[3], 2)])
      if (c.length >= 6) connectors.push([3, 5, ratio(v[3], v[4], v[5], 2)])
      return [
        { type: 'line', key: 'main', attrs: { coordinates: c }, styles: store.line(id) },
        { type: 'line', key: 'connectors', ignoreEvent: true, attrs: connectors.map(([a, b]) => ({ coordinates: [c[a], c[b]] })), styles: store.dotted(id, store.getProperties(id).lineWidth ?? 2) },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: connectors.map(([a, b, r], i) => centredLabel(midpoint(c[a], c[b]), String(r), `ratio_${i}`)),
          styles: store.label(id)
        }
      ]
    },
    setProperties: store.setProperties,
    getProperties: store.getProperties
  }
}

export default threeDrives
