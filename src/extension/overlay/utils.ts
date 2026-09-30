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

import type Coordinate from '../../common/Coordinate'
import type Bounding from '../../common/Bounding'

import { getLinearYFromCoordinates, type LineAttrs } from '../figure/line'

/**
 * Get rotated coordinate around a target point
 */
export function getRotateCoordinate (
  coordinate: Coordinate,
  targetCoordinate: Coordinate,
  angle: number
): Coordinate {
  const x =
    (coordinate.x - targetCoordinate.x) * Math.cos(angle) -
    (coordinate.y - targetCoordinate.y) * Math.sin(angle) +
    targetCoordinate.x
  const y =
    (coordinate.x - targetCoordinate.x) * Math.sin(angle) +
    (coordinate.y - targetCoordinate.y) * Math.cos(angle) +
    targetCoordinate.y
  return { x, y }
}

/**
 * Get ray line extending to bounding edge
 */
export function getRayLine (coordinates: Coordinate[], bounding: Bounding): LineAttrs | LineAttrs[] {
  if (coordinates.length > 1) {
    let coordinate = { x: 0, y: 0 }
    if (coordinates[0].x === coordinates[1].x && coordinates[0].y !== coordinates[1].y) {
      if (coordinates[0].y < coordinates[1].y) {
        coordinate = {
          x: coordinates[0].x,
          y: bounding.height
        }
      } else {
        coordinate = {
          x: coordinates[0].x,
          y: 0
        }
      }
    } else if (coordinates[0].x > coordinates[1].x) {
      coordinate = {
        x: 0,
        y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: 0, y: coordinates[0].y })
      }
    } else {
      coordinate = {
        x: bounding.width,
        y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: bounding.width, y: coordinates[0].y })
      }
    }
    return { coordinates: [coordinates[0], coordinate] }
  }
  return []
}

/**
 * Get distance between two coordinates
 */
export function getDistance (coordinate1: Coordinate, coordinate2: Coordinate): number {
  const xDis = Math.abs(coordinate1.x - coordinate2.x)
  const yDis = Math.abs(coordinate1.y - coordinate2.y)
  return Math.sqrt(xDis * xDis + yDis * yDis)
}

/**
 * Triangle for an arrowhead whose tip is `to`, pointing away from `from`:
 * `length` px deep, `length` px wide. Empty when the two points coincide.
 */
export function arrowHeadCoordinates (from: Coordinate, to: Coordinate, length: number): Coordinate[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  if (len === 0) return []
  const ux = (to.x - from.x) / len
  const uy = (to.y - from.y) / len
  const bx = to.x - ux * length
  const by = to.y - uy * length
  return [to, { x: bx - uy * length / 2, y: by + ux * length / 2 }, { x: bx + uy * length / 2, y: by - ux * length / 2 }]
}
