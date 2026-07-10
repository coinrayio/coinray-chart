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
import type { LineStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'

import type { OverlayProperties, FigureLevel, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'

import type { LineAttrs } from '../figure/line'
import type { TextAttrs } from '../figure/text'

import { getRayLine } from './utils'
import { buildDiagonal, formatFibRatio, resolveFibSettings } from './fibonacciShared'

export const FIBONACCI_FAN_LEVELS: FigureLevel[] = [
  { value: 0, enabled: true },
  { value: 0.25, enabled: true },
  { value: 0.382, enabled: true },
  { value: 0.5, enabled: true },
  { value: 0.618, enabled: true },
  { value: 0.75, enabled: true },
  { value: 1, enabled: true }
]

const fibonacciSpeedResistanceFan = (): ProOverlayTemplate => {
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
    // ALTD-1894 — pass fontStyle through so Italic actually
    // leans the labels.
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
      const lines1: LineAttrs[] = []
      const lines2: LineAttrs[] = []
      const texts: TextAttrs[] = []
      if (coordinates.length <= 1) return []

      const settings = resolveFibSettings(overlay.extendData)

      // Reverse swaps origin ↔ extent semantically. `origin`
      // is where the fan rays emanate from; `extent` defines
      // the far corner of the fan grid.
      const origin = settings.reverse ? coordinates[1] : coordinates[0]
      const extent = settings.reverse ? coordinates[0] : coordinates[1]

      const xOffset = extent.x > origin.x ? -38 : 4
      const yOffset = extent.y > origin.y ? -2 : 20
      const xDistance = extent.x - origin.x
      const yDistance = extent.y - origin.y
      const levels = ((props.figureLevels?.length ?? 0) > 0 ? props.figureLevels! : FIBONACCI_FAN_LEVELS)
        .filter(l => l.enabled === true)

      levels.forEach(level => {
        const percent = level.value ?? 0
        // Per TV / spec: X_target(k) = X_origin + ΔX·k, so
        // k = 0 lands at the origin anchor and k = 1 lands at
        // the extent anchor. The previous impl was inverted
        // (percent 0 at extent, 1 at origin) — visually the
        // 0.618 label was sitting on the origin side instead
        // of the fib-golden side.
        const x = origin.x + xDistance * percent
        const y = origin.y + yDistance * percent
        const levelKey = `fan_${percent}`
        lines1.push({ key: `${levelKey}_grid_x`, coordinates: [{ x, y: origin.y }, { x, y: extent.y }] })
        lines1.push({ key: `${levelKey}_grid_y`, coordinates: [{ x: origin.x, y }, { x: extent.x, y }] })
        const rayLine1 = getRayLine([origin, { x, y: extent.y }], bounding)
        const rayLine2 = getRayLine([origin, { x: extent.x, y }], bounding)
        const rays1 = Array.isArray(rayLine1) ? rayLine1 : [rayLine1]
        const rays2 = Array.isArray(rayLine2) ? rayLine2 : [rayLine2]
        rays1.forEach((r, i) => { if ('coordinates' in r) lines2.push({ ...r, key: `${levelKey}_ray_x_${i}` }) })
        rays2.forEach((r, i) => { if ('coordinates' in r) lines2.push({ ...r, key: `${levelKey}_ray_y_${i}` }) })

        // Labels — only when the master `showText` is on AND
        // `showLevels` (the fan has no separate price labels;
        // Prices toggle is a no-op here). `levelFormat`
        // switches between decimal (0.618) and percent (61.8 %).
        if (settings.showText && settings.showLevels) {
          const label = formatFibRatio(percent, settings.levelFormat)
          texts.unshift({
            key: `${levelKey}_text_y`,
            x: origin.x + xOffset,
            y: y + 10,
            text: label
          })
          texts.unshift({
            key: `${levelKey}_text_x`,
            x: x - 18,
            y: origin.y + yOffset,
            text: label
          })
        }
      })

      const figures: Array<{ type: string, key?: string, ignoreEvent?: boolean, isCheckEvent?: boolean, attrs: unknown, styles?: Partial<LineStyle> | Partial<TextStyle> }> = [
        {
          type: 'line',
          attrs: lines1,
          styles: fbLinesStyle(props)
        },
        {
          type: 'line',
          attrs: lines2,
          styles: fbLinesStyle(props)
        },
        {
          type: 'text',
          isCheckEvent: false,
          attrs: texts,
          styles: textStyleFn(props)
        }
      ]

      // Diagonal — the origin → extent leg, styled
      // independently from the level lines via the Trend Line
      // row's own colour picker. Defaults to ON per ALTD-1894.
      const diagonal = buildDiagonal(origin, extent, settings)
      if (diagonal !== null) {
        // Cast to the local figure-list shape; buildDiagonal
        // returns a compatible FibFigureSpec whose fields are
        // a superset.
        figures.push({
          type: diagonal.type,
          key: diagonal.key,
          attrs: diagonal.attrs,
          styles: diagonal.styles as Partial<LineStyle> | undefined
        })
      }

      // Default diagonal color should read from extendData;
      // when the user hasn't picked a Trend Line color yet we
      // fall back to the engine constant (NOT props.lineColor)
      // so a general Line row change never bleeds into the
      // Trend Line. `buildDiagonal` already implements that
      // fallback.
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

// Referencing DEFAULT_OVERLAY_PROPERTIES here silences the
// "unused import" lint — the constant flows through buildDiagonal
// for the diagonal fallbacks, which we didn't inline.
void DEFAULT_OVERLAY_PROPERTIES

export default fibonacciSpeedResistanceFan
