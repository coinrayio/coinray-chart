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
 * Parallel Channel — TradingView's `parallel_channel`.
 *
 * Unlike `parallelStraightLine` / `priceChannelLine`, which draw infinite
 * lines across the pane, this is a *finite* channel: points 0 and 1 are the
 * base line's ends, point 2 sets the parallel line's offset, and both lines
 * span points 0 → 1 only. Extend Left / Right run them to the pane edges.
 *
 *   * Background fill between the two lines (on by default, as in TV).
 *   * Dashed midline halfway between them (on by default).
 *
 * extendData: `{ extendLeft, extendRight, showBackground, showMidline,
 * midlineColor, midlineWidth, midlineStyle, midlineDashedValue }`.
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle, LineType, PolygonStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import { snapAngle } from '../../common/utils/shiftSnap'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { channelText } from './tv/linesShapes/channelText'
import { TV_BLUE, tvDashedValue } from './tvLine'

interface ChannelExtendData {
  extendLeft?: boolean
  extendRight?: boolean
  showBackground?: boolean
  showMidline?: boolean
  midlineColor?: string
  midlineWidth?: number
  midlineStyle?: LineType
  midlineDashedValue?: number[]
}

const DEFAULT_BACKGROUND = 'rgba(41, 98, 255, 0.2)'

/** Point on the line through `a`→`b` at `x`. Vertical base lines keep `a`. */
function atX (a: Coordinate, b: Coordinate, x: number): Coordinate {
  if (b.x === a.x) return { x, y: a.y }
  return { x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) }
}

const parallelChannel = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    const size = props.lineWidth ?? 2
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? TV_BLUE,
      size,
      dashedValue: tvDashedValue(props.lineDashedValue, size)
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const current = properties.get(id) ?? {}
    const newProps = clone(current) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }

  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: 'parallelChannel',
    totalStep: 4,
    // All six dots are the channel's own handles, so each keeps the channel
    // whole the way TV does. Point 2 only holds the width and sits wherever the
    // third click was, so it gets no dot of its own.
    needDefaultPointFigure: [],
    // TV's six: the ends of the base line and of the parallel line, then both
    // lines' midpoints, which stay in the middle. An end moves that end of
    // both lines, keeping the width; a midpoint moves its line up or down
    // until it passes through the cursor, keeping its angle and the other line.
    createExtraHandles: ({ coordinates }) => {
      if (coordinates.length < 3) return []
      const [a, b, c] = coordinates
      const offset = c.y - atX(a, b, c.x).y
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      return [
        a,
        b,
        { x: a.x, y: a.y + offset },
        { x: b.x, y: b.y + offset },
        // Midpoints stay in the middle rather than following the cursor, so
        // each hides while it is dragged, as in TV.
        { ...mid, hideWhileDragged: true },
        { x: mid.x, y: mid.y + offset, hideWhileDragged: true }
      ]
    },
    // Worked in price: the magnet acts on the dragged dot only, and every
    // other dot moves by exact amounts, so none snaps to a candle of its own.
    moveExtraHandle: ({ overlay, index, coordinate, coordinates, shiftKey, toPoint }) => {
      const [a, b, c] = coordinates
      const points = overlay.points
      // Interpolated along time: every stored point has a timestamp, not always a data index.
      const [ia, ib, ic] = points.map(p => p.timestamp)
      const [va, vb, vc] = points.map(p => p.value)
      if (ia === undefined || ib === undefined || ic === undefined || va === undefined || vb === undefined || vc === undefined) return
      // The base line's price at `i`, and the parallel line's price above it.
      const baseAt = (i: number, a0: number, v0: number, b0: number, v1: number): number => (b0 === a0 ? v0 : v0 + ((v1 - v0) * (i - a0)) / (b0 - a0))
      const width = vc - baseAt(ic, ia, va, ib, vb)
      if (index >= 4) {
        // A midpoint: its line keeps its angle and moves up or down until it
        // passes through the (magnetised) cursor.
        const q = toPoint(coordinate)
        if (q.timestamp === undefined || q.value === undefined) return
        const dv = q.value - (baseAt(q.timestamp, ia, va, ib, vb) + (index === 5 ? width : 0))
        if (index === 5) {
          points[2].value = vc + dv
        } else {
          points[0].value = va + dv
          points[1].value = vb + dv
        }
        return
      }
      // A corner: that end of both lines moves, the width stays.
      const end = index % 2
      const other = 1 - end
      const onParallel = index >= 2
      const offset = c.y - atX(a, b, c.x).y
      const lift = onParallel ? offset : 0
      // Shift snaps the channel's angle around the same line's other end.
      const snapped = shiftKey === true ? snapAngle({ x: coordinates[other].x, y: coordinates[other].y + lift }, coordinate) : coordinate
      const q = toPoint(snapped)
      if (q.value === undefined) return
      let value = q.value - (onParallel ? width : 0)
      // Snapped flat, take the other end's own price: the axis puts a price on
      // a whole pixel, so the converted one can be a fraction of a pixel off.
      if (shiftKey === true && Math.abs(snapped.y - (coordinates[other].y + lift)) < 1e-6) value = points[other].value ?? value
      Object.assign(points[end], q, { value })
      const [na, nb] = [points[0], points[1]]
      if (na.timestamp === undefined || nb.timestamp === undefined || na.value === undefined || nb.value === undefined) return
      points[2].value = baseAt(ic, na.timestamp, na.value, nb.timestamp, nb.value) + width
    },
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) return []
      const id = overlay.id
      const ext = (overlay.extendData ?? {}) as ChannelExtendData
      const [a, b] = coordinates
      const left = ext.extendLeft === true ? 0 : Math.min(a.x, b.x)
      const right = ext.extendRight === true ? bounding.width : Math.max(a.x, b.x)
      const base = [atX(a, b, left), atX(a, b, right)]
      const style = lineStyle(id)

      // Until the third click the channel is just its base line.
      if (coordinates.length < 3) {
        return [{ type: 'line', key: 'line_0', attrs: { coordinates: base }, styles: style }]
      }

      const offset = coordinates[2].y - atX(a, b, coordinates[2].x).y
      const parallel = base.map((p) => ({ x: p.x, y: p.y + offset }))
      const figures: Array<{ type: string, key?: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }> = []

      if (ext.showBackground !== false) {
        const props = properties.get(id) ?? {}
        const fill: Partial<PolygonStyle> = { style: 'fill', color: props.backgroundColor ?? DEFAULT_BACKGROUND }
        figures.push({ type: 'polygon', key: 'background', attrs: { coordinates: [base[0], base[1], parallel[1], parallel[0]] }, styles: fill })
      }
      if (ext.showMidline !== false) {
        const mid = base.map((p) => ({ x: p.x, y: p.y + offset / 2 }))
        // TV's middle line is its own: blue, 1px, dashed, whatever colour the channel is.
        const midSize = ext.midlineWidth ?? 1
        figures.push({
          type: 'line',
          key: 'midline',
          attrs: { coordinates: mid },
          styles: {
            ...style,
            color: ext.midlineColor ?? TV_BLUE,
            size: midSize,
            style: ext.midlineStyle ?? 'dashed',
            dashedValue: tvDashedValue(ext.midlineDashedValue, midSize)
          }
        })
      }
      figures.push({ type: 'line', key: 'line_0', attrs: { coordinates: base }, styles: style })
      figures.push({ type: 'line', key: 'line_1', attrs: { coordinates: parallel }, styles: style })
      figures.push(channelText(properties.get(id) ?? {}, base, parallel))
      return figures
    },
    setProperties,
    getProperties
  }
}

export default parallelChannel
