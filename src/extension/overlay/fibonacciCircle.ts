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
import type { LineStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'

import type { PolygonAttrs } from '../figure/polygon'
import type { TextAttrs } from '../figure/text'

import { buildDiagonal, formatFibRatio, resolveFibSettings } from './fibonacciShared'

/** Number of vertices per sampled ellipse. 96 gives a visibly
 *  smooth curve at typical chart sizes without exploding the
 *  vertex count when a user has 6-11 levels enabled. */
const ELLIPSE_SAMPLES = 96

export const FIBONACCI_CIRCLE_LEVELS: FigureLevel[] = [
  { value: 0.236, enabled: true },
  { value: 0.382, enabled: true },
  { value: 0.5, enabled: true },
  { value: 0.618, enabled: true },
  { value: 0.786, enabled: true },
  { value: 1, enabled: true }
]

const fibonacciCircle = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const circleStyle = (props: DeepPartial<OverlayProperties>): Partial<PolygonStyle> => ({
    style: props.style ?? 'stroke',
    color: props.backgroundColor ?? 'rgba(22, 119, 255, 0.15)',
    borderColor: props.lineColor ?? props.borderColor,
    borderSize: props.borderWidth,
    borderStyle: props.borderStyle ?? props.lineStyle
  })

  const textStyleFn = (props: DeepPartial<OverlayProperties>): Partial<TextStyle> => ({
    color: props.textColor,
    family: props.textFont,
    size: props.textFontSize,
    weight: props.textFontWeight,
    fontStyle: props.textFontStyle,
    backgroundColor: props.textBackgroundColor,
    paddingLeft: props.textPaddingLeft,
    paddingRight: props.textPaddingRight,
    paddingTop: props.textPaddingTop,
    paddingBottom: props.textPaddingBottom
  })

  return {
    name: 'fibonacciCircle',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const props = properties.get(overlay.id) ?? {}
      if (coordinates.length <= 1) return []

      const settings = resolveFibSettings(overlay.extendData)
      const centre = coordinates[0]
      const rim = coordinates[1]
      const levels = ((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_CIRCLE_LEVELS)
        .filter(l => l.enabled === true)

      // TV renders "circles" as ELLIPSES with independent
      // horizontal and vertical radii derived from the pixel
      // deltas of the anchor pair. When the user zooms the
      // time axis, |ΔX| in pixels stretches while |ΔY| stays
      // roughly constant (or vice versa), so the ellipse
      // distorts with the chart. Level 1 exactly passes
      // through the rim anchor because (rxBase, ryBase) map
      // to (rim.x - centre.x, rim.y - centre.y). Absolute
      // values ensure a drag in any quadrant produces the same
      // ellipse — the level radius doesn't flip sign with
      // direction.
      const rxBase = Math.abs(rim.x - centre.x)
      const ryBase = Math.abs(rim.y - centre.y)

      const polygons: PolygonAttrs[] = []
      const texts: TextAttrs[] = []
      levels.forEach(level => {
        const percent = level.value ?? 0
        const rx = rxBase * percent
        const ry = ryBase * percent
        const levelKey = `circle_${percent}`
        // Sample the ellipse as a closed polygon. Vertices
        // sit at (centre.x + rx·cos θ, centre.y + ry·sin θ)
        // for θ evenly spaced around 2π. The polygon figure
        // closes the last→first edge automatically.
        const verts: Array<{ x: number, y: number }> = []
        for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
          const theta = (2 * Math.PI * i) / ELLIPSE_SAMPLES
          verts.push({
            x: centre.x + rx * Math.cos(theta),
            y: centre.y + ry * Math.sin(theta)
          })
        }
        polygons.push({ key: levelKey, coordinates: verts })
        // Labels — only when the master `showText` is on AND
        // `showLevels`. `levelFormat` picks decimal (0.500)
        // vs percent (50.0 %). `textAlignVertical` picks
        // whether the label sits below the ellipse (default,
        // 'top' or unset) or above ('bottom'). The vertical
        // offset uses ry (not r) so the label sits on the
        // actual top/bottom pole of the ellipse.
        if (settings.showText && settings.showLevels) {
          const label = formatFibRatio(percent, settings.levelFormat)
          const vAlign = props.textAlignVertical ?? 'top'
          const y = vAlign === 'bottom' ? centre.y - ry - 6 : centre.y + ry + 6
          texts.push({
            key: `${levelKey}_text`,
            x: centre.x,
            y,
            text: label
          })
        }
      })

      const figures: Array<{ type: string, key?: string, ignoreEvent?: boolean, isCheckEvent?: boolean, attrs: unknown, styles?: Partial<PolygonStyle> | Partial<LineStyle> | Partial<TextStyle> }> = [
        {
          type: 'polygon',
          attrs: polygons,
          styles: circleStyle(props)
        },
        {
          type: 'text',
          isCheckEvent: false,
          attrs: texts,
          styles: textStyleFn(props)
        }
      ]

      // Diagonal — the centre → rim radius. Trend Line row
      // styles it independently of the level circles.
      const diagonal = buildDiagonal(centre, rim, settings)
      if (diagonal !== null) {
        figures.push({
          type: diagonal.type,
          key: diagonal.key,
          attrs: diagonal.attrs,
          styles: diagonal.styles as Partial<LineStyle> | undefined
        })
      }

      return figures
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

export default fibonacciCircle
