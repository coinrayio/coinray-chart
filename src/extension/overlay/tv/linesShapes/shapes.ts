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
 * TradingView's ellipse, arc, double curve and rotated rectangle.
 *
 * Points (all pixel-space geometry, see ./geometry):
 *   ellipse            0, 1 major-axis ends; 2 sets the semi-minor axis
 *   arc                0, 1 chord ends; 2 sets the height, bulging toward it
 *   doubleCurve        0 start, 1 end, 2 and 3 handles the curve passes
 *                      through (`completeDrawing` adds them after two clicks)
 *   rotatedRectangle   0, 1 centre axis; 2 sets the half-width
 *
 * Shape properties: borderColor, borderWidth, backgroundColor, style.
 * Double curve is a line: lineColor, lineWidth, lineStyle.
 */

import type Coordinate from '../../../../common/Coordinate'
import type DeepPartial from '../../../../common/DeepPartial'
import type Point from '../../../../common/Point'
import type { OverlayProperties, ProOverlayTemplate } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { endCapFigures, rayCoordinates, type EndCaps, type Extends } from '../../endCaps'
import {
  arcCoordinates, doubleCurveCoordinates, doubleCurveHandles, ellipseCoordinates, rotatedRectangleCorners
} from './geometry'
import { createToolProperties, type ToolProperties } from './properties'
import type { OverlayExtraHandle } from '../../../../component/Overlay'

interface Figure { type: string, key: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }

const shapeBase = (name: string, totalStep: number): Pick<ProOverlayTemplate, 'name' | 'totalStep' | 'needDefaultPointFigure' | 'needDefaultXAxisFigure' | 'needDefaultYAxisFigure'> => ({
  name, totalStep, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true
})

/** A tool's own TV defaults: `createToolProperties` with `look` under whatever is set, so the settings dialog reads what is drawn. */
function toolWithLook (look: DeepPartial<OverlayProperties>): ToolProperties {
  const tool = createToolProperties()
  const props = (id: string): DeepPartial<OverlayProperties> => ({ ...look, ...tool.props(id) })
  return {
    props,
    getProperties: props,
    setProperties: tool.setProperties,
    lineStyle: (id) => {
      const p = props(id)
      return { style: p.lineStyle ?? 'solid', color: p.lineColor, size: p.lineWidth, dashedValue: p.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue }
    },
    polygonStyle: (id) => {
      const p = props(id)
      return {
        // The Background checkbox writes `style`; an explicit fill colour alone implies filled.
        style: p.style ?? (p.backgroundColor !== undefined ? 'stroke_fill' : 'stroke'),
        color: p.backgroundColor,
        borderColor: p.borderColor,
        borderSize: p.borderWidth,
        borderStyle: p.borderStyle ?? 'solid',
        borderDashedValue: p.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
      }
    }
  }
}

/** TV's colours for a closed shape: border, the same colour at 0.2 alpha for the fill, filled by default. */
const shapeLook = (border: string, fill: string): DeepPartial<OverlayProperties> =>
  ({ style: 'stroke_fill', borderColor: border, borderWidth: 2, backgroundColor: fill, textColor: border, textFontSize: 14 })

const midpoint = (a: Coordinate, b: Coordinate): Coordinate => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Point 2's side of the axis `a`→`b` and its distance from it, along the axis's unit normal. */
function across (a: Coordinate, b: Coordinate, c: Coordinate): { nx: number, ny: number, d: number } {
  const len = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-9)
  const nx = -(b.y - a.y) / len
  const ny = (b.x - a.x) / len
  return { nx, ny, d: (c.x - a.x) * nx + (c.y - a.y) * ny }
}

/**
 * TV hides the third point's own handle on these and shows the shape's: both
 * ends of the ellipse's minor axis, the rectangle's corners on point 2's side.
 */
const widthHandles: Record<string, (a: Coordinate, b: Coordinate, c: Coordinate) => OverlayExtraHandle[]> = {
  ellipse: (a, b, c) => {
    const { nx, ny, d } = across(a, b, c)
    const m = midpoint(a, b)
    return [{ x: m.x + nx * d, y: m.y + ny * d }, { x: m.x - nx * d, y: m.y - ny * d }]
  },
  rotatedRectangle: (a, b, c) => {
    const { nx, ny, d } = across(a, b, c)
    return [{ x: a.x + nx * d, y: a.y + ny * d }, { x: b.x + nx * d, y: b.y + ny * d }]
  }
}

