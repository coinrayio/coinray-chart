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
 * Pure pixel-space geometry for the TradingView-parity lines and shapes:
 * ellipse, arc, double curve, rotated rectangle, trend angle and the two
 * one-sided channels. Ported from TV's pane views, so the shapes match.
 */

import type Coordinate from '../../../../common/Coordinate'

const ELLIPSE_SAMPLES = 96
const ARC_SAMPLES = 64
const CURVE_SAMPLES = 32
/** TV's angle arc radius in px. */
export const ANGLE_ARC_RADIUS = 50

/** Distance from `p` to the infinite line through `a` and `b`. */
export function distanceToLine (a: Coordinate, b: Coordinate, p: Coordinate): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len
}

/** Unit vector `a` → `b` and its left normal (screen coordinates). */
function frame (a: Coordinate, b: Coordinate): { len: number, ux: number, uy: number, nx: number, ny: number } {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = len === 0 ? 1 : (b.x - a.x) / len
  const uy = len === 0 ? 0 : (b.y - a.y) / len
  return { len, ux, uy, nx: -uy, ny: ux }
}

/**
 * TV ellipse: `a`→`b` is the major axis (the ellipse is centred on its
 * midpoint); `c` only sets the semi-minor axis, as its distance to that line.
 * Null while `c` is on the axis, where TV draws just the line.
 */
export function ellipseCoordinates (a: Coordinate, b: Coordinate, c: Coordinate): Coordinate[] | null {
  const minor = distanceToLine(a, b, c)
  if (minor < 1) return null
  const { len, ux, uy, nx, ny } = frame(a, b)
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const out: Coordinate[] = []
  for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
    const t = (2 * Math.PI * i) / ELLIPSE_SAMPLES
    const major = (len / 2) * Math.cos(t)
    const semi = minor * Math.sin(t)
    out.push({ x: cx + ux * major + nx * semi, y: cy + uy * major + ny * semi })
  }
  return out
}

/**
 * TV arc: a 60 degree circular arc on the chord `a`→`b`, stretched
 * perpendicular to the chord so its height equals `c`'s distance to the chord,
 * bulging toward `c`. Null while `c` is on the chord.
 */
export function arcCoordinates (a: Coordinate, b: Coordinate, c: Coordinate): Coordinate[] | null {
  const height = distanceToLine(a, b, c)
  if (height < 1) return null
  const { len, ux, uy, nx, ny } = frame(a, b)
  const side = (c.x - a.x) * nx + (c.y - a.y) * ny < 0 ? -1 : 1
  const sagitta = len * (1 - Math.sqrt(3) / 2)
  const stretch = height / sagitta
  const out: Coordinate[] = []
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const theta = Math.PI / 3 + ((Math.PI / 3) * i) / ARC_SAMPLES
    const along = len / 2 + len * Math.cos(theta)
    const rise = (len * Math.sin(theta) - (len * Math.sqrt(3)) / 2) * stretch * side
    out.push({ x: a.x + ux * along + nx * rise, y: a.y + uy * along + ny * rise })
  }
  return out
}

/**
 * TV rotated rectangle: `a`→`b` is the centre axis of one pair of sides and
 * `c`'s distance to it is the half-width, so the corners stay right angles
 * on screen. Null while `c` is on the axis.
 */
export function rotatedRectangleCorners (a: Coordinate, b: Coordinate, c: Coordinate): Coordinate[] | null {
  const half = distanceToLine(a, b, c)
  if (half === 0) return null
  const { nx, ny } = frame(a, b)
  const tx = nx * half
  const ty = ny * half
  return [
    { x: a.x + tx, y: a.y + ty }, { x: b.x + tx, y: b.y + ty },
    { x: b.x - tx, y: b.y - ty }, { x: a.x - tx, y: a.y - ty }
  ]
}

/**
 * The two control points TV gives a new double curve: a third and two thirds
 * along the chord, pushed off it in opposite directions by 0.15 of its length,
 * so a fresh curve is an S.
 */
export function doubleCurveHandles (a: Coordinate, b: Coordinate): [Coordinate, Coordinate] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const ox = -dy * 0.15
  const oy = dx * 0.15
  return [
    { x: a.x + dx * 0.33 + ox, y: a.y + dy * 0.33 + oy },
    { x: a.x + dx * 0.67 - ox, y: a.y + dy * 0.67 - oy }
  ]
}

function sampleQuadratic (p0: Coordinate, control: Coordinate, p1: Coordinate, into: Coordinate[]): void {
  for (let i = 1; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES
    const u = 1 - t
    into.push({ x: u * u * p0.x + 2 * u * t * control.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * control.y + t * t * p1.y })
  }
}

function sampleCubic (p0: Coordinate, c0: Coordinate, c1: Coordinate, p1: Coordinate, into: Coordinate[]): void {
  for (let i = 1; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES
    const u = 1 - t
    const w0 = u * u * u
    const w1 = 3 * u * u * t
    const w2 = 3 * u * t * t
    const w3 = t * t * t
    into.push({ x: w0 * p0.x + w1 * c0.x + w2 * c1.x + w3 * p1.x, y: w0 * p0.y + w1 * c0.y + w2 * c1.y + w3 * p1.y })
  }
}

/**
 * TV double curve: `start` → `m1` → `m2` → `end`, i.e. a quadratic, a cubic
 * and a quadratic segment meeting at the two handles. Control points are TV's:
 * ¼ of the (m2 - start) chord either side of m1, ¼ of (end - m1) either side of m2.
 */
export function doubleCurveCoordinates (start: Coordinate, end: Coordinate, m1: Coordinate, m2: Coordinate): Coordinate[] {
  const chordX = m2.x - start.x
  const chordY = m2.y - start.y
  const tailX = end.x - m1.x
  const tailY = end.y - m1.y
  const out: Coordinate[] = [start]
  sampleQuadratic(start, { x: m1.x - chordX / 4, y: m1.y - chordY / 4 }, m1, out)
  sampleCubic(m1, { x: m1.x + chordX / 4, y: m1.y + chordY / 4 }, { x: m2.x - tailX / 4, y: m2.y - tailY / 4 }, m2, out)
  sampleQuadratic(m2, { x: m2.x + tailX / 4, y: m2.y + tailY / 4 }, end, out)
  return out
}

/** Screen angle of `a`→`b` in radians, counter-clockwise from the +x axis (y up). */
export function trendAngle (a: Coordinate, b: Coordinate): number {
  return Math.atan2(-(b.y - a.y), b.x - a.x)
}

/** Dotted arc TV draws at the anchor: from the +x axis to the line, radius `ANGLE_ARC_RADIUS`. */
export function angleArcCoordinates (origin: Coordinate, angle: number): Coordinate[] {
  const out: Coordinate[] = []
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const phi = (-angle * i) / ARC_SAMPLES
    out.push({ x: origin.x + ANGLE_ARC_RADIUS * Math.cos(phi), y: origin.y + ANGLE_ARC_RADIUS * Math.sin(phi) })
  }
  return out
}

/** Point on the line through `a`→`b` at `x`; a vertical line keeps `a`. */
export function atX (a: Coordinate, b: Coordinate, x: number): Coordinate {
  if (b.x === a.x) return { x, y: a.y }
  return { x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) }
}
