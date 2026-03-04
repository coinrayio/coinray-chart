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

import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle, PolygonStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'

import type { OverlayProperties, ProOverlayTemplate } from './types'

import { getLinearSlopeIntercept } from '../figure/line'
import type { ArcAttrs } from '../figure/arc'

import { getDistance, getRotateCoordinate, getRayLine } from './utils'

const fibonacciSpiral = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const arcStyle = (props: DeepPartial<OverlayProperties>): Partial<PolygonStyle> => ({
    style: props.style ?? 'stroke',
    color: props.backgroundColor ?? 'rgba(22, 119, 255, 0.15)',
    borderColor: props.lineColor ?? props.borderColor,
    borderSize: props.borderWidth,
    borderStyle: props.borderStyle ?? props.lineStyle
  })

  const lineStyle = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: props.lineStyle,
    size: props.lineWidth,
    color: props.lineColor ?? props.borderColor,
    dashedValue: props.lineDashedValue
  })

  return {
    name: 'fibonacciSpiral',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const props = properties.get(overlay.id) ?? {}
      if (coordinates.length > 1) {
        const startRadius = getDistance(coordinates[0], coordinates[1]) / Math.sqrt(24)
        const flag = coordinates[1].x > coordinates[0].x ? 0 : 1
        const kb = getLinearSlopeIntercept(coordinates[0], coordinates[1])
        const offsetAngle = kb !== null
          ? Math.atan(kb[0]) + Math.PI * flag
          : (coordinates[1].y > coordinates[0].y ? Math.PI / 2 : Math.PI / 2 * 3)
        const rotateCoordinate1 = getRotateCoordinate(
          { x: coordinates[0].x - startRadius, y: coordinates[0].y },
          coordinates[0],
          offsetAngle
        )
        const rotateCoordinate2 = getRotateCoordinate(
          { x: coordinates[0].x - startRadius, y: coordinates[0].y - startRadius },
          coordinates[0],
          offsetAngle
        )
        const arcs: ArcAttrs[] = [{
          key: 'arc_0',
          ...rotateCoordinate1,
          r: startRadius,
          startAngle: offsetAngle,
          endAngle: offsetAngle + Math.PI / 2
        }, {
          key: 'arc_1',
          ...rotateCoordinate2,
          r: startRadius * 2,
          startAngle: offsetAngle + Math.PI / 2,
          endAngle: offsetAngle + Math.PI
        }]
        let x = coordinates[0].x - startRadius
        let y = coordinates[0].y - startRadius
        for (let i = 2; i < 9; i++) {
          const r = arcs[i - 2].r + arcs[i - 1].r
          let startAngle = 0
          switch (i % 4) {
            case 0: {
              startAngle = offsetAngle
              x -= (arcs[i - 2].r)
              break
            }
            case 1: {
              startAngle = offsetAngle + Math.PI / 2
              y -= arcs[i - 2].r
              break
            }
            case 2: {
              startAngle = offsetAngle + Math.PI
              x += (arcs[i - 2].r)
              break
            }
            case 3: {
              startAngle = offsetAngle + Math.PI / 2 * 3
              y += arcs[i - 2].r
              break
            }
          }
          const endAngle = startAngle + Math.PI / 2
          const rotateCoordinate = getRotateCoordinate({ x, y }, coordinates[0], offsetAngle)
          arcs.push({
            key: `arc_${i}`,
            ...rotateCoordinate,
            r,
            startAngle,
            endAngle
          })
        }
        return [
          {
            type: 'arc',
            attrs: arcs,
            styles: arcStyle(props)
          },
          {
            type: 'line',
            key: 'ray',
            attrs: getRayLine(coordinates, bounding),
            styles: lineStyle(props)
          }
        ]
      }
      return []
    },
    setProperties: (_properties: DeepPartial<OverlayProperties>, id: string) => {
      const current = properties.get(id) ?? {}
      const newProps = clone(current) as Record<string, unknown>
      merge(newProps, _properties)
      properties.set(id, newProps as DeepPartial<OverlayProperties>)
    },
    getProperties: (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}
  }
}

export default fibonacciSpiral
