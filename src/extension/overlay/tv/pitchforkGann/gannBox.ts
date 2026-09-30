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
 * TradingView's "Gann Box" (LineToolGannSquare), as `tvGannBox`. Not the older
 * `gannBox` overlay, which draws fixed diagonals.
 *
 * Two points span a box. Price levels are horizontal lines at `coeff` of the
 * box height, time levels vertical lines at `coeff` of its width, each with its
 * own colour and an optional coeff label on the box's edges. Bands between
 * neighbouring visible levels are filled, and Fans draw, from each box corner,
 * a line to every level coordinate on the opposite edges. Reverse counts the
 * levels from the second point instead of the first (mirrors TV's
 * GannSquarePaneView).
 *
 * Not drawn: the two extra corner anchors, and the time levels' snap to a bar.
 *
 * extendData (all optional, TV's defaults): `{ hLevels, vLevels: { value,
 * color, visible }[], fans, fanColor, showTopLabels, showBottomLabels,
 * showLeftLabels, showRightLabels, fillHorz, horzOpacity, fillVert,
 * vertOpacity, reverse }`. properties.figureLevels, when set, overrides the
 * value, colour and visibility of those rows by position: the 7 price levels,
 * then the 7 time levels.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { LineStyle } from '../../../../common/Styles'
import type { OverlayTemplate } from '../../../../component/Overlay'
import type { ProOverlayTemplate, OverlayProperties } from '../../types'
import type DeepPartial from '../../../../common/DeepPartial'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'
import { fibOneColor, withAlpha } from '../../fibonacciShared'
import { propertyStore } from './shared'

export interface GannBoxLevel { value: number, color: string, visible: boolean }

const row = (value: number, color: string): GannBoxLevel => ({ value, color, visible: true })
const GREY = '#787b86'
const LEVELS: GannBoxLevel[] = [
  row(0, GREY), row(0.25, '#ff9800'), row(0.382, '#00bcd4'), row(0.5, '#4caf50'),
  row(0.618, '#089981'), row(0.75, '#3179f5'), row(1, GREY)
]
export const GANN_BOX_LEVELS: GannBoxLevel[] = LEVELS
const FAN_COLOR = '#9598a1'

interface GannBoxExtendData {
  hLevels?: GannBoxLevel[]
  vLevels?: GannBoxLevel[]
  fans?: boolean
  fanColor?: string
  showTopLabels?: boolean
  showBottomLabels?: boolean
  showLeftLabels?: boolean
  showRightLabels?: boolean
  fillHorz?: boolean
  horzOpacity?: number
  fillVert?: boolean
  vertOpacity?: number
  reverse?: boolean
}

/** `base` with the rows `custom` holds from `offset` laid over it. */
export function applyLevelOverrides (base: GannBoxLevel[], custom: DeepPartial<OverlayProperties>['figureLevels'], offset: number): GannBoxLevel[] {
  if (custom === undefined || custom.length === 0) return base
  return base.map((r, i) => {
    const c = custom.at(offset + i)
    return c === undefined ? r : { value: c.value ?? r.value, color: c.color ?? r.color, visible: c.enabled ?? r.visible }
  })
}

/** Where level `coeff` sits between `a` and `b`; Reverse measures from `b`. */
export const levelAt = (a: number, b: number, coeff: number, reverse: boolean): number =>
  reverse ? b + coeff * (a - b) : a + coeff * (b - a)

export const formatCoeff = (v: number): string => String(Math.round(v * 1e6) / 1e6)

const gannBox = (): ProOverlayTemplate => {
  const store = propertyStore()

  return {
    name: 'tvGannBox',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []
      const props = store.get(overlay.id)
      const ext = (overlay.extendData ?? {}) as GannBoxExtendData
      const reverse = ext.reverse === true
      const [p0, p1] = coordinates
      const left = Math.min(p0.x, p1.x)
      const right = Math.max(p0.x, p1.x)
      const top = Math.min(p0.y, p1.y)
      const bottom = Math.max(p0.y, p1.y)
      const style: Partial<LineStyle> = {
        style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
        size: props.lineWidth ?? 2,
        dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
      }
      const hAll = applyLevelOverrides(ext.hLevels ?? LEVELS, props.figureLevels, 0)
      const vAll = applyLevelOverrides(ext.vLevels ?? LEVELS, props.figureLevels, 7)
      const oneColor = fibOneColor(overlay.extendData)
      const hs = hAll.filter((l) => l.visible).map((l) => ({ ...l, color: oneColor ?? l.color, pos: levelAt(p0.y, p1.y, l.value, reverse) }))
      const vs = vAll.filter((l) => l.visible).map((l) => ({ ...l, color: oneColor ?? l.color, pos: levelAt(p0.x, p1.x, l.value, reverse) }))
      const figures: Array<{ type: string, key: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }> = []
      const label = (key: string, x: number, y: number, text: string, color: string, align: string, baseline: string): void => {
        figures.push({ type: 'text', key, ignoreEvent: true, attrs: { x, y, text, align, baseline }, styles: { color, size: 12, backgroundColor: 'transparent', borderSize: 0 } })
      }

      // Fills first, so the lines sit on top.
      if (ext.fillHorz !== false) {
        const a = (ext.horzOpacity ?? 20) / 100
        hs.forEach((l, i) => {
          if (i === 0) return
          figures.push({ type: 'polygon', key: `hFill_${i}`, ignoreEvent: true, attrs: { coordinates: [{ x: left, y: l.pos }, { x: right, y: l.pos }, { x: right, y: hs[i - 1].pos }, { x: left, y: hs[i - 1].pos }] }, styles: { style: 'fill', color: withAlpha(l.color, a) } })
        })
      }
      if (ext.fillVert !== false) {
        const a = (ext.vertOpacity ?? 20) / 100
        vs.forEach((l, i) => {
          if (i === 0) return
          figures.push({ type: 'polygon', key: `vFill_${i}`, ignoreEvent: true, attrs: { coordinates: [{ x: l.pos, y: top }, { x: l.pos, y: bottom }, { x: vs[i - 1].pos, y: bottom }, { x: vs[i - 1].pos, y: top }] }, styles: { style: 'fill', color: withAlpha(l.color, a) } })
        })
      }
      hs.forEach((l, i) => {
        figures.push({ type: 'line', key: `h_${i}`, attrs: { coordinates: [{ x: left, y: l.pos }, { x: right, y: l.pos }] }, styles: { ...style, color: l.color } })
        const text = formatCoeff(l.value)
        if (ext.showLeftLabels !== false) label(`hl_${i}`, left - 5, l.pos, text, l.color, 'right', 'middle')
        if (ext.showRightLabels !== false) label(`hr_${i}`, right + 5, l.pos, text, l.color, 'left', 'middle')
      })
      vs.forEach((l, i) => {
        figures.push({ type: 'line', key: `v_${i}`, attrs: { coordinates: [{ x: l.pos, y: top }, { x: l.pos, y: bottom }] }, styles: { ...style, color: l.color } })
        const text = formatCoeff(l.value)
        if (ext.showTopLabels !== false) label(`vt_${i}`, l.pos, top - 3, text, l.color, 'center', 'bottom')
        if (ext.showBottomLabels !== false) label(`vb_${i}`, l.pos, bottom + 5, text, l.color, 'center', 'top')
      })
      if (ext.fans === true) {
        const fanStyle = { ...style, color: ext.fanColor ?? FAN_COLOR }
        const tl: Coordinate = { x: left, y: top }
        const tr: Coordinate = { x: right, y: top }
        const bl: Coordinate = { x: left, y: bottom }
        const br: Coordinate = { x: right, y: bottom }
        const fan = (key: string, a: Coordinate, b: Coordinate): void => {
          figures.push({ type: 'line', key, attrs: { coordinates: [a, b] }, styles: fanStyle })
        }
        // TV pairs the i-th price level's coeff with a time fan and the i-th
        // time level's coeff with a price fan, hidden levels included.
        hAll.forEach((l, i) => {
          const x = levelAt(p0.x, p1.x, l.value, reverse)
          const at = (y: number): Coordinate => ({ x, y })
          fan(`fx_${i}_0`, bl, at(top)); fan(`fx_${i}_1`, br, at(top)); fan(`fx_${i}_2`, tl, at(bottom)); fan(`fx_${i}_3`, tr, at(bottom))
        })
        vAll.forEach((l, i) => {
          const y = levelAt(p0.y, p1.y, l.value, reverse)
          fan(`fy_${i}_0`, bl, { x: right, y }); fan(`fy_${i}_1`, br, { x: left, y }); fan(`fy_${i}_2`, tl, { x: right, y }); fan(`fy_${i}_3`, tr, { x: left, y })
        })
      }
      return figures
    },
    setProperties: store.setProperties,
    getProperties: store.get
  }
}

export const gannBoxFactories: Array<() => OverlayTemplate> = [gannBox]
