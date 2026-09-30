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
 * Shared by the annotations group: screen-anchored positioning (the anchored
 * text and note pin to a fraction of the pane, not to a bar and price) and the
 * rounded speech-bubble outline the balloon and the note tooltip both use.
 */

import type Coordinate from '../../../../common/Coordinate'
import type Bounding from '../../../../common/Bounding'
import type { OverlayTemplate } from '../../../../component/Overlay'

/** Where a screen-anchored overlay sits, as fractions (0..1) of the pane. */
export interface AnchorData {
  anchorX?: number
  anchorY?: number
}

export function readData (extendData: unknown): object {
  return extendData !== null && typeof extendData === 'object' ? extendData : {}
}

/** Pixel position of the anchor. Before the draw completes there are no
 *  fractions yet, so the overlay follows its (cursor-driven) point. */
export function anchorPixel (data: AnchorData, coordinates: Coordinate[], bounding: Bounding): Coordinate {
  if (data.anchorX === undefined || data.anchorY === undefined) return coordinates[0]
  return { x: data.anchorX * bounding.width, y: data.anchorY * bounding.height }
}

export function clamp01 (v: number): number {
  return Math.min(1, Math.max(0, v))
}

// Cursor-to-anchor offset per overlay id, taken at press so a drag doesn't jump.
const grabOffsets = new Map<string, Coordinate>()

type AnchoredHooks = Pick<OverlayTemplate, 'completeDrawing' | 'onPressedMoveStart' | 'onPressedMoving' | 'onPressedMoveEnd'>

/**
 * Hooks that make a template screen-anchored. The figures must carry
 * `noTranslate` so the engine leaves the point alone while dragging. The point
 * itself is kept only so the overlay survives save/restore and the engine's
 * bookkeeping; it is never drawn from.
 */
export const anchoredHooks: AnchoredHooks = {
  completeDrawing: ({ overlay, chart }) => {
    const data = (readData(overlay.extendData) as AnchorData)
    const size = chart.getSize(overlay.paneId, 'main')
    const at = chart.convertToPixel(overlay.points[0], { paneId: overlay.paneId }) as Partial<Coordinate>
    if (size === null || typeof at.x !== 'number' || typeof at.y !== 'number') return
    overlay.extendData = { ...data, anchorX: clamp01(at.x / size.width), anchorY: clamp01(at.y / size.height) }
  },
  onPressedMoveStart: ({ overlay, chart, x, y }) => {
    const size = chart.getSize(overlay.paneId, 'main')
    if (size === null || x === undefined || y === undefined) return
    const data = (readData(overlay.extendData) as AnchorData)
    grabOffsets.set(overlay.id, {
      x: (data.anchorX ?? 0) * size.width - x,
      y: (data.anchorY ?? 0) * size.height - y
    })
  },
  onPressedMoving: ({ overlay, chart, x, y }) => {
    const size = chart.getSize(overlay.paneId, 'main')
    const grab = grabOffsets.get(overlay.id)
    if (size === null || grab === undefined || x === undefined || y === undefined) return
    const data = (readData(overlay.extendData) as AnchorData)
    overlay.extendData = { ...data, anchorX: clamp01((x + grab.x) / size.width), anchorY: clamp01((y + grab.y) / size.height) }
  },
  onPressedMoveEnd: ({ overlay }) => {
    grabOffsets.delete(overlay.id)
  }
}

const ARC_STEPS = 6

/** Clockwise outline of a rounded rectangle. `tail` is a run of points on the
 *  bottom edge, ordered right to left, spliced in after the bottom-right corner. */
export function roundedBubble (left: number, top: number, width: number, height: number, radius: number, tail: Coordinate[] = []): Coordinate[] {
  const r = Math.min(radius, width / 2, height / 2)
  const out: Coordinate[] = []
  const arc = (cx: number, cy: number, from: number): void => {
    for (let i = 0; i <= ARC_STEPS; i++) {
      const a = (from + i / ARC_STEPS * 0.5) * Math.PI
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
  }
  arc(left + r, top + r, 1)
  arc(left + width - r, top + r, 1.5)
  arc(left + width - r, top + height - r, 0)
  out.push(...tail)
  arc(left + r, top + height - r, 0.5)
  return out
}

function quad (p0: Coordinate, c: Coordinate, p1: Coordinate, steps: number): Coordinate[] {
  const out: Coordinate[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y })
  }
  return out
}

export interface BalloonGeometry {
  left: number
  top: number
  width: number
  height: number
  outline: Coordinate[]
}

/** TV's balloon: a rounded label whose tail tip is the anchor point. Sizes and
 *  tail curve are TV's BalloonPaneView (radius 15, tail 9 high, apex 20px in
 *  from the text start, padding 15 by fontSize/1.3). */
export function balloonGeometry (anchor: Coordinate, textWidth: number, fontSize: number): BalloonGeometry {
  const height = fontSize + 2 * Math.round(fontSize / 1.3)
  const width = textWidth + 30
  const left = anchor.x - 35
  const top = anchor.y - height - 9
  const bottom = top + height
  const at = (dx: number, dy: number): Coordinate => ({ x: left + dx, y: bottom + dy })
  const tail = [
    at(33, 0),
    ...quad(at(33, 0), at(33, 4), at(35, 9), 4),
    ...quad(at(35, 9), at(27, 6), at(24, 0), 4)
  ]
  return { left, top, width, height, outline: roundedBubble(left, top, width, height, 15, tail) }
}
