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
 * Andrews Pitchfork family — TradingView's `pitchfork`, `schiff_pitchfork`,
 * `schiff_pitchfork_modified`, `inside_pitchfork` and `pitchfan`.
 *
 * Three points: 0 is the handle, 1 and 2 the swing high/low it forks. The
 * variants differ only in where the median line starts (mirrors TV's
 * PitchforkLinePaneView / PitchfanLinePaneView in lt-pane-views):
 *
 *   pitchfork                 the handle, point 0
 *   schiffPitchfork           midpoint of 0→1
 *   modifiedSchiffPitchfork   x of point 0, y at the midpoint of 0→1
 *   insidePitchfork           midpoint of 0→1, median ends on point 2
 *   pitchfan                  rays from point 0 through the levels on 1→2
 *
 * Levels sit at `coeff` × half of 1→2 either side of the median. TV's nine
 * defaults are used, with 0.5 and 1 on. Fill is per band, in the outer
 * level's colour.
 *
 * properties.figureLevels: `[{ value, enabled, color }]`.
 * extendData: `{ extendLeft, showBackground, backgroundOpacity }` (opacity in
 * percent, TV's transparency 80 = 20).
 */

import type Coordinate from '../../../../common/Coordinate'
import type { LineStyle } from '../../../../common/Styles'
import type { OverlayTemplate } from '../../../../component/Overlay'
import type { ProOverlayTemplate } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { levelLineStyle, withAlpha } from '../../fibonacciShared'
import { extendedLine, propertyStore, resolveLevels } from './shared'
import type { Level } from './shared'

export type PitchforkKind = 'original' | 'schiff' | 'modified' | 'inside' | 'fan'

export const PITCHFORK_LEVELS: Level[] = [
  { value: 0.25, color: '#ffb74d', enabled: false },
  { value: 0.382, color: '#81c784', enabled: false },
  { value: 0.5, color: '#089981', enabled: true },
  { value: 0.618, color: '#089981', enabled: false },
  { value: 0.75, color: '#00bcd4', enabled: false },
  { value: 1, color: '#2962ff', enabled: true },
  { value: 1.5, color: '#9c27b0', enabled: false },
  { value: 1.75, color: '#e91e63', enabled: false },
  { value: 2, color: '#f77c80', enabled: false }
]
// TV paints the pitchfan's 0.5 sky blue instead of green.
const PITCHFAN_LEVELS = PITCHFORK_LEVELS.map((l) => (l.value === 0.5 ? { ...l, color: '#00bcd4' } : l))

const MEDIAN_COLOR = '#f23645'
const DEFAULT_OPACITY = 20

interface PitchforkExtendData {
  extendLeft?: boolean
  showBackground?: boolean
  backgroundOpacity?: number
}

export interface PitchforkGeometry {
  /** Midpoint of 1→2, the median's target. */
  mid: Coordinate
  /** Half of 1→2: a level `k` sits at `mid ± half * k`. */
  half: Coordinate
  /** The line drawn as median (extendable). */
  median: [Coordinate, Coordinate]
  /** Fixed segments: the 1→2 handle line, plus TV's extras for the Schiff/inside variants. */
  segments: Array<[Coordinate, Coordinate]>
  /** Where a level line at coefficient `k` starts and points. */
  level: (k: number, side: 1 | -1) => [Coordinate, Coordinate]
}

const add = (a: Coordinate, b: Coordinate): Coordinate => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Coordinate, b: Coordinate): Coordinate => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Coordinate, k: number): Coordinate => ({ x: a.x * k, y: a.y * k })

