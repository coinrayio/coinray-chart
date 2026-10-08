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

import type Nullable from '../common/Nullable'
import type Bounding from '../common/Bounding'
import { isFunction, isNumber, isString } from '../common/utils/typeChecks'

import AxisImp, { type AxisTemplate, type Axis, type AxisRange, type AxisTick } from './Axis'

import type DrawPane from '../pane/DrawPane'
import { calcTextWidth } from '../common/utils/canvas'
import {
  LocalClock, timeMarkWeight, selectTimeTickMarks, timeMarkTemplate, boldWeightThreshold,
  type TimeTickMark
} from '../common/timeTickMarks'

export type XAxisTemplate = Pick<AxisTemplate, 'name' | 'scrollZoomEnabled' | 'createTicks'>

export interface XAxis extends Axis, Required<XAxisTemplate> {
  convertTimestampFromPixel: (pixel: number) => Nullable<number>
  convertTimestampToPixel: (timestamp: number) => number
}

export type XAxisConstructor = new (parent: DrawPane) => XAxis

export default abstract class XAxisImp extends AxisImp implements XAxis {
  constructor (parent: DrawPane, xAxis: XAxisTemplate) {
    super(parent)
    this.override(xAxis)
  }

  override (xAxis: XAxisTemplate): void {
    const {
      name,
      scrollZoomEnabled,
      createTicks
    } = xAxis
    if (!isString(this.name)) {
      this.name = name
    }
    this.scrollZoomEnabled = scrollZoomEnabled ?? this.scrollZoomEnabled
    this.createTicks = createTicks ?? this.createTicks
  }

  protected override createRangeImp (): AxisRange {
    const chartStore = this.getParent().getChart().getChartStore()
    const visibleDataRange = chartStore.getVisibleRange()
    const { realFrom, realTo } = visibleDataRange
    const af = realFrom
    const at = realTo
    const diff = realTo - realFrom + 1
    const range = {
      from: af,
      to: at,
      range: diff,
      realFrom: af,
      realTo: at,
      realRange: diff,
      displayFrom: af,
      displayTo: at,
      displayRange: diff
    }
    return range
  }

  protected override createTicksImp (): AxisTick[] {
    const { realFrom, realTo } = this.getRange()
    const chartStore = this.getParent().getChart().getChartStore()
    const formatDate = chartStore.getInnerFormatter().formatDate
    const ticks: AxisTick[] = []

    const dataList = chartStore.getDataList()
    if (dataList.length > 0) {
      const textStyles = chartStore.getStyles().xAxis.tickText
      // ALTD-1915.5 tail: "Show seconds" puts `:ss` on every time label.
      const withSeconds = chartStore.getShowSeconds() || chartStore.getPeriod()?.type === 'second'
      // TradingView adds a finer level once its labels would be about 80px
      // apart at a 12px font (78px: no, 84px: yes); seconds need more room.
      const minSpacing = Math.max(
        textStyles.size * 20 / 3,
        calcTextWidth(withSeconds ? '00:00:00' : '00:00', textStyles.size, 'bold', textStyles.family) + textStyles.size * 3
      )
      const minBarsBetween = Math.max(1, Math.ceil(minSpacing / chartStore.getBarSpace().bar))

      // Run past both ends of what's visible, so a label at the edge isn't
      // one that only won because its heavier neighbour was cut off. Rounded
      // out to blocks so panning near an edge doesn't redo the whole series
      // every frame.
      const block = 256
      const first = Math.min(0, Math.floor((realFrom - minBarsBetween) / block) * block)
      const last = Math.max(dataList.length - 1, Math.ceil((realTo + minBarsBetween) / block) * block)
      const marks = this._tickMarks(first, last, minBarsBetween)
      const visible = marks.filter(m => m.index >= realFrom && m.index < realTo)
      const bold = boldWeightThreshold(visible)
      const width = this.getBounding().width
      // Panning re-labels the same timestamps every frame; formatting and
      // measuring them is cached until the font, timezone or formatter changes.
      const labelsKey = `${textStyles.size}|${textStyles.weight}|${textStyles.family}|${withSeconds}`
      const userFormatDate = chartStore.getFormatter().formatDate
      if (labelsKey !== this._labelsKey || this._labelsFormat !== chartStore.getDateTimeFormat() || this._labelsFormatter !== userFormatDate || this._labels.size > 5000) {
        this._labels.clear()
        this._labelsKey = labelsKey
        this._labelsFormat = chartStore.getDateTimeFormat()
        this._labelsFormatter = userFormatDate
      }
      for (const mark of visible) {
        const timestamp = chartStore.dataIndexToTimestamp(mark.index)
        if (isNumber(timestamp)) {
          const coord = this.convertToPixel(mark.index)
          const isBold = mark.weight >= bold
          const cacheKey = `${timestamp}|${mark.weight}|${isBold}`
          let label = this._labels.get(cacheKey)
          if (label === undefined) {
            const text = formatDate(timestamp, timeMarkTemplate(mark.weight, withSeconds), 'xAxis')
            label = { text, half: calcTextWidth(text, textStyles.size, isBold ? 'bold' : textStyles.weight, textStyles.family) / 2 }
            this._labels.set(cacheKey, label)
          }
          // A label the edge would cut in half (`un` for `Jun`) is left out.
          if (coord - label.half < 0 || coord + label.half > width) continue
          ticks.push({ coord, value: timestamp, text: label.text, bold: isBold })
        }
      }
    }

    if (isFunction(this.createTicks)) {
      return this.createTicks({
        range: this.getRange(),
        bounding: this.getBounding(),
        defaultTicks: ticks
      })
    }
    return ticks
  }

