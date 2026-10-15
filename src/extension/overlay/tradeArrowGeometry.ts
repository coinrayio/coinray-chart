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
 * Wide trade-arrow glyph — pure point geometry.
 *
 * Single source of truth for the "wide" arrow shape (triangular head +
 * rectangular body) drawn by `tradeLine.ts` (via `wideArrowOutline`) and, outside
 * this package, by the Superchart script-marker glyph
 * (`src/lib/extension/tradeArrowGeometry.ts`), which imports
 * `wideArrowGeometry` from `klinecharts` rather than duplicating the numbers.
 *
 * The tip is anchored at `(x, tipY)`; the body extends away from the tip —
 * downward for `direction: 'up'`, upward for `direction: 'down'`. `scale`
 * multiplies every dimension uniformly (1 == this module's base size).
 */

import type Coordinate from '../../common/Coordinate'

export type WideArrowDirection = 'up' | 'down'

export interface WideArrowGeometry {
  head: Coordinate[]
  body: Coordinate[]
}

// Base geometry at scale 1
export const BASE_BODY_W = 10
export const BASE_BODY_H = 12
export const BASE_HEAD_W = 20
export const BASE_HEAD_H = 10

/** The same arrow as one closed outline (tip first), so a border goes round
 *  the whole glyph instead of also drawing the seam between head and body. */
export function wideArrowOutline (
  x: number,
  tipY: number,
  direction: WideArrowDirection,
  scale = 1
): Coordinate[] {
  const { head, body } = wideArrowGeometry(x, tipY, direction, scale)
  // Head: tip, left base, right base. Body corners: near edge first for 'up'
  // (left near, right near, right far, left far), far edge first for 'down'.
  const [nearL, nearR, farR, farL] = direction === 'up'
    ? [body[0], body[1], body[2], body[3]]
    : [body[3], body[2], body[1], body[0]]
  return [head[0], head[2], nearR, farR, farL, nearL, head[1]]
}

export function wideArrowGeometry (
  x: number,
  tipY: number,
  direction: WideArrowDirection,
  scale = 1
): WideArrowGeometry {
  const bodyW = BASE_BODY_W * scale
  const bodyH = BASE_BODY_H * scale
  const headW = BASE_HEAD_W * scale
  const headH = BASE_HEAD_H * scale
  const halfBodyW = bodyW / 2
  const halfHeadW = headW / 2

  if (direction === 'up') {
    const headBase = tipY + headH
    return {
      head: [
        { x, y: tipY },
        { x: x - halfHeadW, y: headBase },
        { x: x + halfHeadW, y: headBase }
      ],
      body: [
        { x: x - halfBodyW, y: headBase },
        { x: x + halfBodyW, y: headBase },
        { x: x + halfBodyW, y: headBase + bodyH },
        { x: x - halfBodyW, y: headBase + bodyH }
      ]
    }
  }

  const headBase = tipY - headH
  return {
    head: [
      { x, y: tipY },
      { x: x - halfHeadW, y: headBase },
      { x: x + halfHeadW, y: headBase }
    ],
    body: [
      { x: x - halfBodyW, y: headBase - bodyH },
      { x: x + halfBodyW, y: headBase - bodyH },
      { x: x + halfBodyW, y: headBase },
      { x: x - halfBodyW, y: headBase }
    ]
  }
}
