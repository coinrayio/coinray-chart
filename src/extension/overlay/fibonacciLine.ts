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
 * Fibonacci Channel (engine key: `fibonacciLine` — the label
 * humanises to "Fibonacci Channel" via
 * OVERLAY_DISPLAY_NAME_OVERRIDES, engine name kept stable so
 * legacy saves keep loading).
 *
 * Three-anchor drawing:
 *   * coords[0], coords[1] — the base line (level 0). Slope of
 *     the channel is fully determined here.
 *   * coords[2] — perpendicular offset that defines the
 *     channel width. Level 100 % is the parallel line through
 *     the perpendicular projection of coords[2].
 *
 * Fib levels between 0 and 1 render inside the channel
 * (retracement); levels > 1 (or negative) project past the
 * far wall (extension). All levels are slanted parallels of
 * the base line.
 *
 * Prices — currently no per-level price label. Because level
 * lines are slanted, "price at level p" varies along the
 * line, so a single price would be arbitrary. The Style-tab
 * Prices toggle is stored but has no visible effect on the
 * channel; can be revisited later once an anchor convention
 * is picked (right-endpoint / midpoint / etc.).
 */

import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { formatFibRatio, resolveFibSettings, withAlpha } from './fibonacciShared'

/** Retracement level set — same defaults the retracement
 *  template uses, exported so other fib templates can share.
 *  Extension levels are marked disabled by default; the user
 *  can toggle them on from the Levels section for extension
 *  behaviour. */
export const FIBONACCI_RETRACEMENT_LEVELS: FigureLevel[] = [
  { value: 0, enabled: true },
  { value: 0.236, enabled: true },
  { value: 0.382, enabled: true },
  { value: 0.5, enabled: true },
  { value: 0.618, enabled: true },
  { value: 0.786, enabled: true },
  { value: 1, enabled: true },
  { value: 1.618, enabled: false },
  { value: 2.618, enabled: false },
  { value: 3.618, enabled: false },
  { value: 4.236, enabled: false }
]

/** Channel-specific default level set — same list as
 *  retracement but with the first three extension levels
 *  enabled out of the box. A fib channel with only 0-100 %
 *  levels feels naked; users almost always expect at least
 *  1.618 / 2.618 / 3.618 to render past the far wall so the
 *  extension side is visible on drop. Users can still toggle
 *  any of them off from the Levels section afterwards. */
export const FIBONACCI_CHANNEL_LEVELS: FigureLevel[] = [
  { value: 0, enabled: true },
  { value: 0.236, enabled: true },
  { value: 0.382, enabled: true },
  { value: 0.5, enabled: true },
  { value: 0.618, enabled: true },
  { value: 0.786, enabled: true },
  { value: 1, enabled: true },
  { value: 1.618, enabled: true },
  { value: 2.618, enabled: true },
  { value: 3.618, enabled: true },
  { value: 4.236, enabled: false }
]

interface Coord { x: number; y: number }

interface FigureSpec {
  type: string
  key?: string
  ignoreEvent?: boolean
  isCheckEvent?: boolean
  attrs: unknown
  styles?: Partial<LineStyle> | Partial<TextStyle> | Partial<PolygonStyle>
}

/** Vector displacement a level = 1 line needs relative to the
 *  base. Matches TV's fib channel geometry, where the "V"
 *  formed by the main line and the distance line shares its
 *  vertex at `coords[0]` (point 1) — the two lines diverge
 *  from there to `coords[1]` (main line's other end) and
 *  `coords[2]` (distance line's other end). So the offset is
 *  `coords[2] - coords[0]`, NOT `coords[2] - coords[1]`.
 *
 *  With this offset every level's endpoints shift by the
 *  SAME vector, keeping the line parallel to base. Level 1's
 *  start = `coords[0] + offset = coords[2]`, so the near
 *  channel wall lands exactly on the point-3 anchor no matter
 *  how the user drags it. When the drag has an along-base
 *  component (slant angle ≠ 90° to base), the walls slide
 *  sideways along base direction as the user rotates. When
 *  the drag is purely perpendicular, the walls just expand
 *  outward like a classic parallel channel. */
