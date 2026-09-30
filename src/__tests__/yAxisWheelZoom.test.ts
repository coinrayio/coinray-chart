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
import { yAxisWheelRangeFactor } from '../common/utils/yAxisWheelZoom'

describe('yAxisWheelRangeFactor', () => {
  it('narrows the range when the wheel goes up and widens it when it goes down', () => {
    expect(yAxisWheelRangeFactor(1)).toBeCloseTo(0.9)
    expect(yAxisWheelRangeFactor(-1)).toBeCloseTo(1 / 0.9)
  })

  it('is neutral at zero and cancels opposite notches', () => {
    expect(yAxisWheelRangeFactor(0)).toBe(1)
    expect(yAxisWheelRangeFactor(0.4) * yAxisWheelRangeFactor(-0.4)).toBeCloseTo(1)
  })
})
