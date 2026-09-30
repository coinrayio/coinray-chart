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
import type Point from '../../../../common/Point'
import type { ProOverlayTemplate } from '../../types'
import {
  arcCoordinates, doubleCurveCoordinates, doubleCurveHandles, ellipseCoordinates, rotatedRectangleCorners
} from './geometry'
import { createToolProperties } from './properties'

interface Figure { type: string, key: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }

const shapeBase = (name: string, totalStep: number): Pick<ProOverlayTemplate, 'name' | 'totalStep' | 'needDefaultPointFigure' | 'needDefaultXAxisFigure' | 'needDefaultYAxisFigure'> => ({
  name, totalStep, needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true
})

/** Third-point shapes: a line until the third click, then `outline` (null = still a line). */
function thirdPointShape (name: string, outline: (a: Coordinate, b: Coordinate, c: Coordinate) => Coordinate[] | null, strokeArc: boolean): () => ProOverlayTemplate {
  return () => {
    const tool = createToolProperties()
    return {
      ...shapeBase(name, 4),
      createPointFigures: ({ coordinates, overlay }) => {
        if (coordinates.length < 2) return []
        const [a, b] = coordinates
        const shape = coordinates.length > 2 ? outline(a, b, coordinates[2]) : null
        const polygon = tool.polygonStyle(overlay.id)
        if (shape === null) {
          return [{ type: 'line', key: 'line', attrs: { coordinates: [a, b] }, styles: { color: polygon.borderColor, size: polygon.borderSize } }]
        }
        // An arc strokes only its curve; the chord closing the fill stays bare.
        if (!strokeArc) return [{ type: 'polygon', key: 'shape', attrs: { coordinates: shape }, styles: polygon }]
        const figures: Figure[] = []
        if (polygon.style !== 'stroke') figures.push({ type: 'polygon', key: 'fill', attrs: { coordinates: shape }, styles: { style: 'fill', color: polygon.color }, ignoreEvent: true })
        figures.push({ type: 'line', key: 'arc', attrs: { coordinates: shape }, styles: { style: polygon.borderStyle, color: polygon.borderColor, size: polygon.borderSize, dashedValue: polygon.borderDashedValue } })
        return figures
      },
      setProperties: tool.setProperties,
      getProperties: tool.getProperties
    }
  }
}

export const ellipse = thirdPointShape('ellipse', ellipseCoordinates, false)
export const arc = thirdPointShape('arc', arcCoordinates, true)

export const rotatedRectangle = thirdPointShape('rotatedRectangle', rotatedRectangleCorners, false)

export const doubleCurve = (): ProOverlayTemplate => {
  const tool = createToolProperties()
  return {
    ...shapeBase('doubleCurve', 3),
    completeDrawing: ({ overlay, chart }) => {
      if (overlay.points.length !== 2) return
      const [a, b] = chart.convertToPixel(overlay.points, { paneId: overlay.paneId }) as Array<Partial<Coordinate>>
      if (typeof a.x !== 'number' || typeof a.y !== 'number' || typeof b.x !== 'number' || typeof b.y !== 'number') return
      const handles = chart.convertFromPixel(doubleCurveHandles({ x: a.x, y: a.y }, { x: b.x, y: b.y }), { paneId: overlay.paneId }) as Array<Partial<Point>>
      overlay.points.push(handles[0], handles[1])
    },
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const line = coordinates.length < 4
        ? [coordinates[0], coordinates[1]]
        : doubleCurveCoordinates(coordinates[0], coordinates[1], coordinates[2], coordinates[3])
      return [{ type: 'line', key: 'curve', attrs: { coordinates: line }, styles: tool.lineStyle(overlay.id) }]
    },
    setProperties: tool.setProperties,
    getProperties: tool.getProperties
  }
}
