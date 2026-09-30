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
 * The small icons TV puts before each row of a trend line's stats box: a vertical range for the
 * price row, a horizontal one for bars / time / distance, and an angle for the last. Each is a few
 * polylines about 12px across, drawn around the given centre.
 */

export type StatsIcon = 'price' | 'bars' | 'angle'

export const STATS_ICON_COLOR = 'rgba(255, 255, 255, 0.9)'

interface Point { x: number, y: number }
export interface IconFigure { type: 'line', attrs: { coordinates: Point[] }, styles: { color: string, size: number, style: 'solid' }, ignoreEvent: true }

/** Polylines, in 12 x 12 units around (0, 0). */
const SHAPES: Record<StatsIcon, Array<Array<[number, number]>>> = {
  price: [[[-3, -6], [3, -6]], [[-3, 6], [3, 6]], [[0, -6], [0, 6]], [[-2, -3.5], [0, -6], [2, -3.5]], [[-2, 3.5], [0, 6], [2, 3.5]]],
  // Two small candles with a double arrow between them.
  bars: [
    [[-6.5, -2.5], [-4.5, -2.5], [-4.5, 2.5], [-6.5, 2.5], [-6.5, -2.5]], [[-5.5, -4.5], [-5.5, -2.5]], [[-5.5, 2.5], [-5.5, 4.5]],
    [[4.5, -2.5], [6.5, -2.5], [6.5, 2.5], [4.5, 2.5], [4.5, -2.5]], [[5.5, -4.5], [5.5, -2.5]], [[5.5, 2.5], [5.5, 4.5]],
    [[-3, 0], [3, 0]], [[-1.5, -1.5], [-3, 0], [-1.5, 1.5]], [[1.5, -1.5], [3, 0], [1.5, 1.5]]
  ],
  angle: [[[-6, 5], [6, 5]], [[-6, 5], [4, -5]], [[0, 5], [0, 4], [-1, 2.5], [-3, 1.2]]]
}

/** The icon's figures, centred at (cx, cy). */
export function statsIconFigures (icon: StatsIcon, cx: number, cy: number): IconFigure[] {
  return SHAPES[icon].map((points) => ({
    type: 'line',
    attrs: { coordinates: points.map(([x, y]) => ({ x: cx + x, y: cy + y })) },
    styles: { color: STATS_ICON_COLOR, size: 1, style: 'solid' },
    ignoreEvent: true
  }))
}
