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

// One wheel notch narrows or widens the price range by 10%, a step TradingView's feel sits close to.
const STEP = 0.9

/**
 * `notches` is the normalised wheel delta (positive = wheel up = zoom in).
 * Exponential, so equal notches in opposite directions cancel exactly.
 */
export function yAxisWheelRangeFactor (notches: number): number {
  return Math.pow(STEP, notches)
}
