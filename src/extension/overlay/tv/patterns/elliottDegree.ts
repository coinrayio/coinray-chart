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
 * TradingView's Elliott wave "degree": which glyph style the wave labels use.
 * Ported from LineToolElliott.label() and ElliottLabelsPaneView. The 15
 * degrees (Supermillennium ... Minuscule) cycle through three decorations
 * (circled, bracketed, plain) and step through five label sets every three
 * degrees, with the glyph growing with the degree:
 *
 *   t = 14 - degree; set = floor(t / 3); decoration = [plain, (x), circled][t % 3]
 *
 * Reusable by any wave tool: give it the five label sets (TV alternates
 * upper and lower case) and it returns the text and metrics for a point.
 */

export const ELLIOTT_DEGREES = [
  'Supermillennium', 'Millennium', 'Submillennium', 'Grand Supercycle', 'Supercycle', 'Cycle', 'Primary',
  'Intermediate', 'Minor', 'Minute', 'Minuette', 'Subminuette', 'Micro', 'Submicro', 'Minuscule'
] as const

/** TV's default degree, `Intermediate`. */
export const DEFAULT_ELLIOTT_DEGREE = 7

/** Font and circle size in px, and boldness, per label set (TV's table). */
const SIZES = [
  { font: 11, circle: 14, bold: true },
  { font: 16, circle: 22, bold: false },
  { font: 18, circle: 22, bold: false },
  { font: 20, circle: 28, bold: false },
  { font: 24, circle: 36, bold: true }
]

/** A degree given as TV's index (0-14) or by name; anything else is the default. */
export function resolveDegree (value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < ELLIOTT_DEGREES.length) return value
  const named = ELLIOTT_DEGREES.findIndex((name) => name === value)
  return named >= 0 ? named : DEFAULT_ELLIOTT_DEGREE
}

export interface ElliottGlyph {
  text: string
  font: number
  circle: number
  bold: boolean
  circled: boolean
}

/** The label for `index` in a wave whose label sets are `sets` (5 arrays, TV order). */
export function elliottGlyph (sets: string[][], degree: number, index: number): ElliottGlyph {
  const t = ELLIOTT_DEGREES.length - degree - 1
  const set = Math.floor(t / 3)
  const decoration = t % 3
  const letter = sets[set][index]
  return { text: decoration === 1 ? `(${letter})` : letter, ...SIZES[set], circled: decoration === 2 }
}
