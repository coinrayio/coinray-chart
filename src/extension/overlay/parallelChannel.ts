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
    needDefaultPointFigure: true,
    // TV's six: point 2 is one, then the parallel line's ends and the base
    // line's midpoint. An end moves that end of the channel, keeping its width;
    // the midpoint slides the base line, keeping the parallel one.
    createExtraHandles: ({ coordinates }) => {
      if (coordinates.length < 3) return []
      const [a, b, c] = coordinates
      const offset = c.y - atX(a, b, c.x).y
      return [
        { x: a.x, y: a.y + offset },
        { x: b.x, y: b.y + offset },
        { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      ]
    },
    moveExtraHandle: ({ overlay, index, coordinate, coordinates, toPoint }) => {
      const [a, b, c] = coordinates
      if (index === 2) {
        const dy = coordinate.y - (a.y + b.y) / 2
        overlay.points[0].value = toPoint({ x: a.x, y: a.y + dy }).value
        overlay.points[1].value = toPoint({ x: b.x, y: b.y + dy }).value
        return
      }
      const offset = c.y - atX(a, b, c.x).y
      const end = { x: coordinate.x, y: coordinate.y - offset }
      Object.assign(overlay.points[index], toPoint(end))
      // Point 2 holds the width: keep it the same distance off the new base line.
      const base = index === 0 ? atX(end, b, c.x) : atX(a, end, c.x)
      overlay.points[2].value = toPoint({ x: c.x, y: base.y + offset }).value
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
