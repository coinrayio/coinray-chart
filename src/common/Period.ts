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

export type PeriodType = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export interface Period {
  type: PeriodType
  span: number
}

/** The time label on the x-axis under the crosshair, in TradingView's form: `04 Oct '26  11:00`. */
export const PeriodTypeCrosshairLabelFormat: Record<PeriodType, string> = {
  second: "DD MMM 'YY  HH:mm:ss",
  minute: "DD MMM 'YY  HH:mm",
  hour: "DD MMM 'YY  HH:mm",
  day: "DD MMM 'YY",
  week: "DD MMM 'YY",
  month: "MMM 'YY",
  year: 'YYYY'
}

export const PeriodTypeCrosshairTooltipFormat: Record<PeriodType, string> = {
  second: 'HH:mm:ss',
  minute: 'YYYY-MM-DD HH:mm',
  hour: 'YYYY-MM-DD HH:mm',
  day: 'YYYY-MM-DD',
  week: 'YYYY-MM-DD',
  month: 'YYYY-MM',
  year: 'YYYY'
}
