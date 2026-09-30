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
 *   disjointAngle  0, 1 the sloped line; 2 gives the price the second line
 *                  ends at, at point 1's time; that line slopes the opposite way
 *                  (mirrored), so the two cross. Disjoint Channel.
 *
 * extendData (channels): `{ extendLeft, extendRight, showBackground, endCapLeft, endCapRight,
 * showPrices, pricesColor, pricesFontSize, pricesBold, pricesItalic }`.
 * Properties: lineColor, lineWidth, lineStyle, backgroundColor, textColor,
 * textFontSize (trend angle label).
 */

import type Coordinate from '../../../../common/Coordinate'
import type { PolygonStyle } from '../../../../common/Styles'
import type { ProOverlayTemplate } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { angleArcCoordinates, ANGLE_ARC_RADIUS, atX, trendAngle } from './geometry'
import { createToolProperties } from './properties'
import segment from '../../segment'
import { channelText } from './channelText'
import { TV_BLUE, tvDashedValue } from '../../tvLine'
import { endCapFigures, type EndCaps } from '../../endCaps'
import { formatPrecision } from '../../../../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../../../../common/SymbolInfo'

interface ChannelExtendData {
  extendLeft?: boolean
  extendRight?: boolean
  showBackground?: boolean
  /** TV's Prices: the price at each end of both lines, in `pricesColor`. */
  showPrices?: boolean
  pricesColor?: string
  pricesFontSize?: number
  pricesBold?: boolean
  pricesItalic?: boolean
}

/** The gap between a line's end and its price. */
const PRICE_GAP = 6

const CHANNEL_WIDTH = 2

/** TV gives each one-sided channel its own colour: the line, its text and the fill (the same colour at 0.2). */
interface ChannelLook { color: string, fill: string }
const FLAT_LOOK: ChannelLook = { color: '#FF9800', fill: 'rgba(255, 152, 0, 0.2)' }
const DISJOINT_LOOK: ChannelLook = { color: '#089981', fill: 'rgba(8, 153, 129, 0.2)' }

export const trendAngleTool = (): ProOverlayTemplate => {
  // The line is a trend line (extend, middle point, price labels, stats all come with it); this adds the arc and the angle.
  const base = segment()
  return {
    ...base,
    name: 'trendAngle',
    createPointFigures: (params) => {
      const { coordinates, overlay } = params
      if (coordinates.length < 2) return []
      const [a, b] = coordinates
      const props = base.getProperties?.(overlay.id) ?? {}
      const color = props.lineColor ?? TV_BLUE
      const angle = trendAngle(a, b)
      const dotted = { style: 'dashed', color, size: 1, dashedValue: [1, 2] }
      return [
        // No text of its own: the trend line's label is not part of this tool.
        ...[base.createPointFigures?.(params) ?? []].flat().filter((f) => f.type !== 'editableText'),
        // TV draws the angle against a dotted horizontal from the anchor as long as the arc's radius.
        { type: 'line', key: 'angleBase', attrs: { coordinates: [a, { x: a.x + ANGLE_ARC_RADIUS, y: a.y }] }, styles: dotted, ignoreEvent: true },
        { type: 'line', key: 'angleArc', attrs: { coordinates: angleArcCoordinates(a, angle) }, styles: dotted, ignoreEvent: true },
        {
          type: 'text',
          key: 'angleLabel',
          attrs: { x: a.x + ANGLE_ARC_RADIUS + 5, y: a.y, text: `${Math.round((180 * angle) / Math.PI)}\u00B0`, align: 'left', baseline: 'middle' },
          // The label keeps TV's blue whatever colour the line is given.
          styles: { color: props.textColor ?? TV_BLUE, size: props.textFontSize ?? DEFAULT_OVERLAY_PROPERTIES.textFontSize, backgroundColor: 'transparent', borderSize: 0 },
          ignoreEvent: true
        }
      ]
    }
  }
}

/** `second` = the y the parallel/flat line has at `b.x`, plus its slope. */
type SecondLine = (a: Coordinate, b: Coordinate, y: number) => { slope: number, y: number }

