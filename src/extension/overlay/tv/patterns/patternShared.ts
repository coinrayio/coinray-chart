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
 * Shared bits of the TradingView pattern tools (head and shoulders, triangle,
 * three drives, cypher): the per-overlay properties store, TV's rounded
 * "pill" point label, and the small geometry helpers they all use.
 */

import type Coordinate from '../../../../common/Coordinate'
import type DeepPartial from '../../../../common/DeepPartial'
import type { LineStyle, PolygonStyle, TextStyle } from '../../../../common/Styles'
import { merge, clone } from '../../../../common/utils/typeChecks'
import type { TextAttrs } from '../../../figure/text'
import type { OverlayProperties } from '../../types'

export interface PatternDefaults {
  /** TV `color`: the outline, and the label pill's background. */
  color: string
  /** TV `backgroundColor` with `transparency` applied. */
  background: string
}

/** TV's dotted connector pattern (`LINESTYLE_DOTTED`). */
const DOTTED = [1, 3]

export interface PatternProperties {
  setProperties: (next: DeepPartial<OverlayProperties>, id: string) => void
  getProperties: (id: string) => DeepPartial<OverlayProperties>
  color: (id: string) => string
  line: (id: string) => Partial<LineStyle>
  dotted: (id: string, size?: number) => Partial<LineStyle>
  fill: (id: string) => Partial<PolygonStyle>
  label: (id: string) => DeepPartial<TextStyle>
}

export function patternProperties (defaults: PatternDefaults, defaultWidth = 2): PatternProperties {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()
  const get = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  const setProperties = (next: DeepPartial<OverlayProperties>, id: string): void => {
    const merged = clone(get(id)) as Record<string, unknown>
    merge(merged, next)
    properties.set(id, merged as DeepPartial<OverlayProperties>)
  }

  const color = (id: string): string => get(id).lineColor ?? get(id).borderColor ?? defaults.color

  return {
    setProperties,
    getProperties: get,
    color,
    line: (id: string): Partial<LineStyle> => ({
      style: get(id).lineStyle ?? 'solid',
      dashedValue: get(id).lineDashedValue ?? [2, 2],
      size: get(id).lineWidth ?? defaultWidth,
      color: color(id)
    }),
    dotted: (id: string, size = 1): Partial<LineStyle> => ({ style: 'dashed', dashedValue: DOTTED, size, color: color(id) }),
    /** A transparent `backgroundColor` is how the fill is switched off. */
    fill: (id: string): Partial<PolygonStyle> => ({ style: 'fill', color: get(id).backgroundColor ?? defaults.background }),
    /** The pill: text over a rounded box in the outline colour. */
    label: (id: string): DeepPartial<TextStyle> => {
      const p = get(id)
      return {
        color: p.textColor ?? '#FFFFFF',
        size: p.textFontSize ?? 12,
        family: p.textFont,
        weight: p.textFontWeight,
        fontStyle: p.textFontStyle,
        backgroundColor: color(id),
        borderRadius: 4,
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 3,
        paddingBottom: 3
      }
    }
  }
}

/** Whether TV puts a point's label above it: a peak, or the first point when
 *  the next one is lower. Screen y grows downwards. */
export function labelAbove (coordinates: Coordinate[], index: number): boolean {
  if (index === 0) return coordinates.length > 1 && coordinates[1].y > coordinates[0].y
  return coordinates[index].y < coordinates[index - 1].y
}

/** A pill label 5 px off `at`, above or below it. */
export function pointLabel (at: Coordinate, text: string, above: boolean, key: string): TextAttrs {
  return { key, x: at.x, y: at.y + (above ? -5 : 5), text, align: 'center', baseline: above ? 'bottom' : 'top' }
}

/** A pill label centred on `at`. */
export function centredLabel (at: Coordinate, text: string, key: string): TextAttrs {
  return { key, x: at.x, y: at.y, text, align: 'center', baseline: 'middle' }
}

export const midpoint = (a: Coordinate, b: Coordinate): Coordinate => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** `|(c - b) / (b - a)|` rounded to `digits`, TV's retracement figure. */
export function ratio (a: number, b: number, c: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(Math.abs((c - b) / (b - a)) * f) / f
}

/**
 * Where the infinite line `a`→`b` meets the segment `p`→`q`, as the parameter
 * along `a`→`b` (0 at `a`, 1 at `b`, unbounded); null when parallel or when the
 * crossing falls off the segment. Same contract as TV's `intersectLineSegments`.
 */
export function lineCrossesSegment (a: Coordinate, b: Coordinate, p: Coordinate, q: Coordinate): number | null {
  const ux = b.x - a.x
  const uy = b.y - a.y
  const vx = q.x - p.x
  const vy = q.y - p.y
  const d = ux * vy - uy * vx
  if (Math.abs(d) < 1e-6) return null
  const t = ((a.y - p.y) * vx - (a.x - p.x) * vy) / d
  const s = ((a.y - p.y) * ux - (a.x - p.x) * uy) / d
  return s >= -1e-9 && s <= 1 + 1e-9 ? t : null
}

export const along = (a: Coordinate, b: Coordinate, t: number): Coordinate => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
