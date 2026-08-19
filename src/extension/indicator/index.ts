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

import type Nullable from '../../common/Nullable'

import IndicatorImp, { type IndicatorTemplate, type IndicatorConstructor } from '../../component/Indicator'

import averagePrice from './averagePrice'
import awesomeOscillator from './awesomeOscillator'
import bias from './bias'
import bollingerBands from './bollingerBands'
import brar from './brar'
import bullAndBearIndex from './bullAndBearIndex'
import commodityChannelIndex from './commodityChannelIndex'
import currentRatio from './currentRatio'
import differentOfMovingAverage from './differentOfMovingAverage'
import directionalMovementIndex from './directionalMovementIndex'
import easeOfMovementValue from './easeOfMovementValue'
import exponentialMovingAverage from './exponentialMovingAverage'
import momentum from './momentum'
import movingAverage from './movingAverage'
import movingAverageConvergenceDivergence from './movingAverageConvergenceDivergence'
import onBalanceVolume from './onBalanceVolume'
import priceAndVolumeTrend from './priceAndVolumeTrend'
import psychologicalLine from './psychologicalLine'
import rateOfChange from './rateOfChange'
import relativeStrengthIndex from './relativeStrengthIndex'
import simpleMovingAverage from './simpleMovingAverage'
import stoch from './stoch'
import stopAndReverse from './stopAndReverse'
import tripleExponentiallySmoothedAverage from './tripleExponentiallySmoothedAverage'
import volume from './volume'
import volumeRatio from './volumeRatio'
import williamsR from './williamsR'

const indicators: Record<string, IndicatorConstructor> = {}

/**
 * The template each registered indicator was built from, kept alongside its
 * constructor so callers can read an indicator's metadata — `shortName`,
 * `series`, `precision`, `calcParams` — without instantiating it.
 *
 * A UI that lists the indicators a chart can create (a picker, a settings
 * editor) needs exactly this and nothing else. Going through
 * `getIndicatorClass` would mean `new`-ing every entry to read one field, and
 * the constructor clones state; more to the point, an indicator registered by a
 * host through `registerIndicator` lands here too, so such a UI can be built
 * from the registry rather than from a hardcoded list that silently omits it.
 */
const templates: Record<string, IndicatorTemplate> = {}

const extensions = [
  averagePrice, awesomeOscillator, bias, bollingerBands, brar,
  bullAndBearIndex, commodityChannelIndex, currentRatio, differentOfMovingAverage,
  directionalMovementIndex, easeOfMovementValue, exponentialMovingAverage, momentum,
  movingAverage, movingAverageConvergenceDivergence, onBalanceVolume, priceAndVolumeTrend,
  psychologicalLine, rateOfChange, relativeStrengthIndex, simpleMovingAverage,
  stoch, stopAndReverse, tripleExponentiallySmoothedAverage, volume, volumeRatio, williamsR
]

extensions.forEach((indicator: IndicatorTemplate) => {
  indicators[indicator.name] = IndicatorImp.extend(indicator)
  templates[indicator.name] = indicator
})

function registerIndicator<D = unknown, C = unknown, E = unknown> (indicator: IndicatorTemplate<D, C, E>): void {
  indicators[indicator.name] = IndicatorImp.extend(indicator)
  templates[indicator.name] = indicator as unknown as IndicatorTemplate
}

function getIndicatorClass (name: string): Nullable<IndicatorConstructor> {
  return indicators[name] ?? null
}

/** The template `name` was registered with, or null. See `templates` above. */
function getIndicatorTemplate (name: string): Nullable<IndicatorTemplate> {
  return templates[name] ?? null
}

function getSupportedIndicators (): string[] {
  return Object.keys(indicators)
}

export { registerIndicator, getIndicatorClass, getIndicatorTemplate, getSupportedIndicators }
