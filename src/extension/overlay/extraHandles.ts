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
 * Extra drag handles shared by tools whose TradingView handles sit where no
 * point does (see `Overlay.createExtraHandles`).
 */

import type Coordinate from '../../common/Coordinate'
import type Point from '../../common/Point'
import type { Overlay } from '../../component/Overlay'

type Hooks = Pick<Overlay, 'createExtraHandles' | 'moveExtraHandle'> & Partial<Pick<Overlay, 'handleCursor'>>

const setTime = (p: Partial<Point>, q: Partial<Point>): void => {
  p.timestamp = q.timestamp
  p.dataIndex = q.dataIndex
}

const setValue = (p: Partial<Point>, q: Partial<Point>): void => {
  p.value = q.value
}

/**
 * A box on two opposite corners (points 0 and 1): the other two corners and,
 * with `edges`, each edge's midpoint as TV's square handle. A corner moves the
 * time of one point and the price of the other; an edge moves one of the four.
 */
export function boxHandles (edges: boolean): Hooks {
  return {
    createExtraHandles: ({ coordinates }) => {
      if (coordinates.length < 2) return []
      const [a, b] = coordinates
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      return [
        { x: a.x, y: b.y },
        { x: b.x, y: a.y },
        ...(edges
          ? [
              { x: mx, y: a.y, square: true },
              { x: b.x, y: my, square: true },
              { x: mx, y: b.y, square: true },
              { x: a.x, y: my, square: true }
            ]
          : [])
      ]
    },
    // TV's resize arrows: a corner's diagonal runs through the box's opposite
    // corner, so it flips with the box; edges point straight across them.
    handleCursor: ({ coordinates, index }) => {
      if (coordinates.length < 2) return undefined
      const [a, b] = coordinates
      if (index >= 4) return index % 2 === 0 ? 'ns-resize' : 'ew-resize'
      // Points 0 and 1 are opposite corners, as are extra handles 0 and 1.
      const down = index < 2 ? (b.x - a.x) * (b.y - a.y) > 0 : (b.x - a.x) * (b.y - a.y) < 0
      return down ? 'nwse-resize' : 'nesw-resize'
    },
    moveExtraHandle: ({ overlay, index, coordinate, toPoint }) => {
      const [a, b] = overlay.points
      const q = toPoint(coordinate)
      switch (index) {
        case 0: setTime(a, q); setValue(b, q); break
        case 1: setTime(b, q); setValue(a, q); break
        case 2: setValue(a, q); break
        case 3: setTime(b, q); break
        case 4: setValue(b, q); break
        case 5: setTime(a, q); break
      }
    }
  }
}

/**
 * The far line's handle at point 0's time, for channels whose far line is set
 * by point 2 at point 1's time (flat top/bottom, disjoint channel). Dragging it
 * slides that line up or down, as dragging point 2 does.
 */
export function farLineStartHandle (farLineAt: (coordinates: Coordinate[], x: number) => number): Hooks {
  return {
    createExtraHandles: ({ coordinates }) => {
      if (coordinates.length < 3) return []
      const x = coordinates[0].x
      return [{ x, y: farLineAt(coordinates, x) }]
    },
    moveExtraHandle: ({ overlay, coordinate, coordinates, toPoint }) => {
      const c = coordinates[2]
      const shift = coordinate.y - farLineAt(coordinates, coordinates[0].x)
      setValue(overlay.points[2], toPoint({ x: c.x, y: c.y + shift }))
    }
  }
}
