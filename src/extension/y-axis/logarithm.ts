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

import { log10, index10 } from '../../common/utils/number'
import type { AxisTemplate } from '../../component/Axis'

// A price at or below zero has no logarithm; it is pinned to the smallest
// positive double so it lands far below the visible range instead of mapping
// to -Infinity or NaN.
function toLog (value: number): number {
  return log10(Math.max(value, Number.MIN_VALUE))
}

// The mapping has to be a true inverse pair. It used to be sign-symmetric
// (`-log10(|v|)` for negatives), and since the inverse keyed on the sign of the
// *log* rather than of the price, every price below 1 (negative logarithm) came
// back as `-10^|x|`: 0.0007 was labelled about -1400.
const logarithm: AxisTemplate = {
  name: 'logarithm',
  minSpan: (precision) => 0.05 * index10(-precision),
  valueToRealValue: (value) => toLog(value),
  realValueToDisplayValue: (value) => index10(value),
  displayValueToRealValue: (value) => toLog(value),
  realValueToValue: (value) => index10(value),
  createRange: ({ defaultRange }) => {
    const { from, to, range } = defaultRange
    // A zero or negative low (no data yet, an indicator dipping below zero)
    // would stretch the range down to 1e-323. Show one decade under the top.
    const realTo = toLog(to > 0 ? to : 10)
    const realFrom = from > 0 ? toLog(from) : realTo - 1
    return {
      from,
      to,
      range,
      realFrom,
      realTo,
      realRange: realTo - realFrom,
      displayFrom: from,
      displayTo: to,
      displayRange: range
    }
  }
}

export default logarithm