const flatSecond: SecondLine = (_a, b, y) => ({ slope: 0, y: y - b.y })
/** TV's disjoint channel slopes its second line the opposite way: the same angle, mirrored. */
const mirroredSecond: SecondLine = (a, b, y) => ({ slope: b.x === a.x ? 0 : -(b.y - a.y) / (b.x - a.x), y: y - b.y })

function channel (name: string, second: SecondLine, look: ChannelLook): () => ProOverlayTemplate {
  return () => {
    const tool = createToolProperties({ lineWidth: CHANNEL_WIDTH })
    const lineStyle = (id: string): ReturnType<typeof tool.lineStyle> => {
      const p = tool.props(id)
      const style = tool.lineStyle(id)
      return { ...style, color: p.lineColor ?? look.color, dashedValue: tvDashedValue(p.lineDashedValue, style.size ?? CHANNEL_WIDTH) }
    }
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
      createPointFigures: ({ coordinates, bounding, overlay, chart }) => {
        if (coordinates.length < 2) return []
        const ext = (overlay.extendData ?? {}) as ChannelExtendData & EndCaps
        const [a, b] = coordinates
        const left = ext.extendLeft === true ? 0 : Math.min(a.x, b.x)
        const right = ext.extendRight === true ? bounding.width : Math.max(a.x, b.x)
        const first = [atX(a, b, left), atX(a, b, right)]
        const style = lineStyle(overlay.id)
        const figures: Array<{ type: string, key: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }> = []
        if (coordinates.length > 2) {
          // The second line passes through (b.x, y2) with the sloped line's slope (0 = flat).
          const { slope, y } = second(a, b, coordinates[2].y)
          const otherAt = (x: number): Coordinate => ({ x, y: b.y + y + slope * (x - b.x) })
          const other = [otherAt(left), otherAt(right)]
          if (ext.showBackground !== false) {
            // Extending left draws the lines further but leaves the fill where it was; extending right takes it along.
            const start = Math.min(a.x, b.x)
            const fill: Partial<PolygonStyle> = { style: 'fill', color: tool.props(overlay.id).backgroundColor ?? look.fill }
            figures.push({ type: 'polygon', key: 'background', attrs: { coordinates: [atX(a, b, start), first[1], other[1], otherAt(start)] }, styles: fill })
          }
          figures.push({ type: 'line', key: 'line_1', attrs: { coordinates: other }, styles: style })
          figures.push(...endCapFigures(other, ext, style.color, style.size, 1).map((f) => ({ ...f, key: `${f.key}_1` })))
          figures.push(channelText(tool.props(overlay.id), first, other, look.color))
          if (ext.showPrices === true) {
            const labelStyle = {
              color: ext.pricesColor ?? look.color,
              size: ext.pricesFontSize ?? 12,
              weight: ext.pricesBold === true ? 'bold' : 'normal',
              fontStyle: ext.pricesItalic === true ? 'italic' : 'normal',
              backgroundColor: 'transparent',
              borderSize: 0
            }
            const precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
            const format = (y: number): string => {
              const value = (chart.convertFromPixel([{ x: 0, y }], { paneId: overlay.paneId }) as Array<{ value?: number }>)[0]?.value
              return typeof value === 'number' ? chart.getDecimalFold().format(chart.getThousandsSeparator().format(formatPrecision(value, precision))) : ''
            }
            const ends: Array<[Coordinate, 'left' | 'right']> = [[first[0], 'left'], [first[1], 'right'], [other[0], 'left'], [other[1], 'right']]
            ends.forEach(([end, side], i) => figures.push({
              type: 'text',
              key: `price_${i}`,
              attrs: { x: side === 'left' ? end.x - PRICE_GAP : end.x + PRICE_GAP, y: end.y, text: format(end.y), align: side === 'left' ? 'right' : 'left', baseline: 'middle' },
              styles: labelStyle,
              ignoreEvent: true
            }))
          }
        }
        figures.push({ type: 'line', key: 'line_0', attrs: { coordinates: first }, styles: style })
        figures.push(...endCapFigures(first, ext, style.color, style.size, 1))
        return figures
      },
      setProperties: tool.setProperties,
      getProperties: tool.getProperties
    }
  }
}

export const flatBottom = channel('flatBottom', flatSecond, FLAT_LOOK)
export const disjointAngle = channel('disjointAngle', mirroredSecond, DISJOINT_LOOK)
