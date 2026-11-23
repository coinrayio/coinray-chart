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
 * Shift snaps in SCREEN space, shared by the engine's handle drags and the
 * tools' own extra handles so both snap a drawing the same way.
 */

import type Coordinate from '../Coordinate'

/**
 * The nearest 45° direction from `anchor`. The cursor is projected onto it
 * rather than keeping its raw distance: sliding sideways shortens the line
 * instead of swinging its far end out past the pointer.
 */
export function snapAngle (anchor: Coordinate, coordinate: Coordinate): Coordinate {
  const dx = coordinate.x - anchor.x
  const dy = coordinate.y - anchor.y
  if (dx === 0 && dy === 0) return coordinate
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const reach = dx * cos + dy * sin
  return { x: anchor.x + reach * cos, y: anchor.y + reach * sin }
}

/** A square with its opposite corner on `anchor`, as big as the cursor's larger reach. */
export function snapSquare (anchor: Coordinate, coordinate: Coordinate): Coordinate {
  const dx = coordinate.x - anchor.x
  const dy = coordinate.y - anchor.y
  if (dx === 0 && dy === 0) return coordinate
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: anchor.x + (dx < 0 ? -side : side), y: anchor.y + (dy < 0 ? -side : side) }
}

/**
 * For a shape whose axis runs `axisStart` → `axisEnd` and whose width point is
 * the cursor: half the axis length off the axis, so an ellipse is a circle and
 * a rotated rectangle a square. Keeps the cursor's position along the axis and
 * its side of it.
 */
export function snapWidth (axisStart: Coordinate, axisEnd: Coordinate, coordinate: Coordinate): Coordinate {
  const ax = axisEnd.x - axisStart.x
  const ay = axisEnd.y - axisStart.y
  const length = Math.hypot(ax, ay)
  if (length === 0) return coordinate
  const nx = -ay / length
  const ny = ax / length
  const side = (coordinate.x - axisStart.x) * nx + (coordinate.y - axisStart.y) * ny < 0 ? -1 : 1
  const along = ((coordinate.x - axisStart.x) * ax + (coordinate.y - axisStart.y) * ay) / length
  const mid = { x: axisStart.x + ax / 2, y: axisStart.y + ay / 2 }
  const reach = along - length / 2
  return {
    x: mid.x + (ax / length) * reach + nx * side * (length / 2),
    y: mid.y + (ay / length) * reach + ny * side * (length / 2)
  }
}
