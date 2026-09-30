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

/**
 * Cross Line — TradingView's `cross_line`: a horizontal and a vertical line
 * through one point, with the point's price on the Y axis and its time on the
 * X axis. Both labels are on by default, as in TV; `extendData.showPriceLabels`
 * / `showTimeLabel` set to `false` hide them.
 */

import type DeepPartial from '../../common/DeepPartial'
import type { LineStyle } from '../../common/Styles'
import { isNumber, merge, clone } from '../../common/utils/typeChecks'
import type ChartImp from '../../Chart'
import type { OverlayCreateFiguresCallback } from '../../component/Overlay'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { anchorPriceAxisLabel, HORIZONTAL_DEFAULT_WIDTH } from './horizontalRayLine'
import { TV_BLUE, axisLabelStyles, tvDashedValue } from './tvLine'

interface CrossLineExtendData { showPriceLabels?: boolean, showTimeLabel?: boolean }

/** The drawing's time on the x-axis, unless `showTimeLabel` is false. Shared with the vertical line. */
export const timeAxisLabel = (params: Parameters<OverlayCreateFiguresCallback<unknown>>[0], color?: string): ReturnType<OverlayCreateFiguresCallback<unknown>> => {
  const { chart, overlay, coordinates } = params
  const ext = (overlay.extendData ?? {}) as CrossLineExtendData
  const timestamp = overlay.points[0]?.timestamp
  if (ext.showTimeLabel === false || coordinates.length === 0 || !isNumber(timestamp)) return []
  const text = (chart as ChartImp).getChartStore().getInnerFormatter().formatDate(timestamp, 'YYYY-MM-DD HH:mm', 'crosshair')
  return [{ type: 'text', attrs: { x: coordinates[0].x, y: 0, text, align: 'center' }, ...(color !== undefined ? { styles: axisLabelStyles(color) } : {}), ignoreEvent: true }]
}

const crossLine = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    const size = props.lineWidth ?? HORIZONTAL_DEFAULT_WIDTH
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? TV_BLUE,
      size,
      dashedValue: tvDashedValue(props.lineDashedValue, size)
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const newProps = clone(properties.get(id) ?? {}) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }
  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: 'crossLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length === 0) return []
      const { x, y } = coordinates[0]
      return [{
        type: 'line',
        key: 'cross',
        attrs: [
          { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          { coordinates: [{ x, y: 0 }, { x, y: bounding.height }] }
        ],
        styles: lineStyle(overlay.id)
      }]
    },
    createYAxisFigures: (params) => {
      const ext = (params.overlay.extendData ?? {}) as CrossLineExtendData
      if (ext.showPriceLabels === false) return []
      // The shared label is opt-in; the cross line's is opt-out.
      return anchorPriceAxisLabel({ ...params, overlay: { ...params.overlay, extendData: { showPriceLabels: true } } }, lineStyle(params.overlay.id).color)
    },
    createXAxisFigures: (params) => timeAxisLabel(params, lineStyle(params.overlay.id).color),
    setProperties,
    getProperties
  }
}

export default crossLine
