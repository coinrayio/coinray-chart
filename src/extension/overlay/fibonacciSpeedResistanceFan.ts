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
 * Fibonacci Speed Resistance Fan
 *
 * Two independent level sets — one for price-fanning rays
 * (targeting Y at X = extent.x) and one for time-fanning
 * rays (targeting X at Y = extent.y). Each set uses the same
 * default 7 fib ratios (0 / 0.25 / 0.382 / 0.5 / 0.618 /
 * 0.75 / 1) and colours; the user can toggle levels on/off
 * or override colours but can't add or remove entries.
 *
 * Labels attach per-side (left / right for price rays, top /
 * bottom for time rays) and inherit each level's line colour
 * so a scan across the fan reads as one visual family.
 *
 * Grid layer (vertical + horizontal lines through each level's
 * (X, Y) intersection) toggles independently of the rays and
 * gets its own colour picker.
 *
 * Background bands fill the wedges between adjacent enabled
 * price rays, clipped to chart width, tinted per-level with
 * the slider driving alpha.
 */

import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'

import type { LineAttrs } from '../figure/line'
import type { TextAttrs } from '../figure/text'
import type { PolygonAttrs } from '../figure/polygon'

import { getRayLine } from './utils'
import { formatFibRatio, resolveFibSettings, withAlpha } from './fibonacciShared'

/** Default palette shared between price + time levels — same
 *  ratio gets the same colour on both axes so a user
 *  eyeballing the 0.618 line on the price side knows the
 *  matching time line at a glance. */
const FAN_DEFAULT_COLOURS: Record<string, string> = {
  0: '#787b86',
  0.25: '#f44336',
  0.382: '#ff9800',
  0.5: '#fdd835',
  0.618: '#4caf50',
  0.75: '#009688',
  1: '#2196f3'
}

const withDefaults = (): FigureLevel[] => [
  { value: 0, enabled: true, color: FAN_DEFAULT_COLOURS[0] },
  { value: 0.25, enabled: true, color: FAN_DEFAULT_COLOURS[0.25] },
  { value: 0.382, enabled: true, color: FAN_DEFAULT_COLOURS[0.382] },
  { value: 0.5, enabled: true, color: FAN_DEFAULT_COLOURS[0.5] },
  { value: 0.618, enabled: true, color: FAN_DEFAULT_COLOURS[0.618] },
  { value: 0.75, enabled: true, color: FAN_DEFAULT_COLOURS[0.75] },
  { value: 1, enabled: true, color: FAN_DEFAULT_COLOURS[1] }
]

export const FIBONACCI_FAN_LEVELS: FigureLevel[] = withDefaults()

/** Coerce whatever the host wrote as `fanPriceLevels` /
 *  `fanTimeLevels` back into a level array. Missing / malformed
 *  input falls through to the default set. */
const resolveLevels = (raw: unknown): FigureLevel[] => {
  if (!Array.isArray(raw) || raw.length === 0) return withDefaults()
  return (raw as Array<Partial<FigureLevel>>).map((l, i) => {
    const value = typeof l.value === 'number' ? l.value : FIBONACCI_FAN_LEVELS[i].value
    const key = String(value)
    return {
      value,
      enabled: l.enabled !== false,
      color: l.color ?? FAN_DEFAULT_COLOURS[key]
    }
  })
}