const level1Offset = (baseStart: Coord, offsetAnchor: Coord): Coord => ({
  x: offsetAnchor.x - baseStart.x,
  y: offsetAnchor.y - baseStart.y
})

/** Extend a segment `(a, b)` to the given x range. Returns
 *  the level line's rendered endpoints. Vertical segments
 *  (a.x === b.x) short-circuit to the base x, which is what
 *  TV does for straight-up channels. */
const extendSegment = (a: Coord, b: Coord, leftX: number, rightX: number): [Coord, Coord] => {
  if (Math.abs(b.x - a.x) < 0.001) {
    return [{ x: a.x, y: a.y }, { x: a.x, y: b.y }]
  }
  const m = (b.y - a.y) / (b.x - a.x)
  const leftY = a.y + m * (leftX - a.x)
  const rightY = a.y + m * (rightX - a.x)
  return [{ x: leftX, y: leftY }, { x: rightX, y: rightY }]
}

const fibonacciLine = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const fbLinesStyle = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: props.lineStyle ?? 'solid',
    size: props.lineWidth,
    color: props.lineColor ?? props.borderColor,
    dashedValue: props.lineDashedValue
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
    name: 'fibonacciLine',
    // 3-click drawing (totalStep = clicks + 1). Post-ALTD-1894:
    // was 3 (2-click) when the template rendered a plain
    // horizontal-levels tool; the channel needs a third anchor
    // for the parallel offset.
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const props = properties.get(overlay.id) ?? {}

      const figures: FigureSpec[] = []
      if (coordinates.length === 0) return figures

      const settings = resolveFibSettings(overlay.extendData)

      // Diagonal poly-line through every placed anchor so the
      // draw-in-progress state has a visible rubber-band, same
      // Only the MAIN line renders — the distance line
      // (coords[0]→coords[2]) is deliberately not drawn:
      //
      //   * TV shows only the main leg as the visible V-arm;
      //     the distance arm is invisible even though its
      //     anchor stays draggable.
      //   * Trend Line settings apply ONLY to the main line,
      //     so a user styling "the trend line" doesn't
      //     accidentally paint an invisible-but-clickable
      //     distance line.
      //
      // coords[2] still gets its default point figure
      // (needDefaultPointFigure: true handles that), so the
      // anchor is draggable without a visible line
      // radiating out of it.
      if (settings.showDiagonal && coordinates.length >= 2) {
        const dColor = settings.diagonalColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
        const dWidth = settings.diagonalWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth
        const dStyle = (settings.diagonalStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle) as LineStyle['style']
        const dDashed = settings.diagonalDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
        figures.push({
          type: 'line',
          key: 'diagonal_main',
          attrs: { coordinates: [coordinates[0], coordinates[1]] },
          styles: { style: dStyle, size: dWidth, color: dColor, dashedValue: dDashed }
        })
      }

      // Channel rendering only makes sense once the third
      // anchor exists.
      if (coordinates.length < 3) return figures

      const base0 = coordinates[0]
      const base1 = coordinates[1]
      const offsetAnchor = coordinates[2]
      const perpOffset = level1Offset(base0, offsetAnchor)

      const enabledLevels = (((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_CHANNEL_LEVELS) as FigureLevel[])
        .filter(l => l.enabled)

      // Level lines are parallels of the base. Each level p
      // shifts both base endpoints by `p * perpOffset`, then
      // extends the segment to the chart bounds (or clamps to
      // By default each level line spans exactly the length
      // of the main line (its start lands on the distance
      // line at fraction p from coords[0], its end sits at
      // coords[1] + p·offset — that's `endBefore - startBefore
      // = coords[1] - coords[0]`). Extension only kicks in
      // when the Style-tab Extend row's flags are on, and
      // reaches to the chart edges the same way retracement
      // does.
      const enrichedLevels = enabledLevels
        .map(level => {
          const percent = level.value
          const startBefore: Coord = {
            x: base0.x + perpOffset.x * percent,
            y: base0.y + perpOffset.y * percent
          }
          const endBefore: Coord = {
            x: base1.x + perpOffset.x * percent,
            y: base1.y + perpOffset.y * percent
          }
          let start = startBefore
          let end = endBefore
          if (settings.extendLeft || settings.extendRight) {
            const leftLimit = settings.extendLeft ? 0 : Math.min(startBefore.x, endBefore.x)
            const rightLimit = settings.extendRight ? bounding.width : Math.max(startBefore.x, endBefore.x)
            const [extS, extE] = extendSegment(startBefore, endBefore, leftLimit, rightLimit)
            start = extS
            end = extE
          }
          const color = level.color ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
          return { percent, start, end, color }
        })
        // Reverse flag swaps sort order so bands paint the
        // other way. Sort by `start.y` so band iteration is
        // deterministic.
        .sort((a, b) => settings.reverse ? b.start.y - a.start.y : a.start.y - b.start.y)

      // Background bands — filled quadrilaterals between
      // adjacent enriched levels. Fill from the lower level's
      // colour with the slider driving alpha (level colour's
      // own alpha is ignored via `withAlpha`).
      if (settings.showBackground && enrichedLevels.length >= 2) {
        for (let i = 0; i < enrichedLevels.length - 1; i++) {
          const top = enrichedLevels[i]
          const bot = enrichedLevels[i + 1]
          const tint = withAlpha(bot.color, settings.backgroundOpacity / 100)
          figures.push({
            type: 'polygon',
            key: `bg_${top.percent}_${bot.percent}`,
            ignoreEvent: true,
            attrs: {
              coordinates: [top.start, top.end, bot.end, bot.start]
            },
            styles: { style: 'fill', color: tint }
          })
        }
      }

      // Level lines — one figure with every level as an entry
      // in the attrs array so the engine renders them in a
      // single canvas pass. Per-level colour overrides still
      // work because each entry carries a keyed identifier.
      figures.push({
        type: 'line',
        attrs: enrichedLevels.map(l => ({
          key: `level_${l.percent}`,
          coordinates: [l.start, l.end]
        })),
        styles: fbLinesStyle(props)
      })

      // Labels — only ratio, no price. See file-level comment.
      //
      // hAlign 'left' / 'right' render the text OUTSIDE the
      // level line (past its start / end endpoints), not
      // inside like a canvas `align: 'left'` at start would.
      // Anchor stays at the endpoint, but text-align flips so
      // the drawn glyphs run away from the line rather than
      // over it. `center` keeps the natural centred behaviour.
      if (settings.showText && settings.showLevels) {
        const hAlign = props.textAlignHorizontal ?? 'left'
        const vAlign = props.textAlignVertical ?? 'top'
        const baseline: CanvasTextBaseline = vAlign === 'middle' ? 'middle' : vAlign === 'bottom' ? 'top' : 'bottom'
        const texts = enrichedLevels.map(l => {
          const anchor = hAlign === 'right'
            ? l.end
            : hAlign === 'center'
              ? { x: (l.start.x + l.end.x) / 2, y: (l.start.y + l.end.y) / 2 }
              : l.start
          // Flip the canvas alignment relative to the anchor
          // so the text extends AWAY from the line. `center`
          // stays centred.
          let canvasAlign: CanvasTextAlign = 'center'
          if (hAlign === 'left') canvasAlign = 'right'
          else if (hAlign === 'right') canvasAlign = 'left'
          return {
            key: `level_${l.percent}_text`,
            x: anchor.x,
            y: anchor.y,
            text: formatFibRatio(l.percent, settings.levelFormat),
            align: canvasAlign,
            baseline
          }
        })
        figures.push({
          type: 'text',
          isCheckEvent: false,
          attrs: texts,
          styles: textStyleFn(props)
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

export default fibonacciLine