export function pitchforkGeometry (kind: PitchforkKind, p0: Coordinate, p1: Coordinate, p2: Coordinate): PitchforkGeometry {
  const mid = scale(add(p1, p2), 0.5)
  const half = scale(sub(p2, p1), 0.5)
  const handle: [Coordinate, Coordinate] = [p1, p2]
  const back: [Coordinate, Coordinate] = [p0, p1]
  const at = (k: number, side: 1 | -1): Coordinate => add(mid, scale(half, k * side))

  if (kind === 'fan') {
    return { mid, half, median: [p0, mid], segments: [handle], level: (k, side) => [p0, at(k, side)] }
  }
  const base = kind === 'original'
    ? p0
    : kind === 'modified' ? { x: p0.x, y: (p0.y + p1.y) / 2 } : scale(add(p0, p1), 0.5)
  if (kind === 'inside') {
    const dir = sub(p2, base)
    return { mid, half, median: [mid, add(mid, dir)], segments: [handle, back, [base, p2]], level: (k, side) => [at(k, side), add(at(k, side), dir)] }
  }
  const dir = sub(mid, base)
  return {
    mid,
    half,
    median: [base, mid],
    segments: kind === 'original' ? [handle] : [handle, back],
    level: (k, side) => [at(k, side), add(at(k, side), dir)]
  }
}

const pitchfork = (kind: PitchforkKind, name: string) => (): ProOverlayTemplate => {
  const store = propertyStore()

  return {
    name,
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) return []
      const props = store.get(overlay.id)
      const ext = (overlay.extendData ?? {}) as PitchforkExtendData
      const style: Partial<LineStyle> = {
        style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
        size: props.lineWidth ?? 2,
        dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
      }
      const medianStyle = { ...style, color: props.lineColor ?? MEDIAN_COLOR }
      // Until the third click it is just the 0→1 line.
      if (coordinates.length < 3) {
        return [{ type: 'line', key: 'median', attrs: { coordinates: [coordinates[0], coordinates[1]] }, styles: medianStyle }]
      }

      const g = pitchforkGeometry(kind, coordinates[0], coordinates[1], coordinates[2])
      const left = kind !== 'fan' && ext.extendLeft === true
      const levels = resolveLevels(props.figureLevels, kind === 'fan' ? PITCHFAN_LEVELS : PITCHFORK_LEVELS)
      const opacity = (ext.backgroundOpacity ?? DEFAULT_OPACITY) / 100
      const figures: Array<{ type: string, key: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }> = []

      if (ext.showBackground !== false) {
        for (const side of [1, -1] as const) {
          // Each band runs from the previous level (the median, first) out to this one.
          let prev = extendedLine(...g.level(0, side), left, true, bounding)
          for (const l of levels) {
            const cur = extendedLine(...g.level(l.value, side), left, true, bounding)
            figures.push({
              type: 'polygon',
              key: `fill_${side}_${l.value}`,
              ignoreEvent: true,
              attrs: { coordinates: [prev[0], prev[1], cur[1], cur[0]] },
              styles: { style: 'fill', color: withAlpha(l.color, opacity) }
            })
            prev = cur
          }
        }
      }

      for (const [i, seg] of g.segments.entries()) {
        figures.push({ type: 'line', key: `segment_${i}`, attrs: { coordinates: seg }, styles: medianStyle })
      }
      // The median is what the inside variant leaves unextended between base and point 2.
      figures.push({ type: 'line', key: 'median', attrs: { coordinates: extendedLine(...g.median, left, true, bounding) }, styles: medianStyle })
      for (const l of levels) {
        for (const side of [1, -1] as const) {
          figures.push({
            type: 'line',
            key: `level_${side}_${l.value}`,
            attrs: { coordinates: extendedLine(...g.level(l.value, side), left, true, bounding) },
            styles: levelLineStyle(style, l)
          })
        }
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.get
  }
}

export const pitchforkFactories: Array<() => OverlayTemplate> = [
  pitchfork('original', 'pitchfork'),
  pitchfork('schiff', 'schiffPitchfork'),
  pitchfork('modified', 'modifiedSchiffPitchfork'),
  pitchfork('inside', 'insidePitchfork'),
  pitchfork('fan', 'pitchfan')
]
