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
import { describe, it, expect } from 'vitest'
import { layoutLastPriceTag } from '../view/lastPriceTagLayout'

const price = { size: 12, paddingTop: 4, paddingBottom: 4 }
const row = (text: string, position: 'above_price' | 'below_price' = 'below_price') =>
  ({ text, style: { size: 10, paddingTop: 2, paddingBottom: 2, position } })

describe('layoutLastPriceTag', () => {
  it('stacks the countdown under the price label', () => {
    const tag = layoutLastPriceTag(100, price, [row('12:34')])
    // Price spans 90..110; the row is 14 tall below it.
    expect(tag).toEqual({ rows: [{ ...row('12:34'), y: 117 }], top: 90, bottom: 124 })
  })

  it('puts the countdown on the last price when the price label is off', () => {
    const tag = layoutLastPriceTag(100, null, [row('12:34')])
    expect(tag).toEqual({ rows: [{ ...row('12:34'), y: 100 }], top: 93, bottom: 107 })
  })

  it('stacks further rows from the one standing in for the price', () => {
    const tag = layoutLastPriceTag(100, null, [row('a'), row('b', 'above_price'), row('c')])
    expect(tag?.rows.map(r => [r.text, r.y])).toEqual([['a', 100], ['b', 86], ['c', 114]])
    expect([tag?.top, tag?.bottom]).toEqual([79, 121])
  })

  it('skips empty rows, and has nothing to draw with no price and no text', () => {
    expect(layoutLastPriceTag(100, price, [row('')])).toEqual({ rows: [], top: 90, bottom: 110 })
    expect(layoutLastPriceTag(100, null, [row('')])).toBeNull()
    expect(layoutLastPriceTag(100, null, [])).toBeNull()
  })
})
