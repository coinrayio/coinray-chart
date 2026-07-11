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
 * Fibonacci Circle — TV-style ellipses that distort with the
 * chart's aspect ratio (rx / ry derived from the raw pixel
 * deltas of the centre + rim anchors, so zooming the time axis
 * horizontally stretches the "circles" without touching their
 * vertical extents).
 *
 * ALTD-1894 rework:
 *
 *   * Default level set now covers up to 4.618. Each level has
 *     its own distinct default colour; level 1 is deliberately
 *     grey (matches the trendline's grey default but each is
 *     independent — recolouring one doesn't touch the other).
 *   * Trendline is a diameter that starts and ends at level
 *     ±1.5 (between level 1 and level 1.618, closer to 1.618),
 *     dashed by default so it doesn't compete visually with
 *     the level rings.
 *   * Faint background bands (annuli) between adjacent enabled
 *     levels fill by default so users get the visual grouping
 *     TV shows out of the box. Tint colour comes from the outer
 *     ring's level colour; alpha follows the Style-tab slider
 *     via `withAlpha` (Level 3 + Level 4 rgba both handled).
 */

import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle, PathStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'

import type { PolygonAttrs } from '../figure/polygon'
import type { TextAttrs } from '../figure/text'
import type { PathAttrs } from '../figure/path'

import { formatFibRatio, resolveFibSettings, withAlpha } from './fibonacciShared'

/** Grey palette entry used both as the level-1 default colour
 *  AND the trendline's default. Storing the constant here
 *  documents the intent — the two share a source value but
 *  the state is independent, so a per-level recolour doesn't
 *  bleed into the trendline. */
const GREY = '#787b86'

/** Default level set — extends to 4.618 per spec, one colour
 *  per ratio so a fresh circle already shows distinct rings.
 *  Level 1 sits deliberately in the middle of the palette as
 *  grey, matching the trendline's grey default. */
export const FIBONACCI_CIRCLE_LEVELS: FigureLevel[] = [
  { value: 0.236, enabled: true, color: '#f44336' },
  { value: 0.382, enabled: true, color: '#ff9800' },
  { value: 0.5, enabled: true, color: '#ffc107' },
  { value: 0.618, enabled: true, color: '#fdd835' },
  { value: 0.786, enabled: true, color: '#cddc39' },
  { value: 1, enabled: true, color: GREY },
  { value: 1.236, enabled: true, color: '#66bb6a' },
  { value: 1.618, enabled: true, color: '#4caf50' },
  { value: 2.618, enabled: true, color: '#00bcd4' },
  { value: 3.618, enabled: true, color: '#2196f3' },
  { value: 4.236, enabled: true, color: '#5c6bc0' },
  { value: 4.618, enabled: true, color: '#9c27b0' }
]

/** Vertex count per sampled ellipse. 96 gives a visibly smooth
 *  curve at typical chart sizes without exploding the vertex
 *  count when several levels are enabled. */
const ELLIPSE_SAMPLES = 96

/** Diameter reach — trendline endpoints sit at level 1.5 on
 *  both sides of the centre (between level 1 and level 1.618,
 *  closer to 1.618 as the spec calls for). */
const TRENDLINE_LEVEL = 1.5

/** Default faint tint for background rings. 10 % keeps the
 *  rings readable without drowning out the strokes. */
const DEFAULT_BG_OPACITY = 10

const fibonacciCircle = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const circleStyle = (props: DeepPartial<OverlayProperties>): Partial<PolygonStyle> => ({
    style: 'stroke',
    borderColor: props.lineColor ?? props.borderColor ?? GREY,
    borderSize: props.lineWidth ?? props.borderWidth,
    borderStyle: props.lineStyle ?? props.borderStyle,
    borderDashedValue: props.lineDashedValue
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
      // Circle-specific default overrides:
      //   * showBackground defaults ON (spec calls for faint
      //     background by default).
      //   * backgroundOpacity defaults 10 (faint).
      // The shared resolver defaults these to false / 20 for
      // the retracement family; override here without touching
      // the shared helper so retracement's defaults stay put.
      const ext = (overlay.extendData ?? {}) as { showBackground?: boolean, backgroundOpacity?: number, showLevels?: boolean }
      const showBackground = ext.showBackground !== false
      const backgroundOpacity = typeof ext.backgroundOpacity === 'number' ? ext.backgroundOpacity : DEFAULT_BG_OPACITY
      const showLevels = ext.showLevels !== false

      // ALTD-1894 — anchors are the TRENDLINE endpoints, both
      // sitting at level ±TRENDLINE_LEVEL (1.5) from the centre.
      //
      // Geometry runs in PIXEL space, sourced from `coordinates`
      // (the engine's freshly-projected anchor positions each
      // render). Using `overlay.points[i].dataIndex` directly
      // would break here — per-point drag (see
      // `eventPressedPointMove` in Overlay.ts) only writes back
      // `timestamp` + `value`, never `dataIndex`, so
      // `points[i].dataIndex` goes stale the moment a dropped
      // anchor is dragged. The render path itself sidesteps
      // that by deriving `coordinates` from `timestamp`; we
      // follow suit and take `coordinates` as the source of
      // truth for the ellipse geometry.
      //
      // Pixel space also gives us the user-visible geometry
      // for free: rings ARE circles when the anchor pair sits
      // at pixel-45° and become ovals as the pixel angle
      // deviates, exactly as the tool is supposed to behave.
      const anchorStart = coordinates[0]
      const anchorEnd = coordinates[1]

      // Centre is the exact pixel midpoint of the anchor pair
      // — no independent projection, so it can't drift relative
      // to the anchors under any rounding regime.
      const centre = {
        x: (anchorStart.x + anchorEnd.x) / 2,
        y: (anchorStart.y + anchorEnd.y) / 2
      }
      const halfPxX = Math.abs((anchorEnd.x - anchorStart.x) / 2)
      const halfPxY = Math.abs((anchorEnd.y - anchorStart.y) / 2)
      // Semi-axes carry a √2 factor so anchors land on the
      // level-TRENDLINE_LEVEL ellipse itself (at parametric 45°),
      // not on its bounding-box corner. Without √2 the anchor
      // would sit at effective level √2 · TRENDLINE_LEVEL
      // (~2.12), past the 1.618 ring, and the trendline would
      // visually detach from the "between level 1 and 1.618"
      // zone. Derivation: on the level-p ellipse
      // (anchor/(rxBase·p))² + (anchor/(ryBase·p))² = 1, and
      // at the anchor both terms contribute equally, so
      // rxBase = halfPx · √2 / p.
      const rxBase = halfPxX * Math.SQRT2 / TRENDLINE_LEVEL
      const ryBase = halfPxY * Math.SQRT2 / TRENDLINE_LEVEL

      const enabledLevels = ((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_CIRCLE_LEVELS)
        .filter(l => l.enabled === true) as FigureLevel[]

      const figures: Array<{
        type: string
        key?: string
        ignoreEvent?: boolean
        isCheckEvent?: boolean
        attrs: unknown
        styles?: Partial<PolygonStyle> | Partial<LineStyle> | Partial<TextStyle> | Partial<PathStyle>
      }> = []

      // Sample an ellipse at level p as a closed polygon of
      // pixel vertices — pure pixel space from `centre` +
      // `rxBase`/`ryBase`. Sharing the same pixel centre as the
      // trendline (which lives on `coordinates[0]`/`[1]`) keeps
      // the two visually coupled: any drift in the anchor
      // pixel positions moves rings and trendline as a unit.
      const sampleEllipse = (p: number): Array<{ x: number, y: number }> => {
        const verts: Array<{ x: number, y: number }> = []
        const rx = rxBase * p
        const ry = ryBase * p
        for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
          const theta = (2 * Math.PI * i) / ELLIPSE_SAMPLES
          verts.push({
            x: centre.x + rx * Math.cos(theta),
            y: centre.y + ry * Math.sin(theta)
          })
        }
        return verts
      }

      // Turn a set of pixel vertices into an SVG closed-subpath
      // string. Consumed by the annulus renderer below (outer +
      // inner subpath with evenodd fill = hole in the middle).
      // Sampling matches the level-ring polygon exactly, so
      // annulus outline and ring stroke stay pixel-perfect
      // aligned regardless of drag/zoom.
      const vertsToSubpath = (verts: Array<{ x: number, y: number }>): string => {
        if (verts.length === 0) return ''
        let s = `M ${verts[0].x} ${verts[0].y}`
        for (let i = 1; i < verts.length; i++) {
          s += ` L ${verts[i].x} ${verts[i].y}`
        }
        return `${s} Z`
      }

      // Background — filled annuli between adjacent enabled
      // levels. Each annulus is a `path` figure with an outer +
      // inner closed subpath and `evenodd` fill so the inner
      // ellipse punches a hole.
      if (showBackground && enabledLevels.length >= 2) {
        const sorted = [...enabledLevels].sort((a, b) => a.value - b.value)
        for (let i = 0; i < sorted.length - 1; i++) {
          const inner = sorted[i]
          const outer = sorted[i + 1]
          const outerPath = vertsToSubpath(sampleEllipse(outer.value))
          const innerPath = vertsToSubpath(sampleEllipse(inner.value))
          const bandColour = outer.color ?? props.lineColor ?? GREY
          const tint = withAlpha(bandColour, backgroundOpacity / 100)
          figures.push({
            type: 'path',
            key: `bg_${inner.value}_${outer.value}`,
            ignoreEvent: true,
            attrs: { x: 0, y: 0, width: 0, height: 0, path: `${outerPath} ${innerPath}` } satisfies PathAttrs,
            styles: { style: 'fill', color: tint, fillRule: 'evenodd' } satisfies Partial<PathStyle>
          })
        }
      }

      // Level rings — one keyed polygon per enabled level,
      // each stroked in its own colour. Always rendered: the
      // Style-tab "Levels" checkbox controls LABEL visibility,
      // not ring visibility (per-level enable checkbox is the
      // per-ring toggle).
      const polygons: PolygonAttrs[] = []
      const texts: TextAttrs[] = []
      enabledLevels.forEach(level => {
        const percent = level.value
        const levelKey = `circle_${percent}`
        const verts = sampleEllipse(percent)
        polygons.push({ key: levelKey, coordinates: verts })
        if (showLevels) {
          const label = formatFibRatio(percent, settings.levelFormat)
          const vAlign = props.textAlignVertical ?? 'top'
          // Label sits at the ring's top/bottom pole in pixel
          // space — 6 px gap outside the ring so the label
          // doesn't overlap the stroke.
          const ry = ryBase * percent
          const y = vAlign === 'bottom' ? centre.y + ry + 6 : centre.y - ry - 6
          texts.push({
            key: `${levelKey}_text`,
            x: centre.x,
            y,
            text: label
          })
        }
      })

      if (polygons.length > 0) {
        figures.push({
          type: 'polygon',
          attrs: polygons,
          styles: circleStyle(props)
        })
      }
      if (texts.length > 0) {
        figures.push({
          type: 'text',
          isCheckEvent: false,
          attrs: texts,
          styles: textStyleFn(props)
        })
      }

      // Trendline — literally the anchor pair, since both
      // anchors ARE the trendline's endpoints (at level ±1.5).
      // No slope/size drift when dragging: the anchors define
      // the diameter directly, so a drag on either endpoint
      // preserves the drawn geometry exactly.
      //
      // Colour + width + style + dash live entirely on
      // extendData's diagonal-* fields so Style-tab changes
      // there never bleed into the level rings; defaults skip
      // `props.lineColor` on purpose.
      if (settings.showDiagonal) {
        // Defaults: grey + dashed + width 2 ("second to
        // smallest" per spec). Dashed matters for the spec
        // AND the visual — a solid diameter would compete
        // with the level-1 ring at the two crossing points.
        const dColor = settings.diagonalColor ?? GREY
        const dWidth = settings.diagonalWidth ?? 2
        const dStyleRaw = settings.diagonalStyle ?? 'dashed'
        const dDashed = settings.diagonalDashedValue ?? [4, 4]
        // Trendline is literally the anchor pair. Since the
        // rings' centre = midpoint(anchorStart, anchorEnd) and
        // rxBase/ryBase come from the same anchor deltas, the
        // trendline and rings share one pixel source of truth
        // and shift together under drag — no relative snap.
        figures.push({
          type: 'line',
          key: 'diagonal',
          attrs: { coordinates: [anchorStart, anchorEnd] },
          styles: {
            style: dStyleRaw as LineStyle['style'],
            size: dWidth,
            color: dColor,
            dashedValue: dDashed
          }
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
