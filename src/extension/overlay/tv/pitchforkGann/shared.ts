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
 * Helpers shared by the pitchfork and Gann tools: the per-overlay property
 * store every pro overlay carries, a ray helper, and level defaults.
 */

import type Coordinate from '../../../../common/Coordinate'
import type DeepPartial from '../../../../common/DeepPartial'
import type { LineStyle } from '../../../../common/Styles'
import { merge, clone } from '../../../../common/utils/typeChecks'
import type { OverlayProperties } from '../../types'

/** The `properties` Map plus `setProperties` / `getProperties` every pro overlay repeats. */
export const propertyStore = (): {
  get: (id: string) => DeepPartial<OverlayProperties>
  setProperties: (properties: DeepPartial<OverlayProperties>, id: string) => void
} => {
  const store = new Map<string, DeepPartial<OverlayProperties>>()
  return {
    get: (id) => store.get(id) ?? {},
    setProperties: (properties, id) => {
      const next = clone(store.get(id) ?? {}) as Record<string, unknown>
      merge(next, properties)
      store.set(id, next as DeepPartial<OverlayProperties>)
    }
  }
}

/** A line through `a` and `b`, optionally running on past either end far enough to leave the pane. */
export function extendedLine (a: Coordinate, b: Coordinate, left: boolean, right: boolean, size: { width: number, height: number }): [Coordinate, Coordinate] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return [a, b]
  const far = 3 * (size.width + size.height) + Math.max(Math.abs(a.x), Math.abs(a.y))
  const k = far / len
  return [
    left ? { x: a.x - dx * k, y: a.y - dy * k } : a,
    right ? { x: a.x + dx * k, y: a.y + dy * k } : b
  ]
}

/** A level: ratio, colour and whether it is drawn. */
export interface Level { value: number, color: string, enabled: boolean, lineStyle?: LineStyle['style'], lineWidth?: number, lineDashedValue?: number[] }

/** Levels from the overlay's `figureLevels`, else the tool's defaults, ascending. */
export function resolveLevels (custom: DeepPartial<OverlayProperties>['figureLevels'], defaults: Level[], oneColor?: string): Level[] {
  const levels = custom !== undefined && custom.length > 0
    ? custom.map((l, i) => ({
      value: l.value ?? defaults.at(i)?.value ?? 0,
      color: l.color ?? defaults.at(i)?.color ?? '#787b86',
      enabled: l.enabled !== false,
      lineStyle: l.lineStyle,
      lineWidth: l.lineWidth,
      lineDashedValue: l.lineDashedValue
    }))
    : defaults
  return levels.filter((l) => l.enabled).sort((a, b) => a.value - b.value).map((l) => oneColor === undefined ? l : { ...l, color: oneColor })
}
