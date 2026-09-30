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
 * place the ends; `completeDrawing` puts the handle 0.15 of the chord off their
 * midpoint, as TV does, so the curve starts bowed and bends as the handle is dragged.
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
import { endCapFigures, runOn, type EndCaps, type Extends } from './endCaps'

const SAMPLES_PER_SEGMENT = 32

/** TV's defaults, held as explicit properties so the settings dialog reads what is drawn. */
const LOOK: DeepPartial<OverlayProperties> = { lineColor: '#2962FF', lineWidth: 2, backgroundColor: 'rgba(41, 98, 255, 0.2)', style: 'stroke' }

function quadratic (a: Coordinate, control: Coordinate, b: Coordinate, into: Coordinate[]): void {
  for (let i = 1; i <= SAMPLES_PER_SEGMENT; i++) {
    const t = i / SAMPLES_PER_SEGMENT
    const u = 1 - t
    into.push({ x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y })
  }
}

/** TV's Extend left / right: each segment's quadratic run on past its end (the parabola carries on). */
export function curveExtensions (start: Coordinate, end: Coordinate, handle: Coordinate, ext: Extends, bounds: { width: number, height: number }): { left: Coordinate[], right: Coordinate[] } {
  const qx = (end.x - start.x) / 4
  const qy = (end.y - start.y) / 4
  const quad = (a: Coordinate, c: Coordinate, b: Coordinate) => (t: number): Coordinate => {
    const u = 1 - t
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }
  }
  const step = 1 / SAMPLES_PER_SEGMENT
  return {
    left: ext.extendLeft === true ? runOn(quad(start, { x: handle.x - qx, y: handle.y - qy }, handle), 0, -step, bounds) : [],
    right: ext.extendRight === true ? runOn(quad(handle, { x: handle.x + qx, y: handle.y + qy }, end), 1, step, bounds) : []
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

  const withLook = (id: string): DeepPartial<OverlayProperties> => ({ ...LOOK, ...(properties.get(id) ?? {}) })

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = withLook(id)
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor,
      size: props.lineWidth,
      dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const newProps = clone(properties.get(id) ?? {}) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }
  const getProperties = withLook

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
      // TV bows the new curve: the handle sits 0.15 of the chord off its middle, to the right of a → b.
      const mid = chart.convertFromPixel([{ x: (a.x + b.x) / 2 - (b.y - a.y) * 0.15, y: (a.y + b.y) / 2 + (b.x - a.x) * 0.15 }], { paneId: overlay.paneId }) as Array<Partial<Point>>
      overlay.points.push(mid[0])
    },
    createPointFigures: ({ coordinates, overlay, bounding }) => {
      if (coordinates.length < 2) return []
      const line = coordinates.length < 3
        ? [coordinates[0], coordinates[1]]
        : curveCoordinates(coordinates[0], coordinates[1], coordinates[2])
      const style = lineStyle(overlay.id)
      const props = withLook(overlay.id)
      const { left, right } = coordinates.length < 3
        ? { left: [], right: [] }
        : curveExtensions(coordinates[0], coordinates[1], coordinates[2], (overlay.extendData ?? {}) as Extends, bounding)
      const filled = props.style === 'fill' || props.style === 'stroke_fill'
      return [
        // TV's Background: the area between the curve and its chord.
        ...(filled && line.length > 2 ? [{ type: 'polygon', key: 'fill', attrs: { coordinates: line }, styles: { style: 'fill', color: props.backgroundColor }, ignoreEvent: true }] : []),
        { type: 'line', key: 'curve', attrs: { coordinates: [...left.reverse(), ...line, ...right] }, styles: style },
        ...endCapFigures(line, overlay.extendData as EndCaps | undefined, style.color, style.size)
      ]
    },
    setProperties,
    getProperties
  }
}

export default curve
