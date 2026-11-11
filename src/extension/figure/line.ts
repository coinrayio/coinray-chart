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

import type Nullable from '../../common/Nullable'
import type Coordinate from '../../common/Coordinate'
import type { SmoothLineStyle } from '../../common/Styles'

import { type FigureTemplate, DEVIATION, isHitAreaDebug } from '../../component/Figure'
import { isNumber } from '../../common/utils/typeChecks'

export function checkCoordinateOnLine (coordinate: Coordinate, attrs: LineAttrs | LineAttrs[]): boolean {
  let lines: LineAttrs[] = []
  lines = lines.concat(attrs)

  for (const line of lines) {
    const { coordinates } = line
    if (coordinates.length > 1) {
      for (let i = 1; i < coordinates.length; i++) {
        const prevCoordinate = coordinates[i - 1]
        const currentCoordinate = coordinates[i]
        if (prevCoordinate.x === currentCoordinate.x) {
          if (
            Math.abs(prevCoordinate.y - coordinate.y) + Math.abs(currentCoordinate.y - coordinate.y) - Math.abs(prevCoordinate.y - currentCoordinate.y) < DEVIATION + DEVIATION &&
            Math.abs(coordinate.x - prevCoordinate.x) < DEVIATION
          ) {
            return true
          }
        } else {
          const kb = getLinearSlopeIntercept(prevCoordinate, currentCoordinate)!
          const y = getLinearYFromSlopeIntercept(kb, coordinate)
          const yDif = Math.abs(y - coordinate.y)
          if (
            Math.abs(prevCoordinate.x - coordinate.x) + Math.abs(currentCoordinate.x - coordinate.x) - Math.abs(prevCoordinate.x - currentCoordinate.x) < DEVIATION + DEVIATION &&
            yDif * yDif / (kb[0] * kb[0] + 1) < DEVIATION * DEVIATION
          ) {
            return true
          }
        }
      }
    }
  }
  return false
}

export function getLinearYFromSlopeIntercept (kb: Nullable<number[]>, coordinate: Coordinate): number {
  if (kb !== null) {
    return coordinate.x * kb[0] + kb[1]
  }
  return coordinate.y
}

/**
 * 获取点在两点决定的一次函数上的y值
 * @param coordinate1
 * @param coordinate2
 * @param targetCoordinate
 */
export function getLinearYFromCoordinates (coordinate1: Coordinate, coordinate2: Coordinate, targetCoordinate: Coordinate): number {
  const kb = getLinearSlopeIntercept(coordinate1, coordinate2)
  return getLinearYFromSlopeIntercept(kb, targetCoordinate)
}

export function getLinearSlopeIntercept (coordinate1: Coordinate, coordinate2: Coordinate): Nullable<number[]> {
  const difX = coordinate1.x - coordinate2.x
  if (difX !== 0) {
    const k = (coordinate1.y - coordinate2.y) / difX
    const b = coordinate1.y - k * coordinate1.x
    return [k, b]
  }
  return null
}

