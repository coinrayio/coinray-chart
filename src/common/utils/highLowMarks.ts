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
import type Nullable from '../Nullable'
import { isNumber } from './typeChecks'

export interface HighLowMarks {
  high: Nullable<number>
  low: Nullable<number>
}

// The store seeds its visible high/low with MIN/MAX_SAFE_INTEGER sentinels, which
// stay put when nothing is visible.
export function visibleHighLowMarks (highLow: Array<{ price: number }>): HighLowMarks {
  const high = highLow[0]?.price
  const low = highLow[1]?.price
  return {
    high: isNumber(high) && high !== Number.MIN_SAFE_INTEGER ? high : null,
    low: isNumber(low) && low !== Number.MAX_SAFE_INTEGER ? low : null
  }
}
