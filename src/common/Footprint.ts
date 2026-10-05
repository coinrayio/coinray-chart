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

import type Nullable from './Nullable'

/** One price row of a footprint bar: `[price, bid volume, ask volume]`, base units. */
export type FootprintRow = [price: number, bid: number, ask: number]

/** Executed volume per price row for one bar, as the host resolves it for `candle.type: 'footprint'`. */
export interface FootprintBarData {
  /** Price step between rows; each row covers `[price, price + rowSize)`. */
  rowSize: number
  /** Price of the point-of-control row, or `null` when the bar has no volume. */
  poc: Nullable<number>
  rows: FootprintRow[]
}

export interface FootprintImbalances {
  /** Indices into `rows` whose bid outweighs the ask one row up by the ratio. */
  bid: Set<number>
  /** Indices into `rows` whose ask outweighs the bid one row down by the ratio. */
  ask: Set<number>
}

/**
 * Diagonal imbalances: the ask at P against the bid at P - rowSize, and the bid
 * at P against the ask at P + rowSize. A diagonal partner with no volume is not
 * counted, otherwise every edge row of every bar would light up.
 */
export function footprintImbalances (rows: FootprintRow[], rowSize: number, ratio: number): FootprintImbalances {
  const result: FootprintImbalances = { bid: new Set(), ask: new Set() }
  if (rowSize <= 0 || ratio <= 0) return result
  const byStep = new Map<number, FootprintRow>()
  rows.forEach(row => { byStep.set(Math.round(row[0] / rowSize), row) })
  rows.forEach((row, i) => {
    const step = Math.round(row[0] / rowSize)
    const below = byStep.get(step - 1)
    if (below !== undefined && below[1] > 0 && row[2] / below[1] >= ratio) result.ask.add(i)
    const above = byStep.get(step + 1)
    if (above !== undefined && above[2] > 0 && row[1] / above[2] >= ratio) result.bid.add(i)
  })
  return result
}

/** Price of the row with the most `bid + ask`; ties go to the row closest to `close`. */
export function footprintPoc (rows: FootprintRow[], close: number): Nullable<number> {
  let best: Nullable<FootprintRow> = null
  for (const row of rows) {
    const total = row[1] + row[2]
    if (total <= 0) continue
    if (best === null) { best = row; continue }
    const bestTotal = best[1] + best[2]
    if (total > bestTotal || (total === bestTotal && Math.abs(row[0] - close) < Math.abs(best[0] - close))) {
      best = row
    }
  }
  return best?.[0] ?? null
}

function trim (value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

/** Compact volume for a cell: `7K`, `1.2M`, `350`, `4.5`, `0.031`. */
export function formatFootprintVolume (value: number): string {
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  const units: Array<[number, string]> = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = value / size
      return `${trim(scaled.toFixed(Math.abs(scaled) >= 100 ? 0 : 1))}${suffix}`
    }
  }
  if (abs >= 100) return value.toFixed(0)
  if (abs >= 1) return trim(value.toFixed(1))
  return trim(value.toPrecision(2))
}
