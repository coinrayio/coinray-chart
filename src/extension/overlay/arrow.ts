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

const arrow: OverlayTemplate = {
  name: 'arrow',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length === 2) {
      const start = coordinates[0]
      const end = coordinates[1]

      // Calculate arrow head
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const headLength = 15
      const headAngle = Math.PI / 6 // 30 degrees

      const arrowHead1 = {
        x: end.x - headLength * Math.cos(angle - headAngle),
        y: end.y - headLength * Math.sin(angle - headAngle)
      }
      const arrowHead2 = {
        x: end.x - headLength * Math.cos(angle + headAngle),
        y: end.y - headLength * Math.sin(angle + headAngle)
      }

      return [
        {
          type: 'line',
          attrs: { coordinates: [start, end] }
        },
        {
          type: 'line',
          attrs: { coordinates: [arrowHead1, end] }
        },
        {
          type: 'line',
          attrs: { coordinates: [arrowHead2, end] }
        }
      ]
    }
    return []
  }
}

export default arrow