const fibonacciSpeedResistanceFan = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const baseLineStyle = (props: DeepPartial<OverlayProperties>): Partial<LineStyle> => ({
    style: props.lineStyle ?? 'solid',
    size: props.lineWidth,
    dashedValue: props.lineDashedValue
  })

  const textStyleFn = (props: DeepPartial<OverlayProperties>): Partial<TextStyle> => ({
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
    name: 'fibonacciSpeedResistanceFan',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const props = properties.get(overlay.id) ?? {}
      if (coordinates.length <= 1) return []

      const settings = resolveFibSettings(overlay.extendData)
      const ext = (overlay.extendData ?? {}) as {
        fanPriceLevels?: unknown
        fanTimeLevels?: unknown
        showLeftLabels?: boolean
        showRightLabels?: boolean
        showTopLabels?: boolean
        showBottomLabels?: boolean
        showGrid?: boolean
        gridColor?: string
      }
      const priceLevels = resolveLevels(ext.fanPriceLevels).filter(l => l.enabled)
      const timeLevels = resolveLevels(ext.fanTimeLevels).filter(l => l.enabled)
      const showLeftLabels = ext.showLeftLabels !== false
      const showRightLabels = ext.showRightLabels !== false
      const showTopLabels = ext.showTopLabels !== false
      const showBottomLabels = ext.showBottomLabels !== false
      const showGrid = ext.showGrid !== false
      const gridColour = ext.gridColor ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor

      const origin = settings.reverse ? coordinates[1] : coordinates[0]
      const extent = settings.reverse ? coordinates[0] : coordinates[1]
      const xDistance = extent.x - origin.x
      const yDistance = extent.y - origin.y

      // Box bounds — labels sit OUTSIDE these regardless of
      // drag direction so a bottom→top drag doesn't stuff top
      // labels inside the fan.
      const leftX = Math.min(origin.x, extent.x)
      const rightX = Math.max(origin.x, extent.x)
      const topY = Math.min(origin.y, extent.y)
      const bottomY = Math.max(origin.y, extent.y)
      const LABEL_GAP = 8

      const figures: Array<{ type: string, key?: string, ignoreEvent?: boolean, isCheckEvent?: boolean, attrs: unknown, styles?: Partial<LineStyle> | Partial<TextStyle> | Partial<PolygonStyle> }> = []

      // Background bands — one triangular wedge per adjacent
      // pair of enabled price levels. Apex at `origin` (all
      // rays converge there), base at the two rays' far
      // endpoints on the chart edge in the extent's direction.
      // The old impl parameterised each ray from left-chart-edge
      // to right-chart-edge, producing an hourglass that
      // mirrored into the empty half of the chart.
      if (settings.showBackground && priceLevels.length >= 2) {
        // Ray from origin toward (extent.x, targetY_p). Extend
        // to the chart edge on whichever side extent lies —
        // if dx > 0 the right edge, dx < 0 the left. A vertical
        // drag (dx == 0) falls back to a vertical clamp.
        const rayFarEndpoint = (p: number): { x: number, y: number } => {
          const targetY = origin.y + yDistance * p
          const dx = extent.x - origin.x
          const dy = targetY - origin.y
          if (dx === 0) {
            // Vertical drag — extend along y to the far edge.
            const edgeY = yDistance > 0 ? bounding.height : 0
            return { x: origin.x, y: edgeY }
          }
          const edgeX = dx > 0 ? bounding.width : 0
          const t = (edgeX - origin.x) / dx
          return { x: origin.x + dx * t, y: origin.y + dy * t }
        }
        for (let i = 0; i < priceLevels.length - 1; i++) {
          const a = priceLevels[i]
          const b = priceLevels[i + 1]
          const aFar = rayFarEndpoint(a.value)
          const bFar = rayFarEndpoint(b.value)
          const bandColour = b.color ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
          const tint = withAlpha(bandColour, settings.backgroundOpacity / 100)
          figures.push({
            type: 'polygon',
            key: `bg_price_${a.value}_${b.value}`,
            ignoreEvent: true,
            attrs: {
              coordinates: [origin, aFar, bFar]
            } satisfies PolygonAttrs,
            styles: { style: 'fill', color: tint }
          })
        }
      }

      // Time-side background bands — mirror of the price loop
      // but the rays fan toward Y = extent.y instead of X =
      // extent.x. Same apex-at-origin triangle geometry so
      // adjacent time levels produce wedges pointing toward
      // the top or bottom chart edge (whichever side extent
      // lies vertically).
      if (settings.showBackground && timeLevels.length >= 2) {
        const timeRayFarEndpoint = (p: number): { x: number, y: number } => {
          const targetX = origin.x + xDistance * p
          const dx = targetX - origin.x
          const dy = extent.y - origin.y
          if (dy === 0) {
            // Horizontal drag — extend along x to the far
            // horizontal edge.
            const edgeX = xDistance > 0 ? bounding.width : 0
            return { x: edgeX, y: origin.y }
          }
          const edgeY = dy > 0 ? bounding.height : 0
          const t = (edgeY - origin.y) / dy
          return { x: origin.x + dx * t, y: origin.y + dy * t }
        }
        for (let i = 0; i < timeLevels.length - 1; i++) {
          const a = timeLevels[i]
          const b = timeLevels[i + 1]
          const aFar = timeRayFarEndpoint(a.value)
          const bFar = timeRayFarEndpoint(b.value)
          const bandColour = b.color ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
          const tint = withAlpha(bandColour, settings.backgroundOpacity / 100)
          figures.push({
            type: 'polygon',
            key: `bg_time_${a.value}_${b.value}`,
            ignoreEvent: true,
            attrs: {
              coordinates: [origin, aFar, bFar]
            } satisfies PolygonAttrs,
            styles: { style: 'fill', color: tint }
          })
        }
      }

      // Grid — vertical line at each price level's X, horizontal
      // line at each time level's Y. All grid lines share the
      // grid colour picker; toggles off cleanly.
      if (showGrid) {
        const gridLines: LineAttrs[] = []
        priceLevels.forEach(l => {
          const x = origin.x + xDistance * l.value
          gridLines.push({ key: `grid_price_${l.value}`, coordinates: [{ x, y: origin.y }, { x, y: extent.y }] })
        })
        timeLevels.forEach(l => {
          const y = origin.y + yDistance * l.value
          gridLines.push({ key: `grid_time_${l.value}`, coordinates: [{ x: origin.x, y }, { x: extent.x, y }] })
        })
        figures.push({
          type: 'line',
          attrs: gridLines,
          styles: { ...baseLineStyle(props), color: gridColour }
        })
      }

      // Price rays — one per enabled price level. Ray colour
      // and label colour both inherit from `level.color` so a
      // level recoloured in the Levels section paints
      // consistently across ray + labels.
      priceLevels.forEach(l => {
        const targetY = origin.y + yDistance * l.value
        const rayPieces = getRayLine([origin, { x: extent.x, y: targetY }], bounding)
        const rays = Array.isArray(rayPieces) ? rayPieces : [rayPieces]
        rays.forEach((r, i) => {
          if ('coordinates' in r) {
            figures.push({
              type: 'line',
              key: `price_ray_${l.value}_${i}`,
              attrs: { coordinates: r.coordinates },
              styles: { ...baseLineStyle(props), color: l.color ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor }
            })
          }
        })

        // Labels — Left sits at leftX − gap with `align:
        // 'right'` so glyphs extend LEFT of the box; Right
        // sits at rightX + gap with `align: 'left'` so glyphs
        // extend RIGHT of the box. Each label's y is the
        // level's own `targetY` regardless of which side the
        // box's outer edge coincides with, so labels stay with
        // their respective levels instead of collapsing at the
        // origin when the drag runs bottom→top.
        const labelText = formatFibRatio(l.value, settings.levelFormat)
        const labelColour = l.color ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
        if (showLeftLabels) {
          figures.push({
            type: 'text',
            isCheckEvent: false,
            attrs: [{
              key: `price_label_left_${l.value}`,
              x: leftX - LABEL_GAP,
              y: targetY,
              text: labelText,
              align: 'right',
              baseline: 'middle'
            } satisfies TextAttrs],
            styles: { ...textStyleFn(props), color: labelColour }
          })
        }
        if (showRightLabels) {
          figures.push({
            type: 'text',
            isCheckEvent: false,
            attrs: [{
              key: `price_label_right_${l.value}`,
              x: rightX + LABEL_GAP,
              y: targetY,
              text: labelText,
              align: 'left',
              baseline: 'middle'
            } satisfies TextAttrs],
            styles: { ...textStyleFn(props), color: labelColour }
          })
        }
      })

      // Time rays — one per enabled time level. Same pattern as
      // price rays but fanning toward the horizontal line at
      // Y = extent.y.
      timeLevels.forEach(l => {
        const targetX = origin.x + xDistance * l.value
        const rayPieces = getRayLine([origin, { x: targetX, y: extent.y }], bounding)
        const rays = Array.isArray(rayPieces) ? rayPieces : [rayPieces]
        rays.forEach((r, i) => {
          if ('coordinates' in r) {
            figures.push({
              type: 'line',
              key: `time_ray_${l.value}_${i}`,
              attrs: { coordinates: r.coordinates },
              styles: { ...baseLineStyle(props), color: l.color ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor }
            })
          }
        })

        // Time labels — Top at topY − gap with `baseline:
        // 'bottom'` so glyphs sit ABOVE the anchor; Bottom at
        // bottomY + gap with `baseline: 'top'` so glyphs sit
        // BELOW. Each label's x is the level's own `targetX`
        // regardless of drag direction so labels stay tied to
        // their level instead of clustering at origin.x.
        const labelText = formatFibRatio(l.value, settings.levelFormat)
        const labelColour = l.color ?? props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor
        if (showTopLabels) {
          figures.push({
            type: 'text',
            isCheckEvent: false,
            attrs: [{
              key: `time_label_top_${l.value}`,
              x: targetX,
              y: topY - LABEL_GAP,
              text: labelText,
              align: 'center',
              baseline: 'bottom'
            } satisfies TextAttrs],
            styles: { ...textStyleFn(props), color: labelColour }
          })
        }
        if (showBottomLabels) {
          figures.push({
            type: 'text',
            isCheckEvent: false,
            attrs: [{
              key: `time_label_bottom_${l.value}`,
              x: targetX,
              y: bottomY + LABEL_GAP,
              text: labelText,
              align: 'center',
              baseline: 'top'
            } satisfies TextAttrs],
            styles: { ...textStyleFn(props), color: labelColour }
          })
        }
      })

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

export default fibonacciSpeedResistanceFan