export function lineTo (ctx: CanvasRenderingContext2D, coordinates: Coordinate[], smooth: number | boolean): void {
  const length = coordinates.length
  const smoothParam = isNumber(smooth) ? (smooth > 0 && smooth < 1 ? smooth : 0) : (smooth ? 0.5 : 0)
  if ((smoothParam > 0) && length > 2) {
    let cpx0 = coordinates[0].x
    let cpy0 = coordinates[0].y
    for (let i = 1; i < length - 1; i++) {
      const prevCoordinate = coordinates[i - 1]
      const coordinate = coordinates[i]
      const nextCoordinate = coordinates[i + 1]
      const dx01 = coordinate.x - prevCoordinate.x
      const dy01 = coordinate.y - prevCoordinate.y
      const dx12 = nextCoordinate.x - coordinate.x
      const dy12 = nextCoordinate.y - coordinate.y
      let dx02 = nextCoordinate.x - prevCoordinate.x
      let dy02 = nextCoordinate.y - prevCoordinate.y
      const prevSegmentLength = Math.sqrt(dx01 * dx01 + dy01 * dy01)
      const nextSegmentLength = Math.sqrt(dx12 * dx12 + dy12 * dy12)
      const segmentLengthRatio = nextSegmentLength / (nextSegmentLength + prevSegmentLength)

      let nextCpx = coordinate.x + dx02 * smoothParam * segmentLengthRatio
      let nextCpy = coordinate.y + dy02 * smoothParam * segmentLengthRatio
      nextCpx = Math.min(nextCpx, Math.max(nextCoordinate.x, coordinate.x))
      nextCpy = Math.min(nextCpy, Math.max(nextCoordinate.y, coordinate.y))
      nextCpx = Math.max(nextCpx, Math.min(nextCoordinate.x, coordinate.x))
      nextCpy = Math.max(nextCpy, Math.min(nextCoordinate.y, coordinate.y))

      dx02 = nextCpx - coordinate.x
      dy02 = nextCpy - coordinate.y

      let cpx1 = coordinate.x - dx02 * prevSegmentLength / nextSegmentLength
      let cpy1 = coordinate.y - dy02 * prevSegmentLength / nextSegmentLength

      cpx1 = Math.min(cpx1, Math.max(prevCoordinate.x, coordinate.x))
      cpy1 = Math.min(cpy1, Math.max(prevCoordinate.y, coordinate.y))
      cpx1 = Math.max(cpx1, Math.min(prevCoordinate.x, coordinate.x))
      cpy1 = Math.max(cpy1, Math.min(prevCoordinate.y, coordinate.y))

      dx02 = coordinate.x - cpx1
      dy02 = coordinate.y - cpy1
      nextCpx = coordinate.x + dx02 * nextSegmentLength / prevSegmentLength
      nextCpy = coordinate.y + dy02 * nextSegmentLength / prevSegmentLength

      ctx.bezierCurveTo(cpx0, cpy0, cpx1, cpy1, coordinate.x, coordinate.y)

      cpx0 = nextCpx
      cpy0 = nextCpy
    }
    const lastCoordinate = coordinates[length - 1]
    ctx.bezierCurveTo(cpx0, cpy0, lastCoordinate.x, lastCoordinate.y, lastCoordinate.x, lastCoordinate.y)
  } else {
    for (let i = 1; i < length; i++) {
      ctx.lineTo(coordinates[i].x, coordinates[i].y)
    }
  }
}

/**
 * Paints the grab band around each line — a flat translucent stroke as wide as
 * the hit test is tolerant. Debug only; `setHitAreaDebug` gates it.
 */
function drawLineHitArea (ctx: CanvasRenderingContext2D, lines: LineAttrs[], smooth: SmoothLineStyle['smooth']): void {
  ctx.save()
  ctx.lineWidth = DEVIATION * 2
  ctx.strokeStyle = 'rgba(21, 93, 252, 0.22)'
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  lines.forEach(({ coordinates }) => {
    if (coordinates.length > 1) {
      ctx.beginPath()
      ctx.moveTo(coordinates[0].x, coordinates[0].y)
      lineTo(ctx, coordinates, smooth)
      ctx.stroke()
      ctx.closePath()
    }
  })
  ctx.restore()
}

/**
 * The canvas's scale per axis: how many backing pixels one CSS pixel covers.
 * Read from the context rather than `devicePixelRatio`, because the backing
 * store is rounded per axis (a pane 1012 CSS px tall at ratio 2.2 is 2226
 * device px, not 2226.4), and that rounding is what the pixels really follow.
 */
function canvasScale (ctx: CanvasRenderingContext2D): { x: number, y: number } {
  const t = typeof ctx.getTransform === 'function' ? ctx.getTransform() : undefined
  const x = typeof t?.a === 'number' && t.a > 0 ? t.a : 1
  const y = typeof t?.d === 'number' && t.d > 0 ? t.d : 1
  return { x, y }
}

/**
 * Where to stroke a horizontal or vertical line of `size` CSS px drawn at
 * `at`, and how wide, so it covers whole device pixels. Half a CSS pixel only
 * lands on the grid when the ratio is a whole number: at 110% zoom on a 2x
 * screen (2.2) a 1px grid line spread over three device rows and the chart
 * looked blurry. The width rounds to whole device pixels (at least one), and
 * the line starts on the pixel nearest where the old half-pixel rule put it,
 * so on whole ratios with whole coordinates nothing moves.
 */
