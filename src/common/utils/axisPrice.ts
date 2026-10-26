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
import type { SymbolInfo } from '../SymbolInfo'
import { SymbolDefaultPrecisionConstants } from '../SymbolInfo'
import { formatPrecision } from './format'

interface AxisPriceChart {
  getSymbol: () => Nullable<Pick<SymbolInfo, 'pricePrecision'>>
  getThousandsSeparator: () => { format: (value: string) => string }
  getDecimalFold: () => { formatPrice: (value: string) => string }
}

interface AxisPriceAxis {
  displayValueToText: (value: number, precision: number) => string
}

/**
 * A price as the price axis prints it, for an overlay's axis tag: the axis's
 * own text (a host's number format lives there), the thousands separator,
 * then the decimal fold (`0.0₉358`). The same chain as the last-price tag,
 * so a tag beside the scale reads like the scale; order and position tags
 * printed `0.000000000358` beside an axis of `0.0₉345`.
 */
export function formatAxisPrice (
  chart: AxisPriceChart,
  yAxis: Nullable<AxisPriceAxis>,
  value: number,
  precision: number = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
): string {
  const text = yAxis?.displayValueToText(value, precision) ?? formatPrecision(value, precision)
  return chart.getDecimalFold().formatPrice(chart.getThousandsSeparator().format(text))
}
