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
 * Fibonacci Spiral — a true logarithmic (Bernoulli) spiral
 * whose radius grows by the golden ratio per quarter turn.
 *
 * Polar equation:    r(θ) = a · e^(b·θ)
 * Quarter-turn law:  b = ln(φ) / (π/2)  ≈ 0.3063489
 * Scale factor:      a  = r₀ / e^(b·θ₀)
 *
 * where (r₀, θ₀) are the polar coordinates of the second
 * anchor relative to the first — so the spiral passes exactly
 * through both anchor points at the moment the user places
 * them. Zooming re-projects both anchors into pixel space
 * before recomputing (r₀, θ₀), which lets the spiral scale
 * seamlessly with the chart.
 */

import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'

import type { OverlayProperties, ProOverlayTemplate } from './types'

import { getRayLine } from './utils'

/** Golden ratio. */
const PHI = (1 + Math.sqrt(5)) / 2
/** Growth rate per radian for a golden-ratio spiral (quarter
 *  turn multiplies r by φ). */
const SPIRAL_B = Math.log(PHI) / (Math.PI / 2)

/** Angular range sampled around θ₀. Two turns outward + one
 *  turn inward keeps the visible spiral centred on the anchor
 *  pair while letting users see the growth in both
 *  directions. Beyond that the outer radius grows huge and the
 *  inner radius vanishes — nothing informative. */
const SPIRAL_SWEEP_INWARD = 2 * Math.PI
const SPIRAL_SWEEP_OUTWARD = 4 * Math.PI

/** Sample step in radians. 1° gives a visually smooth curve
 *  even under the sharpest visible curvature (inner turn) and
 *  keeps the vertex count bounded at ~2160 for six full turns. */
const SPIRAL_STEP = Math.PI / 180

const fibonacciSpiral = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyleFn = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: props.lineStyle ?? 'solid',
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
      if (coordinates.length <= 1) return []

      const centre = coordinates[0]
      const tip = coordinates[1]

      // `counterclockwise` mirrors the spiral vertically so it
      // grows the OTHER way around. Practically we negate every
      // sin-derived quantity: the anchor's polar angle (so θ₀
      // corresponds to the mirrored tip), the sample step's
      // sin, and the render's sin. Keeping the sign inversion
      // localised means the spiral formula (r(θ) = a·e^(b·θ))
      // is unchanged — only the y projection flips.
      const ext = (overlay.extendData ?? {}) as { counterclockwise?: boolean }
      const ccw = ext.counterclockwise === true

      const dx = tip.x - centre.x
      const dyRaw = tip.y - centre.y
      const dy = ccw ? -dyRaw : dyRaw
      const r0 = Math.hypot(dx, dy)
      if (r0 <= 0) return []
      const theta0 = Math.atan2(dy, dx)
      const a = r0 / Math.exp(SPIRAL_B * theta0)

      // Sample points along the spiral from θ₀ − inward sweep
      // to θ₀ + outward sweep. `line` connects them as a
      // polyline.
      const points: Array<{ x: number, y: number }> = []
      const thetaMin = theta0 - SPIRAL_SWEEP_INWARD
      const thetaMax = theta0 + SPIRAL_SWEEP_OUTWARD
      const ySign = ccw ? -1 : 1
      for (let theta = thetaMin; theta <= thetaMax; theta += SPIRAL_STEP) {
        const r = a * Math.exp(SPIRAL_B * theta)
        points.push({
          x: centre.x + r * Math.cos(theta),
          y: centre.y + ySign * r * Math.sin(theta)
        })
      }

      // Ray inherits the Line row's stroke — no independent
      // Trend Line row for spiral (ALTD-1894). One picker
      // drives both the spiral curve and its ray so users
      // get one colour decision instead of two.
      const stroke = lineStyleFn(props)

      return [
        {
          type: 'line',
          key: 'spiral',
          attrs: { coordinates: points },
          styles: stroke
        },
        {
          type: 'line',
          key: 'ray',
          attrs: getRayLine(coordinates, bounding),
          styles: stroke
        }
      ]
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