  private readonly _labels = new Map<string, { text: string, half: number }>()
  private _labelsKey = ''
  private _labelsFormat: Nullable<Intl.DateTimeFormat> = null
  private _labelsFormatter: unknown = null
  private _clock: Nullable<LocalClock> = null
  private _weightsKey = ''
  private _weights: number[] = []
  private _marksKey = ''
  private _marks: TimeTickMark[] = []

  /**
   * Tick marks over bars `first..last`, cached: bar weights only change with
   * the data, period or timezone, and the selection only with the zoom.
   */
  private _tickMarks (first: number, last: number, minBarsBetween: number): TimeTickMark[] {
    const chartStore = this.getParent().getChart().getChartStore()
    const format = chartStore.getDateTimeFormat()
    if (this._clock?.format !== format) {
      this._clock = new LocalClock(format)
      this._weightsKey = ''
    }
    const dataList = chartStore.getDataList()
    const period = chartStore.getPeriod()
    const weightsKey = `${first}|${last}|${dataList.length}|${dataList[0].timestamp}|${dataList[dataList.length - 1].timestamp}|${period?.type}${period?.span}`
    if (weightsKey !== this._weightsKey) {
      const clock = this._clock
      const weights = new Array<number>(last - first + 1)
      let prev = clock.get(chartStore.dataIndexToTimestamp(first - 1) ?? 0)
      for (let i = first; i <= last; i++) {
        const cur = clock.get(chartStore.dataIndexToTimestamp(i) ?? 0)
        weights[i - first] = timeMarkWeight(prev, cur)
        prev = cur
      }
      this._weights = weights
      this._weightsKey = weightsKey
      this._marksKey = ''
    }
    const marksKey = `${weightsKey}|${minBarsBetween}`
    if (marksKey !== this._marksKey) {
      this._marks = selectTimeTickMarks(this._weights, minBarsBetween).map(m => ({ index: m.index + first, weight: m.weight }))
      this._marksKey = marksKey
    }
    return this._marks
  }

  override getAutoSize (): number {
    const styles = this.getParent().getChart().getStyles()
    const xAxisStyles = styles.xAxis
    const height = xAxisStyles.size
    if (height !== 'auto') {
      return height
    }
    const crosshairStyles = styles.crosshair
    let xAxisHeight = 0
    if (xAxisStyles.show) {
      if (xAxisStyles.axisLine.show) {
        xAxisHeight += xAxisStyles.axisLine.size
      }
      if (xAxisStyles.tickLine.show) {
        xAxisHeight += xAxisStyles.tickLine.length
      }
      if (xAxisStyles.tickText.show) {
        xAxisHeight += (xAxisStyles.tickText.marginStart + xAxisStyles.tickText.marginEnd + xAxisStyles.tickText.size)
      }
    }
    let crosshairVerticalTextHeight = 0
    if (
      crosshairStyles.show &&
      crosshairStyles.vertical.show &&
      crosshairStyles.vertical.text.show
    ) {
      crosshairVerticalTextHeight += (
        crosshairStyles.vertical.text.paddingTop +
        crosshairStyles.vertical.text.paddingBottom +
        crosshairStyles.vertical.text.borderSize * 2 +
        crosshairStyles.vertical.text.size
      )
    }
    return Math.max(xAxisHeight, crosshairVerticalTextHeight)
  }

  protected override getBounding (): Bounding {
    return this.getParent().getMainWidget().getBounding()
  }

  convertTimestampFromPixel (pixel: number): Nullable<number> {
    const chartStore = this.getParent().getChart().getChartStore()
    const dataIndex = chartStore.coordinateToDataIndex(pixel)
    return chartStore.dataIndexToTimestamp(dataIndex)
  }

  convertTimestampToPixel (timestamp: number): number {
    const chartStore = this.getParent().getChart().getChartStore()
    const dataIndex = chartStore.timestampToDataIndex(timestamp)
    return chartStore.dataIndexToCoordinate(dataIndex)
  }

  convertFromPixel (pixel: number): number {
    return this.getParent().getChart().getChartStore().coordinateToDataIndex(pixel)
  }

  convertToPixel (value: number): number {
    return this.getParent().getChart().getChartStore().dataIndexToCoordinate(value)
  }

  static extend (template: XAxisTemplate): XAxisConstructor {
    class Custom extends XAxisImp {
      constructor (parent: DrawPane) {
        super(parent, template)
      }
    }
    return Custom
  }
}