function snapAxisLine (at: number, size: number, ratio: number): { at: number, width: number } {
  const devWidth = Math.max(1, Math.round(size * ratio))
  const centre = at + (size % 2 === 1 ? 0.5 : 0)
  const start = Math.round(centre * ratio - devWidth / 2)
  return { at: (start + devWidth / 2) / ratio, width: devWidth / ratio }
}

export function drawLine (ctx: CanvasRenderingContext2D, attrs: LineAttrs | LineAttrs[], styles: Partial<SmoothLineStyle> & { lineCap?: CanvasLineCap, lineJoin?: CanvasLineJoin }): void {
  let lines: LineAttrs[] = []
  lines = lines.concat(attrs)
  const { style = 'solid', smooth = false, size = 1, color = 'currentColor', dashedValue = [2, 2], lineCap, lineJoin } = styles
  if (isHitAreaDebug()) {
    drawLineHitArea(ctx, lines, smooth)
  }
  ctx.lineWidth = size
  ctx.strokeStyle = color
  // Use explicit lineCap/lineJoin if provided, otherwise default based on smooth
  if (lineCap !== undefined) {
    ctx.lineCap = lineCap
  } else if (smooth !== false && smooth !== 0) {
    ctx.lineCap = 'round'
  } else {
    ctx.lineCap = 'butt'
  }
  if (lineJoin !== undefined) {
    ctx.lineJoin = lineJoin
  } else if (smooth !== false && smooth !== 0) {
    ctx.lineJoin = 'round'
  } else {
    ctx.lineJoin = 'miter'
  }
  if (style === 'dashed') {
    ctx.setLineDash(dashedValue)
  } else {
    ctx.setLineDash([])
  }
  let scale: { x: number, y: number } | null = null
  lines.forEach(({ coordinates }) => {
    if (coordinates.length > 1) {
      if (
        coordinates.length === 2 &&
        (
          coordinates[0].x === coordinates[1].x ||
          coordinates[0].y === coordinates[1].y
        )
      ) {
        scale ??= canvasScale(ctx)
        ctx.beginPath()
        if (coordinates[0].x === coordinates[1].x) {
          const snap = snapAxisLine(coordinates[0].x, size, scale.x)
          ctx.lineWidth = snap.width
          ctx.moveTo(snap.at, coordinates[0].y)
          ctx.lineTo(snap.at, coordinates[1].y)
        } else {
          const snap = snapAxisLine(coordinates[0].y, size, scale.y)
          ctx.lineWidth = snap.width
          ctx.moveTo(coordinates[0].x, snap.at)
          ctx.lineTo(coordinates[1].x, snap.at)
        }
        ctx.stroke()
        ctx.closePath()
        ctx.lineWidth = size
      } else {
        ctx.save()
        if (size % 2 === 1) {
          ctx.translate(0.5, 0.5)
        }
        ctx.beginPath()
        ctx.moveTo(coordinates[0].x, coordinates[0].y)
        lineTo(ctx, coordinates, smooth)
        ctx.stroke()
        ctx.closePath()
        ctx.restore()
      }
    }
  })
  // The dash is context state, so it outlives this call: a custom indicator
  // drawn next stroked every line dashed until it reset it (Superchart
  // ALT-6, where a cross marker lost its centre to the gap).
  if (style === 'dashed') ctx.setLineDash([])
}

export interface LineAttrs {
  /** Optional key for per-figure styling via overlay.figureStyles */
  key?: string
  coordinates: Coordinate[]
}

const line: FigureTemplate<LineAttrs | LineAttrs[], Partial<SmoothLineStyle>> = {
  name: 'line',
  checkEventOn: checkCoordinateOnLine,
  draw: (ctx: CanvasRenderingContext2D, attrs: LineAttrs | LineAttrs[], styles: Partial<SmoothLineStyle>) => {
    drawLine(ctx, attrs, styles)
  }
}

export default line
