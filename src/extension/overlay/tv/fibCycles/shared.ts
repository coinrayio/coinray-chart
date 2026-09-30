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
 * Helpers shared by the fibCycles group (fib time zones, trend-based fib time,
 * speed resistance arcs, fib wedge, cyclic lines, time cycles, sine line):
 * the per-id property store, TV's level defaults, bar-index maths and the
 * settings every tool reads off `extendData`.
 */

import type DeepPartial from '../../../../common/DeepPartial'
import type { LineStyle } from '../../../../common/Styles'
import { merge, clone } from '../../../../common/utils/typeChecks'
import type ChartImp from '../../../../Chart'
import type { OverlayProperties, FigureLevel } from '../../types'
import { fibOneColor, withAlpha } from '../../fibonacciShared'

// TV palette (its `color-*-500` tokens), named as the level tables read them.
export const GREY = '#787b86'
export const RED = '#f23645'
export const ORANGE = '#ff9800'
export const GREEN = '#4caf50'
export const LIGHT_GREEN = '#81c784'
export const TEAL = '#089981'
export const SKY = '#00bcd4'
export const BLUE = '#2962ff'
export const DEEP_BLUE = '#673ab7'
export const PINK = '#e91e63'
export const PURPLE = '#9c27b0'
export const TREND_GREY = '#808080'

export const level = (value: number, color: string, enabled = true): FigureLevel => ({ value, color, enabled })

export interface Figure { type: string, key?: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean, isCheckEvent?: boolean }

/** Per-overlay-id properties, the pattern every pro overlay uses. */
export function propertyStore (): {
  properties: Map<string, DeepPartial<OverlayProperties>>
  setProperties: (props: DeepPartial<OverlayProperties>, id: string) => void
  getProperties: (id: string) => DeepPartial<OverlayProperties>
  } {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()
  return {
    properties,
    setProperties: (props, id) => {
      const next = clone(properties.get(id) ?? {}) as Record<string, unknown>
      merge(next, props)
      properties.set(id, next as DeepPartial<OverlayProperties>)
    },
    getProperties: (id) => properties.get(id) ?? {}
  }
}

/** Bar index of an anchor. Restored points often carry only a timestamp. */
export function barIndex (chart: unknown, p: { timestamp?: number, dataIndex?: number }): number {
  const store = (chart as ChartImp).getChartStore()
  if (typeof p.timestamp === 'number') return store.timestampToDataIndex(p.timestamp)
  return p.dataIndex ?? 0
}

export interface Level { coeff: number, color: string, lineStyle?: LineStyle['style'], lineWidth?: number, lineDashedValue?: number[] }

/** The enabled levels: the user's list when they have one, else TV's defaults. */
export function enabledLevels (props: DeepPartial<OverlayProperties>, defaults: FigureLevel[], extendData?: unknown): Level[] {
  const own = (props.figureLevels ?? []) as FigureLevel[]
  const oneColor = fibOneColor(extendData)
  return (own.length > 0 ? own : defaults)
    .filter((l) => l.enabled)
    .map((l) => ({ coeff: l.value, color: oneColor ?? l.color ?? props.lineColor ?? GREY, lineStyle: l.lineStyle, lineWidth: l.lineWidth, lineDashedValue: l.lineDashedValue }))
}

export interface TrendDefaults { color: string, width: number, dashed: boolean }

export interface FibSettings {
  showLevels: boolean
  showBackground: boolean
  /** 0-100, the fill's alpha (TV's `transparency` inverted). */
  backgroundOpacity: number
  showTrend: boolean
  trend: Partial<LineStyle>
}

interface Ext {
  showLevels?: boolean
  showBackground?: boolean
  backgroundOpacity?: number
  showDiagonal?: boolean
  diagonalColor?: string
  diagonalWidth?: number
  diagonalStyle?: string
  diagonalDashedValue?: number[]
}

/** extendData → settings; `fill` is the tool's default for the background. */
export function fibSettings (extendData: unknown, fill: boolean, trend: TrendDefaults): FibSettings {
  const ext = (extendData ?? {}) as Ext
  const style = ext.diagonalStyle ?? (trend.dashed ? 'dashed' : 'solid')
  return {
    showLevels: ext.showLevels !== false,
    showBackground: ext.showBackground ?? fill,
    backgroundOpacity: ext.backgroundOpacity ?? 20,
    showTrend: ext.showDiagonal !== false,
    trend: {
      style: style as LineStyle['style'],
      size: ext.diagonalWidth ?? trend.width,
      color: ext.diagonalColor ?? trend.color,
      dashedValue: ext.diagonalDashedValue ?? [5, 2]
    }
  }
}

/** Level line style: the level's own, else the overlay's. */
export function levelLineStyle (props: DeepPartial<OverlayProperties>, l: Level): Partial<LineStyle> {
  return {
    style: l.lineStyle ?? props.lineStyle ?? 'solid',
    size: l.lineWidth ?? props.lineWidth ?? 2,
    color: l.color,
    dashedValue: l.lineDashedValue ?? props.lineDashedValue ?? [5, 2]
  }
}

export const fillStyle = (color: string, opacity: number): { style: 'fill', color: string } =>
  ({ style: 'fill', color: withAlpha(color, opacity / 100) })

/** One level label. `align` is the canvas alignment, i.e. which side of `x` the text runs to. */
export function label (key: string, x: number, y: number, text: string, color: string, size: number, align: CanvasTextAlign, baseline: CanvasTextBaseline): Figure {
  return {
    type: 'text',
    key,
    ignoreEvent: true,
    attrs: { x, y, text, align, baseline },
    styles: {
      color,
      size,
      family: 'Helvetica Neue',
      weight: 'normal',
      backgroundColor: 'transparent',
      borderSize: 0,
      borderColor: 'transparent',
      borderRadius: 0,
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 2,
      paddingBottom: 2
    }
  }
}

/** TV's `horzLabelsAlign`: the side of the anchor the text sits on. */
export const canvasAlign = (horz: string | undefined, fallback: CanvasTextAlign): CanvasTextAlign =>
  horz === 'left' ? 'right' : horz === 'right' ? 'left' : horz === 'center' ? 'center' : fallback

/**
 * Bar indexes `origin + k * step` (k >= 0, so only on the side `step` points
 * to) that fall inside [lo, hi]. Steps in whole bars, like TV.
 */
export function cycleIndices (origin: number, step: number, lo: number, hi: number): number[] {
  if (step === 0) return []
  const out: number[] = []
  const first = Math.max(0, Math.ceil(((step > 0 ? lo : hi) - origin) / step))
  for (let i = origin + first * step; i >= lo && i <= hi; i += step) out.push(i)
  return out
}

/** Points along an arc, clockwise on screen from `a0` to `a1` (radians). */
export function arcPoints (cx: number, cy: number, r: number, a0: number, a1: number, segments = 48): Array<{ x: number, y: number }> {
  const n = Math.max(2, Math.ceil(segments * Math.abs(a1 - a0) / Math.PI))
  const out: Array<{ x: number, y: number }> = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return out
}

/** The band between two radii over an angular span, as one polygon. */
export function bandPoints (cx: number, cy: number, inner: number, outer: number, a0: number, a1: number): Array<{ x: number, y: number }> {
  return [...arcPoints(cx, cy, outer, a0, a1), ...arcPoints(cx, cy, inner, a0, a1).reverse()]
}
