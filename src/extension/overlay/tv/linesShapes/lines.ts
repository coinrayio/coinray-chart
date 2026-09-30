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
 * TradingView's trend angle and its two one-sided channels.
 *
 *   trendAngle     0 start, 1 end. A trend line with a dotted arc at the start
 *                  and the angle in degrees beside it.
 *   flatBottom     0, 1 the sloped line; 2 gives the price of the flat line
 *                  that runs between the same two times. Flat Top/Bottom.
 *   disjointAngle  0, 1 the sloped line; 2 gives the price the parallel copy
 *                  has at point 1's time. Disjoint Channel.
 *
 * extendData (channels): `{ extendLeft, extendRight, showBackground }`.
 * Properties: lineColor, lineWidth, lineStyle, backgroundColor, textColor,
 * textFontSize (trend angle label).
 */

import type Coordinate from '../../../../common/Coordinate'
import type { PolygonStyle } from '../../../../common/Styles'
import type { ProOverlayTemplate } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { angleArcCoordinates, ANGLE_ARC_RADIUS, atX, trendAngle } from './geometry'
import { createToolProperties } from './properties'

interface ChannelExtendData {
  extendLeft?: boolean
  extendRight?: boolean
  showBackground?: boolean
}

const DEFAULT_BACKGROUND = 'rgba(41, 98, 255, 0.2)'

export const trendAngleTool = (): ProOverlayTemplate => {
  const tool = createToolProperties()
  return {
    name: 'trendAngle',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const [a, b] = coordinates
      const style = tool.lineStyle(overlay.id)
      const angle = trendAngle(a, b)
      const props = tool.props(overlay.id)
      return [
        { type: 'line', key: 'line', attrs: { coordinates: [a, b] }, styles: style },
        { type: 'line', key: 'angleArc', attrs: { coordinates: angleArcCoordinates(a, angle) }, styles: { style: 'dashed', color: style.color, size: 1, dashedValue: [1, 2] }, ignoreEvent: true },
        {
          type: 'text',
          key: 'angleLabel',
          attrs: { x: a.x + ANGLE_ARC_RADIUS + 5, y: a.y, text: `${Math.round((180 * angle) / Math.PI)}º`, align: 'left', baseline: 'middle' },
          styles: { color: props.textColor ?? style.color, size: props.textFontSize ?? DEFAULT_OVERLAY_PROPERTIES.textFontSize, backgroundColor: 'transparent', borderSize: 0 },
          ignoreEvent: true
        }
      ]
    },
    setProperties: tool.setProperties,
    getProperties: tool.getProperties
  }
}

/** `second` = the y the parallel/flat line has at `b.x`, plus its slope. */
type SecondLine = (a: Coordinate, b: Coordinate, y: number) => { slope: number, y: number }

const flatSecond: SecondLine = (_a, b, y) => ({ slope: 0, y: y - b.y })
const parallelSecond: SecondLine = (a, b, y) => ({ slope: b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x), y: y - b.y })

function channel (name: string, second: SecondLine): () => ProOverlayTemplate {
  return () => {
    const tool = createToolProperties()
    return {
      name,
      totalStep: 4,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      // Handle 2 only sets a price; keep it on point 1's time so it sits on the line's end.
      completeDrawing: ({ overlay }) => {
        if (overlay.points.length < 3) return
        overlay.points[2].timestamp = overlay.points[1].timestamp
        overlay.points[2].dataIndex = overlay.points[1].dataIndex
      },
      performEventPressedMove: ({ points }) => {
        if (points.length < 3) return
        points[2].timestamp = points[1].timestamp
        points[2].dataIndex = points[1].dataIndex
      },
      createPointFigures: ({ coordinates, bounding, overlay }) => {
        if (coordinates.length < 2) return []
        const ext = (overlay.extendData ?? {}) as ChannelExtendData
        const [a, b] = coordinates
        const left = ext.extendLeft === true ? 0 : Math.min(a.x, b.x)
        const right = ext.extendRight === true ? bounding.width : Math.max(a.x, b.x)
        const first = [atX(a, b, left), atX(a, b, right)]
        const style = tool.lineStyle(overlay.id)
        const figures: Array<{ type: string, key: string, attrs: unknown, styles?: unknown }> = []
        if (coordinates.length > 2) {
          // The second line passes through (b.x, y2) with the sloped line's slope (0 = flat).
          const { slope, y } = second(a, b, coordinates[2].y)
          const other = [{ x: left, y: b.y + y + slope * (left - b.x) }, { x: right, y: b.y + y + slope * (right - b.x) }]
          if (ext.showBackground !== false) {
            const fill: Partial<PolygonStyle> = { style: 'fill', color: tool.props(overlay.id).backgroundColor ?? DEFAULT_BACKGROUND }
            figures.push({ type: 'polygon', key: 'background', attrs: { coordinates: [first[0], first[1], other[1], other[0]] }, styles: fill })
          }
          figures.push({ type: 'line', key: 'line_1', attrs: { coordinates: other }, styles: style })
        }
        figures.push({ type: 'line', key: 'line_0', attrs: { coordinates: first }, styles: style })
        return figures
      },
      setProperties: tool.setProperties,
      getProperties: tool.getProperties
    }
  }
}

export const flatBottom = channel('flatBottom', flatSecond)
export const disjointAngle = channel('disjointAngle', parallelSecond)
