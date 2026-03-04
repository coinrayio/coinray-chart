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

import type { OverlayTemplate } from '../../component/Overlay'
import { getLinearYFromCoordinates } from '../figure/line'

const segment: OverlayTemplate = {
  name: 'segment',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length === 2) {
      const ext = overlay.extendData as { extendLeft?: boolean; extendRight?: boolean } | undefined
      const extendLeft = ext?.extendLeft === true
      const extendRight = ext?.extendRight === true

      if (!extendLeft && !extendRight) {
        return [{ type: 'line', attrs: { coordinates } }]
      }

      // Vertical line — extend top/bottom
      if (coordinates[0].x === coordinates[1].x) {
        const minY = Math.min(coordinates[0].y, coordinates[1].y)
        const maxY = Math.max(coordinates[0].y, coordinates[1].y)
        return [{
          type: 'line',
          attrs: {
            coordinates: [
              { x: coordinates[0].x, y: extendLeft ? 0 : minY },
              { x: coordinates[0].x, y: extendRight ? bounding.height : maxY }
            ]
          }
        }]
      }

      // Determine left/right points
      const [leftPt, rightPt] = coordinates[0].x <= coordinates[1].x
        ? [coordinates[0], coordinates[1]]
        : [coordinates[1], coordinates[0]]

      const startX = extendLeft ? 0 : leftPt.x
      const endX = extendRight ? bounding.width : rightPt.x

      return [{
        type: 'line',
        attrs: {
          coordinates: [
            { x: startX, y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: startX, y: leftPt.y }) },
            { x: endX, y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: endX, y: rightPt.y }) }
          ]
        }
      }]
    }
    return []
  }
}

export default segment
