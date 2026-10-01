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
import { visibleHighLowMarks } from '../common/utils/highLowMarks'
import { candleTypeUsesHighLow } from '../common/Styles'

describe('visibleHighLowMarks', () => {
  it('returns the visible high and low', () => {
    expect(visibleHighLowMarks([{ price: 135 }, { price: 95 }])).toEqual({ high: 135, low: 95 })
  })

  it('drops the store sentinels when nothing is visible', () => {
    expect(visibleHighLowMarks([{ price: Number.MIN_SAFE_INTEGER }, { price: Number.MAX_SAFE_INTEGER }]))
      .toEqual({ high: null, low: null })
  })

  it('handles a missing list', () => {
    expect(visibleHighLowMarks([])).toEqual({ high: null, low: null })
  })
})

describe('candleTypeUsesHighLow', () => {
  it('is false for close-only series and true for bars and hlc_area', () => {
    expect(candleTypeUsesHighLow('line')).toBe(false)
    expect(candleTypeUsesHighLow('area')).toBe(false)
    expect(candleTypeUsesHighLow('column')).toBe(false)
    expect(candleTypeUsesHighLow('candle_solid')).toBe(true)
    expect(candleTypeUsesHighLow('hlc_area')).toBe(true)
  })
})
