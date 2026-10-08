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

import { formatTimestampToDateTime } from './utils/format'

/**
 * How significant the time boundary a bar opens is. A bar that starts a new
 * year outranks one that starts a month, which outranks a day, then 12h, 6h
 * and so on down to the second. The time axis labels the heaviest boundaries
 * that fit, the way TradingView does: `2026`, `Oct`, `8`, `14:00`.
 */
export const TimeMarkWeight = {
  None: 0,
  Second1: 10,
  Second5: 11,
  Second15: 12,
  Second30: 13,
  Minute1: 20,
  Minute5: 21,
  Minute15: 22,
  Minute30: 23,
  Hour1: 30,
  Hour3: 31,
  Hour6: 32,
  Hour12: 33,
  Day: 50,
  Month: 60,
  Year: 70
} as const

const SECOND_STEPS: Array<[number, number]> = [
  [12 * 3600, TimeMarkWeight.Hour12],
  [6 * 3600, TimeMarkWeight.Hour6],
  [3 * 3600, TimeMarkWeight.Hour3],
  [3600, TimeMarkWeight.Hour1],
  [1800, TimeMarkWeight.Minute30],
  [900, TimeMarkWeight.Minute15],
  [300, TimeMarkWeight.Minute5],
  [60, TimeMarkWeight.Minute1],
  [30, TimeMarkWeight.Second30],
  [15, TimeMarkWeight.Second15],
  [5, TimeMarkWeight.Second5],
  [1, TimeMarkWeight.Second1]
]

const HOUR = 3600000

interface LocalTime {
  year: number
  month: number
  day: number
  secondOfDay: number
}

/**
 * Wall-clock parts of a timestamp in the chart's timezone. `formatToParts`
 * is far too slow to run per bar on every zoom frame, so the zone offset is
 * resolved once per hour and the parts come from `Date` arithmetic.
 */
export class LocalClock {
  private readonly _offsets = new Map<number, number>()

  constructor (private readonly _format: Intl.DateTimeFormat) {}

  get format (): Intl.DateTimeFormat { return this._format }

  private _offset (timestamp: number): number {
    const bucket = Math.floor(timestamp / HOUR)
    let offset = this._offsets.get(bucket)
    if (offset === undefined) {
      const at = bucket * HOUR
      const p = formatTimestampToDateTime(this._format, at)
      offset = Date.UTC(+p.YYYY, +p.MM - 1, +p.DD, +p.HH, +p.mm, +p.ss) - at
      if (this._offsets.size > 100000) this._offsets.clear()
      this._offsets.set(bucket, offset)
    }
    return offset
  }

  get (timestamp: number): LocalTime {
    const local = new Date(timestamp + this._offset(timestamp))
    return {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth(),
      day: local.getUTCDate(),
      secondOfDay: local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds()
    }
  }
}

/** The weight of the boundary crossed between two consecutive bars. */
export function timeMarkWeight (prev: LocalTime, cur: LocalTime): number {
  if (cur.year !== prev.year) return TimeMarkWeight.Year
  if (cur.month !== prev.month) return TimeMarkWeight.Month
  if (cur.day !== prev.day) return TimeMarkWeight.Day
  for (const [step, weight] of SECOND_STEPS) {
    if (Math.floor(cur.secondOfDay / step) !== Math.floor(prev.secondOfDay / step)) return weight
  }
  return TimeMarkWeight.None
}

export interface TimeTickMark {
  index: number
  weight: number
}

/**
 * Picks the bars to label. Heavier boundaries are placed first; a lighter one
 * is kept only when it is at least `minBarsBetween` bars from every mark
 * already kept. Running this over the whole series, rather than the visible
 * window, keeps the choice independent of scroll position, so labels don't
 * jump while panning.
 *
 * `weights[i]` is the weight of bar `i`; the result is sorted by index.
 */
export function selectTimeTickMarks (weights: ArrayLike<number>, minBarsBetween: number): TimeTickMark[] {
  const byWeight = new Map<number, number[]>()
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]
    if (w <= TimeMarkWeight.None) continue
    let list = byWeight.get(w)
    if (list === undefined) {
      list = []
      byWeight.set(w, list)
    }
    list.push(i)
  }
  // A time-of-day level whose marks typically sit closer than the minimum
  // would only fill gaps at odd times (`11:15 11:22 11:30`), so it is dropped.
  // Calendar levels keep filling: `8 15 22` between months reads fine.
  const levels = Array.from(byWeight.keys())
    .sort((a, b) => b - a)
    .filter(weight => weight >= TimeMarkWeight.Day || typicalGap(weights, weight) >= minBarsBetween)

  let kept: TimeTickMark[] = []
  for (const weight of levels) {
    const candidates = byWeight.get(weight)!
    // Merge the level into the kept marks in one pass: `out` holds everything
    // kept so far left of the cursor, `kept[j]` is the nearest older mark right of it.
    const out: TimeTickMark[] = []
    let j = 0
    for (const index of candidates) {
      while (j < kept.length && kept[j].index < index) out.push(kept[j++])
      const left = out.length > 0 ? out[out.length - 1].index : -Infinity
      const right = j < kept.length ? kept[j].index : Infinity
      if (index - left >= minBarsBetween && right - index >= minBarsBetween) {
        out.push({ index, weight })
      }
    }
    while (j < kept.length) out.push(kept[j++])
    kept = out
  }
  return kept
}

/** Median distance in bars between consecutive marks at least `weight` heavy. */
function typicalGap (weights: ArrayLike<number>, weight: number): number {
  const gaps: number[] = []
  let prev = -1
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] < weight) continue
    if (prev >= 0) gaps.push(i - prev)
    prev = i
  }
  if (gaps.length === 0) return Infinity
  gaps.sort((a, b) => a - b)
  return gaps[gaps.length >> 1]
}

/** Display template for a mark of the given weight. */
export function timeMarkTemplate (weight: number, withSeconds: boolean): string {
  if (weight >= TimeMarkWeight.Year) return 'YYYY'
  if (weight >= TimeMarkWeight.Month) return 'MMM'
  if (weight >= TimeMarkWeight.Day) return 'D'
  if (withSeconds || weight < TimeMarkWeight.Minute1) return 'HH:mm:ss'
  return 'HH:mm'
}

/**
 * Which marks are drawn bold: the heaviest weight on screen, and only when
 * lighter labels sit between them. A row of plain days stays plain, as in
 * TradingView; days among hours, or months among days, go bold. Hour-level
 * weights are folded together first, so `15:00` isn't bold beside a plain
 * `14:00` just because 15 is divisible by 3.
 */
export function boldWeightThreshold (marks: TimeTickMark[]): number {
  const fold = (w: number): number => {
    if (w > TimeMarkWeight.Hour1 && w < TimeMarkWeight.Day) return TimeMarkWeight.Hour1
    if (w > TimeMarkWeight.Minute1 && w < TimeMarkWeight.Hour1) return TimeMarkWeight.Minute1
    return w
  }
  let max = TimeMarkWeight.None as number
  let min = Infinity
  for (const m of marks) {
    const w = fold(m.weight)
    if (w > max) max = w
    if (w < min) min = w
  }
  return min < max ? max : Infinity
}
