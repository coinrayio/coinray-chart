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

/** TV's left / right line end, kept on `extendData` (see `EXTEND_DATA_PROPERTY_KEYS`). */
export interface EndCaps {
  endCapLeft?: 'normal' | 'arrow'
  endCapRight?: 'normal' | 'arrow'
}

/** Samples back from an end that give the head a stable direction on a sampled curve or hand-drawn stroke. */
const LOOKBACK = 3

/** TV's barb length per pixel of line width (measured: 15 px at width 2, 30 px at width 4). */
const BARB_PER_WIDTH = 7.5

/** TV's line end: an open head, two barbs at 45 degrees back from `tip`, as one polyline. */
export function lineEndCoordinates (from: Coordinate, tip: Coordinate, size: number): Coordinate[] {
  const len = Math.hypot(tip.x - from.x, tip.y - from.y)
  if (len === 0) return []
  const ux = (tip.x - from.x) / len
  const uy = (tip.y - from.y) / len
  const barb = BARB_PER_WIDTH * size
  const c = Math.SQRT1_2
  const at = (side: number): Coordinate => ({
    x: tip.x - barb * (ux * c - side * uy * c),
    y: tip.y - barb * (uy * c + side * ux * c)
  })
  return [at(1), tip, at(-1)]
}

/** TV's line-end arrows for the ends of `coordinates` that ask for one. `lookback` is how many
 *  samples back the head's direction is read (1 for a polyline whose last segment is the direction). */
export function endCapFigures (
  coordinates: Coordinate[], caps: EndCaps | undefined, color: string | undefined, size = 1, lookback = LOOKBACK
): Array<{ type: string, key: string, attrs: unknown, styles: unknown }> {
  const last = coordinates.length - 1
  if (last < 1) return []
  const back = Math.min(lookback, last)
  const styles = { style: 'solid', color, size }
  const figures: Array<{ type: string, key: string, attrs: unknown, styles: unknown }> = []
  if (caps?.endCapRight === 'arrow') {
    figures.push({ type: 'line', key: 'head_end', attrs: { coordinates: lineEndCoordinates(coordinates[last - back], coordinates[last], size) }, styles })
  }
  if (caps?.endCapLeft === 'arrow') {
    figures.push({ type: 'line', key: 'head_start', attrs: { coordinates: lineEndCoordinates(coordinates[back], coordinates[0], size) }, styles })
  }
  return figures
}

/** TV's Extend left / right on a curve, kept on `extendData`. */
export interface Extends {
  extendLeft?: boolean
  extendRight?: boolean
}

interface Bounds { width: number, height: number }

const outside = (p: Coordinate, b: Bounds): boolean => p.x < -b.width || p.x > 2 * b.width || p.y < -b.height || p.y > 2 * b.height
const EXTEND_STEPS = 600

/** A straight ray from `tip`, continuing the direction `from` -> `tip`, far enough to leave the pane. */
export function rayCoordinates (from: Coordinate, tip: Coordinate, bounds: Bounds): Coordinate[] {
  const len = Math.hypot(tip.x - from.x, tip.y - from.y)
  if (len === 0) return []
  const reach = 3 * (bounds.width + bounds.height)
  return [tip, { x: tip.x + ((tip.x - from.x) / len) * reach, y: tip.y + ((tip.y - from.y) / len) * reach }]
}

/** The curve's own quadratic run on past its end: `point(t)` sampled for t = t0 + k * step until it leaves the pane. */
export function runOn (point: (t: number) => Coordinate, t0: number, step: number, bounds: Bounds): Coordinate[] {
  const out: Coordinate[] = []
  for (let k = 1; k <= EXTEND_STEPS; k++) {
    const p = point(t0 + k * step)
    out.push(p)
    if (outside(p, bounds)) break
  }
  return out
}
