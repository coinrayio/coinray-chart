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
 * Gann Fan — TradingView's `gannbox_fan` (LineToolGannFan).
 *
 * Two points: the origin and a corner that fixes the 1x1 scale. Each level is
 * a ray from the origin through the corner box's edge at that ratio (mirrors
 * TV's GannFanPaneView): ratio < 1 leaves through the box's far y, ratio >= 1
 * through its far x. Bands are filled between neighbouring levels.
 *
 * properties.figureLevels: `[{ value: ratio, enabled, color }]`, so 1/8 is
 * 0.125 and 8/1 is 8. extendData: `{ showLabels, showBackground,
 * backgroundOpacity }`.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { LineStyle } from '../../../../common/Styles'
import type { OverlayTemplate } from '../../../../component/Overlay'
import type { ProOverlayTemplate } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { withAlpha } from '../../fibonacciShared'
import { extendedLine, propertyStore } from './shared'
import type { Level } from './shared'

export const GANN_FAN_LEVELS: Level[] = [
  { value: 1 / 8, color: '#ff9800', enabled: true },
  { value: 1 / 4, color: '#089981', enabled: true },
  { value: 1 / 3, color: '#4caf50', enabled: true },
  { value: 1 / 2, color: '#089981', enabled: true },
  { value: 1, color: '#00bcd4', enabled: true },
  { value: 2, color: '#2962ff', enabled: true },
  { value: 3, color: '#9c27b0', enabled: true },
  { value: 4, color: '#e91e63', enabled: true },
  { value: 8, color: '#f23645', enabled: true }
]

interface GannFanExtendData {
  showLabels?: boolean
  showBackground?: boolean
  backgroundOpacity?: number
}

/** Where the ray for `ratio` crosses the far edge of the origin→corner box. */
export function gannFanEnd (origin: Coordinate, corner: Coordinate, ratio: number): Coordinate {
  const dx = corner.x - origin.x
  const dy = corner.y - origin.y
  return ratio > 1 ? { x: corner.x, y: origin.y + dy / ratio } : { x: origin.x + dx * ratio, y: corner.y }
}

export const gannFanLabel = (ratio: number): string =>
  ratio < 1 ? `1/${Math.round(1 / ratio)}` : `${Math.round(ratio)}/1`

const gannFan = (): ProOverlayTemplate => {
  const store = propertyStore()

  return {
    name: 'gannFan',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) return []
      const props = store.get(overlay.id)
      const ext = (overlay.extendData ?? {}) as GannFanExtendData
      const [origin, corner] = coordinates
      const style: Partial<LineStyle> = {
        style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
        size: props.lineWidth ?? 2,
        dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
      }
      const custom = props.figureLevels
      const all: Level[] = custom !== undefined && custom.length > 0
        ? custom.map((l, i) => ({ value: l.value ?? GANN_FAN_LEVELS.at(i)?.value ?? 1, color: l.color ?? GANN_FAN_LEVELS.at(i)?.color ?? '#787b86', enabled: l.enabled !== false }))
        : GANN_FAN_LEVELS
      // Position in the full ascending list decides which neighbour a band pairs with.
      const shown = [...all].sort((a, b) => a.value - b.value).map((l, i) => ({ ...l, index: i + 1 })).filter((l) => l.enabled)
      const rays = shown.map((l) => ({ ...l, end: gannFanEnd(origin, corner, l.value) }))
      const opacity = (ext.backgroundOpacity ?? 20) / 100
      const figures: Array<{ type: string, key: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }> = []

      if (ext.showBackground !== false) {
        rays.forEach((r, i) => {
          const other = r.index < 4 ? rays[i + 1] : r.index > 4 && i > 0 ? rays[i - 1] : undefined
          if (other === undefined) return
          const a = extendedLine(origin, r.end, false, true, bounding)[1]
          const b = extendedLine(origin, other.end, false, true, bounding)[1]
          figures.push({ type: 'polygon', key: `fill_${i}`, ignoreEvent: true, attrs: { coordinates: [origin, a, b] }, styles: { style: 'fill', color: withAlpha(r.color, opacity) } })
        })
      }
      for (const [i, r] of rays.entries()) {
        figures.push({ type: 'line', key: `ray_${i}`, attrs: { coordinates: extendedLine(origin, r.end, false, true, bounding) }, styles: { ...style, color: r.color } })
        if (ext.showLabels !== false) {
          figures.push({
            type: 'text',
            key: `label_${i}`,
            ignoreEvent: true,
            attrs: { x: r.end.x + 4, y: r.end.y + 5, text: gannFanLabel(r.value), align: 'left', baseline: 'middle' },
            styles: { color: r.color, size: 12, backgroundColor: 'transparent', borderSize: 0 }
          })
        }
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.get
  }
}

export const gannFanFactories: Array<() => OverlayTemplate> = [gannFan]
