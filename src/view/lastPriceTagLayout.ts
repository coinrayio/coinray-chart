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

import type Nullable from '../common/Nullable'

interface RowBox {
  size: number
  paddingTop: number
  paddingBottom: number
}

export interface LastPriceTagRow<S extends RowBox> {
  text: string
  style: S & { position: 'above_price' | 'below_price' }
}

export interface LastPriceTagLayout<S extends RowBox> {
  /** Centre of each row, in the order given. */
  rows: Array<LastPriceTagRow<S> & { y: number }>
  top: number
  bottom: number
}

/**
 * Where the rows of the last-price tag go: the price itself on the last close,
 * then the extend rows (the bar countdown) stacked above and below it. With
 * the price label off, the first row takes the price's place on the close, so
 * the countdown can show on its own. `null` when there is nothing to draw.
 *
 * Shared by `CandleLastPriceLabelView`, which draws the tag, and
 * `OverlayYAxisView`, which keeps other axis tags clear of it.
 */
export function layoutLastPriceTag<S extends RowBox> (
  priceY: number,
  price: RowBox | null,
  rows: Array<LastPriceTagRow<S>>
): Nullable<LastPriceTagLayout<S>> {
  const placed: Array<LastPriceTagRow<S> & { y: number }> = []
  let top = 0
  let bottom = 0
  let onPrice = price === null
  if (price !== null) {
    top = priceY - price.size / 2 - price.paddingTop
    bottom = priceY + price.size / 2 + price.paddingBottom
  }
  rows.forEach(row => {
    if (row.text.length === 0) return
    const { size, paddingTop, paddingBottom, position } = row.style
    const half = size / 2
    let y = priceY
    if (onPrice) {
      onPrice = false
      top = priceY - half - paddingTop
      bottom = priceY + half + paddingBottom
    } else if (position === 'above_price') {
      top -= paddingBottom + half
      y = top
      top -= half + paddingTop
    } else {
      bottom += paddingTop + half
      y = bottom
      bottom += half + paddingBottom
    }
    placed.push({ ...row, y })
  })
  if (onPrice) return null
  return { rows: placed, top, bottom }
}
