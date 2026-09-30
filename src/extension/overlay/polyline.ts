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
 * Polyline and Path — TradingView's `polyline` and `path`.
 *
 * Both are click-to-add: every click drops a vertex and a double-click
 * finishes. `completeDrawing` drops the duplicate vertex the double-click
 * leaves behind.
 *
 *   polyline  Finishing on the first vertex closes it (TV's gesture) into a
 *             filled shape: `extendData.closed`, fill from `backgroundColor`
 *             unless `extendData.showBackground === false`.
 *   path      An open line with an arrowhead on its last vertex
 *             (`extendData.endCapRight`, default `'arrow'`; `endCapLeft`
 *             for the first).
 */

import type Coordinate from '../../common/Coordinate'
import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { endCapFigures } from './endCaps'

export type MultiPointKind = 'polyline' | 'path'

interface MultiPointExtendData {
  closed?: boolean
  showBackground?: boolean
  endCapLeft?: 'normal' | 'arrow'
  endCapRight?: 'normal' | 'arrow'
}

/** Pixels within which two vertices count as the same one. */
const SAME_VERTEX_PX = 4
/** Pixels within which finishing on the first vertex closes a polyline. */
const CLOSE_PX = 10
/** TV's defaults per tool, held as explicit properties so the settings dialog reads what is drawn. */
const LOOK: Record<MultiPointKind, DeepPartial<OverlayProperties>> = {
  polyline: { lineColor: '#00BCD4', lineWidth: 2, backgroundColor: 'rgba(0, 188, 212, 0.2)', style: 'stroke_fill' },
  path: { lineColor: '#2962FF', lineWidth: 2 }
}

interface Figure { type: string, key?: string, attrs: unknown, styles?: unknown }

export const multiPoint = (kind: MultiPointKind) => (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const withLook = (id: string): DeepPartial<OverlayProperties> => ({ ...LOOK[kind], ...(properties.get(id) ?? {}) })

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
    name: kind,
    totalStep: Number.MAX_SAFE_INTEGER,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    completeDrawing: ({ overlay, chart }) => {
      const points = overlay.points
      const px = chart.convertToPixel(points, { paneId: overlay.paneId }) as Array<Partial<Coordinate>>
      const near = (a: Partial<Coordinate>, b: Partial<Coordinate>, d: number): boolean =>
        Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0)) <= d
      for (let i = points.length - 1; i > 0; i--) {
        if (near(px[i], px[i - 1], SAME_VERTEX_PX)) {
          points.splice(i, 1)
          px.splice(i, 1)
        }
      }
      if (kind === 'polyline' && points.length >= 4 && near(px[0], px[px.length - 1], CLOSE_PX)) {
        points.pop()
        overlay.extendData = { ...(overlay.extendData as MultiPointExtendData | undefined), closed: true }
      }
    },
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const id = overlay.id
      const ext = (overlay.extendData ?? {}) as MultiPointExtendData
      const style = lineStyle(id)
      if (kind === 'polyline' && ext.closed === true) {
        const props = withLook(id)
        // The Background checkbox writes `style`; `showBackground` is the older switch.
        const filled = ext.showBackground !== false && props.style !== 'stroke'
        return [{
          type: 'polygon',
          key: 'shape',
          attrs: { coordinates },
          styles: {
            style: filled ? 'stroke_fill' : 'stroke',
            color: props.backgroundColor,
            borderColor: style.color,
            borderSize: style.size,
            borderStyle: style.style,
            borderDashedValue: style.dashedValue
          }
        }]
      }
      const figures: Figure[] = [{ type: 'line', key: 'line', attrs: { coordinates }, styles: style }]
      // Path: TV's line ends, an arrow on the last vertex unless `endCapRight` says otherwise.
      if (kind === 'path') figures.push(...endCapFigures(coordinates, { endCapRight: 'arrow', ...ext }, style.color, style.size, 1))
      return figures
    },
    setProperties,
    getProperties
  }
}
