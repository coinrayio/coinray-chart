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

import type VisibleRange from '../common/VisibleRange'

import type DrawPane from '../pane/DrawPane'

import type Bounding from '../common/Bounding'
import type { Chart } from '../Chart'

export interface AxisTick {
  coord: number
  value: number | string
  text: string
}

export interface AxisRange extends VisibleRange {
  readonly range: number
  readonly realRange: number
  readonly displayFrom: number
  readonly displayTo: number
  readonly displayRange: number
}

export interface AxisGap {
  top?: number
  bottom?: number
}

export type AxisPosition = 'left' | 'right'

export interface AxisValueToValueParams {
  range: AxisRange
}

export type AxisValueToValueCallback = (value: number, params: AxisValueToValueParams) => number

export interface AxisCreateRangeParams {
  chart: Chart
  paneId: string
  defaultRange: AxisRange
}

export type AxisCreateRangeCallback = (params: AxisCreateRangeParams) => AxisRange

export interface AxisCreateTicksParams {
  range: AxisRange
  bounding: Bounding
  defaultTicks: AxisTick[]
}

export type AxisCreateTicksCallback = (params: AxisCreateTicksParams) => AxisTick[]

export type AxisMinSpanCallback = (value: number) => number

export interface AxisTemplate {
  name: string
  reverse?: boolean
  inside?: boolean
  position?: AxisPosition
  scrollZoomEnabled?: boolean
  /** Candle pane only: auto range ignores indicator values (and their min/max) so the price series alone sets the range. */
  scaleSeriesOnly?: boolean
  /**
   * Locks price per bar width (`pricePerPixel * barSpace`), which turns auto
   * scale off. A number sets the ratio; `null` locks at the ratio of the range
   * showing now. Setting it is one-shot: it is not kept in the pane options.
   * Turning auto scale on releases the lock.
   */
  priceToBarRatio?: number | null
  gap?: AxisGap
  valueToRealValue?: AxisValueToValueCallback
  realValueToDisplayValue?: AxisValueToValueCallback
  displayValueToRealValue?: AxisValueToValueCallback
  realValueToValue?: AxisValueToValueCallback
  displayValueToText?: (value: number, precision: number) => string
  minSpan?: AxisMinSpanCallback
  createRange?: AxisCreateRangeCallback
  createTicks?: AxisCreateTicksCallback
}

export interface Axis {
  override: (axis: AxisTemplate) => void
  getTicks: () => AxisTick[]
  getRange: () => AxisRange
  getAutoCalcTickFlag: () => boolean
  getAutoSize: () => number
  convertToPixel: (value: number) => number
  convertFromPixel: (px: number) => number
}

export type AxisCreate = Omit<AxisTemplate, 'displayValueToText' | 'valueToRealValue' | 'realValueToDisplayValue' | 'displayValueToRealValue' | 'realValueToValue'>

function getDefaultAxisRange (): AxisRange {
  return {
    from: 0,
    to: 0,
    range: 0,
    realFrom: 0,
    realTo: 0,
    realRange: 0,
    displayFrom: 0,
    displayTo: 0,
    displayRange: 0
  }
}

export default abstract class AxisImp implements Axis {
  name: string
  scrollZoomEnabled = true
  createTicks: AxisCreateTicksCallback

  private readonly _parent: DrawPane

  private _range = getDefaultAxisRange()
  private _prevRange = getDefaultAxisRange()
  private _ticks: AxisTick[] = []

  private _autoCalcTickFlag = true

  constructor (parent: DrawPane) {
    this._parent = parent
  }

  getParent (): DrawPane { return this._parent }

  buildTicks (force: boolean): boolean {
    if (this._autoCalcTickFlag) {
      this._range = this.createRangeImp()
    }
    if (this._prevRange.from !== this._range.from || this._prevRange.to !== this._range.to || force) {
      this._prevRange = this._range
      this._ticks = this.createTicksImp()
      return true
    }
    return false
  }

  getTicks (): AxisTick[] {
    return this._ticks
  }

  setRange (range: AxisRange): void {
    this._autoCalcTickFlag = false
    this._range = range
  }

  // Replaces the range without touching the auto flag.
  protected assignRange (range: AxisRange): void {
    this._range = range
  }

  getRange (): AxisRange { return this._range }

  setAutoCalcTickFlag (flag: boolean): void {
    this._autoCalcTickFlag = flag
  }

  getAutoCalcTickFlag (): boolean { return this._autoCalcTickFlag }

  protected abstract createRangeImp (): AxisRange

  protected abstract createTicksImp (): AxisTick[]

  protected abstract getBounding (): Bounding

  abstract override (axis: AxisTemplate): void

  abstract getAutoSize (): number

  abstract convertToPixel (value: number): number
  abstract convertFromPixel (px: number): number
}