/** Third-point shapes: a line until the third click, then `outline` (null = still a line). `withText` adds TV's centred label. */
function thirdPointShape (name: string, look: DeepPartial<OverlayProperties>, outline: (a: Coordinate, b: Coordinate, c: Coordinate) => Coordinate[] | null, strokeArc: boolean, withText = false): () => ProOverlayTemplate {
  return () => {
    const tool = toolWithLook(look)
    const handles = widthHandles[name] as ((a: Coordinate, b: Coordinate, c: Coordinate) => OverlayExtraHandle[]) | undefined
    return {
      ...shapeBase(name, 4),
      ...(handles !== undefined
        ? {
            needDefaultPointFigure: [0, 1],
            createExtraHandles: ({ coordinates }) => coordinates.length < 3 ? [] : handles(coordinates[0], coordinates[1], coordinates[2]),
            // Any of them sets the width: point 2 goes where the cursor is.
            moveExtraHandle: ({ overlay, coordinate, toPoint }) => {
              const q = toPoint(coordinate)
              Object.assign(overlay.points[2], { timestamp: q.timestamp, dataIndex: q.dataIndex, value: q.value })
            }
          }
        : {}),
      createPointFigures: ({ coordinates, overlay }) => {
        if (coordinates.length < 2) return []
        const [a, b] = coordinates
        const shape = coordinates.length > 2 ? outline(a, b, coordinates[2]) : null
        const polygon = tool.polygonStyle(overlay.id)
        if (shape === null) {
          return [{ type: 'line', key: 'line', attrs: { coordinates: [a, b] }, styles: { color: polygon.borderColor, size: polygon.borderSize } }]
        }
        const figures: Figure[] = []
        if (!strokeArc) {
          figures.push({ type: 'polygon', key: 'shape', attrs: { coordinates: shape }, styles: polygon })
        } else {
          // An arc strokes only its curve; the chord closing the fill stays bare.
          if (polygon.style !== 'stroke') figures.push({ type: 'polygon', key: 'fill', attrs: { coordinates: shape }, styles: { style: 'fill', color: polygon.color }, ignoreEvent: true })
          figures.push({ type: 'line', key: 'arc', attrs: { coordinates: shape }, styles: { style: polygon.borderStyle, color: polygon.borderColor, size: polygon.borderSize, dashedValue: polygon.borderDashedValue } })
        }
        if (withText) {
          const p = tool.props(overlay.id)
          const centre = midpoint(a, b)
          figures.push({
            type: 'editableText',
            key: 'label',
            attrs: { x: centre.x, y: centre.y, align: 'center', baseline: 'middle', text: p.text ?? '' },
            styles: { color: p.textColor, size: p.textFontSize, weight: p.textFontWeight ?? 'normal', fontStyle: p.textFontStyle, backgroundColor: 'transparent' }
          })
        }
        return figures
      },
      setProperties: tool.setProperties,
      getProperties: tool.getProperties
    }
  }
}

export const ellipse = thirdPointShape('ellipse', shapeLook('#F23645', 'rgba(242, 54, 69, 0.2)'), ellipseCoordinates, false, true)
export const arc = thirdPointShape('arc', shapeLook('#E91E63', 'rgba(233, 30, 99, 0.2)'), arcCoordinates, true)

export const rotatedRectangle = thirdPointShape('rotatedRectangle', shapeLook('#4CAF50', 'rgba(76, 175, 80, 0.2)'), rotatedRectangleCorners, false)

export const doubleCurve = (): ProOverlayTemplate => {
  const tool = toolWithLook({ lineColor: '#673AB7', lineWidth: 2, backgroundColor: 'rgba(103, 58, 183, 0.2)', style: 'stroke' })
  return {
    ...shapeBase('doubleCurve', 3),
    completeDrawing: ({ overlay, chart }) => {
      if (overlay.points.length !== 2) return
      const [a, b] = chart.convertToPixel(overlay.points, { paneId: overlay.paneId }) as Array<Partial<Coordinate>>
      if (typeof a.x !== 'number' || typeof a.y !== 'number' || typeof b.x !== 'number' || typeof b.y !== 'number') return
      const handles = chart.convertFromPixel(doubleCurveHandles({ x: a.x, y: a.y }, { x: b.x, y: b.y }), { paneId: overlay.paneId }) as Array<Partial<Point>>
      overlay.points.push(handles[0], handles[1])
    },
    createPointFigures: ({ coordinates, overlay, bounding }) => {
      if (coordinates.length < 2) return []
      const line = coordinates.length < 4
        ? [coordinates[0], coordinates[1]]
        : doubleCurveCoordinates(coordinates[0], coordinates[1], coordinates[2], coordinates[3])
      const style = tool.lineStyle(overlay.id)
      const { style: fillStyle, backgroundColor } = tool.props(overlay.id)
      const filled = fillStyle === 'fill' || fillStyle === 'stroke_fill'
      // TV's Extend left / right: a straight ray along the end tangent.
      const ext = (overlay.extendData ?? {}) as Extends
      const back = Math.min(3, line.length - 1)
      const left = ext.extendLeft === true ? rayCoordinates(line[back], line[0], bounding).reverse() : []
      const right = ext.extendRight === true ? rayCoordinates(line[line.length - 1 - back], line[line.length - 1], bounding) : []
      return [
        // TV's Background: the area between the curve and its chord.
        ...(filled && line.length > 2 ? [{ type: 'polygon', key: 'fill', attrs: { coordinates: line }, styles: { style: 'fill', color: backgroundColor }, ignoreEvent: true }] : []),
        { type: 'line', key: 'curve', attrs: { coordinates: [...left.slice(0, -1), ...line, ...right.slice(1)] }, styles: style },
        ...endCapFigures(line, overlay.extendData as EndCaps | undefined, style.color, style.size)
      ]
    },
    setProperties: tool.setProperties,
    getProperties: tool.getProperties
  }
}
