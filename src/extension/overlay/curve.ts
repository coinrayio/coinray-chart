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
 * Curve — TradingView's `curve` (LineToolBezierQuadro).
 *
 * Points: 0 start, 1 end, 2 a handle the curve passes *through*. Two clicks
 * place the ends; `completeDrawing` puts the handle at their midpoint, so the
 * curve starts straight and bends as the handle is dragged.
 *
 * Geometry is TV's: two quadratic segments meeting at the handle, with
 * control points at handle ∓ ¼·(end − start). Sampled into a polyline so it
 * styles and hit-tests like any line.
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import type Point from '../../common/Point'
import type { LineStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'

const SAMPLES_PER_SEGMENT = 32

function quadratic (a: Coordinate, control: Coordinate, b: Coordinate, into: Coordinate[]): void {
  for (let i = 1; i <= SAMPLES_PER_SEGMENT; i++) {
    const t = i / SAMPLES_PER_SEGMENT
    const u = 1 - t
    into.push({ x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y })
  }
}

/** Sampled TV curve from `start` through `handle` to `end`. */
export function curveCoordinates (start: Coordinate, end: Coordinate, handle: Coordinate): Coordinate[] {
  const qx = (end.x - start.x) / 4
  const qy = (end.y - start.y) / 4
  const out: Coordinate[] = [start]
  quadratic(start, { x: handle.x - qx, y: handle.y - qy }, handle, out)
  quadratic(handle, { x: handle.x + qx, y: handle.y + qy }, end, out)
  return out
}

const curve = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      size: props.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth,
      dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const newProps = clone(properties.get(id) ?? {}) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }
  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: 'curve',
    // Two clicks; the handle comes from completeDrawing.
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    completeDrawing: ({ overlay, chart }) => {
      if (overlay.points.length !== 2) return
      const [a, b] = chart.convertToPixel(overlay.points, { paneId: overlay.paneId }) as Array<Partial<Coordinate>>
      if (typeof a.x !== 'number' || typeof a.y !== 'number' || typeof b.x !== 'number' || typeof b.y !== 'number') return
      const mid = chart.convertFromPixel([{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }], { paneId: overlay.paneId }) as Array<Partial<Point>>
      overlay.points.push(mid[0])
    },
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const attrs = coordinates.length < 3
        ? { coordinates: [coordinates[0], coordinates[1]] }
        : { coordinates: curveCoordinates(coordinates[0], coordinates[1], coordinates[2]) }
      return [{ type: 'line', key: 'curve', attrs, styles: lineStyle(overlay.id) }]
    },
    setProperties,
    getProperties
  }
}

export default curve
