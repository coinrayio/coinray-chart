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

const circle: OverlayTemplate = {
  name: 'circle',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length === 2) {
      const cx = coordinates[0].x
      const cy = coordinates[0].y
      const dx = coordinates[1].x - cx
      const dy = coordinates[1].y - cy
      const r = Math.sqrt(dx * dx + dy * dy)
      return [
        {
          type: 'circle',
          attrs: { cx, cy, r },
          styles: { style: 'stroke' }
        }
      ]
    }
    return []
  }
}

export default circle
