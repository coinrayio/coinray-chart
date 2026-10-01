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
import { describe, it, expect, vi } from 'vitest'
import Event from '../Event'
import ChartImp from '../Chart'
import type { MouseTouchEvent } from '../common/EventHandler'

function axisOf (auto: boolean, position = 'right'): { auto: boolean, position: string, getAutoCalcTickFlag: () => boolean, setAutoCalcTickFlag: (f: boolean) => void } {
  const axis = {
    auto,
    position,
    getAutoCalcTickFlag: () => axis.auto,
    setAutoCalcTickFlag: (flag: boolean) => { axis.auto = flag }
  }
  return axis
}

describe('y-axis double-click release', () => {
  function setup (auto: boolean): { event: Event, actions: Array<[string, unknown]> } {
    const actions: Array<[string, unknown]> = []
    const axis = axisOf(auto)
    const yAxisWidget = { getName: () => 'yAxis', getBounding: () => ({ left: 400, top: 0, width: 60, height: 300 }) }
    const pane = {
      getId: () => 'candle_pane',
      getBounding: () => ({ left: 0, top: 0, width: 460, height: 300 }),
      getMainWidget: () => ({ getName: () => 'main', getBounding: () => ({ left: 0, top: 0, width: 400, height: 300 }) }),
      getYAxisWidget: () => yAxisWidget,
      getAxisComponent: () => axis
    }
    const chart = {
      getSeparatorPanes: () => new Map(),
      getStyles: () => ({ separator: { size: 1 } }),
      getDrawPanes: () => [pane],
      getChartStore: () => ({
        hasAction: () => true,
        executeAction: (type: string, data: unknown) => { actions.push([type, data]) }
      }),
      layout: vi.fn()
    }
    const event = Object.create(Event.prototype) as Event
    Object.assign(event, { _chart: chart })
    return { event, actions }
  }
  const onAxis = { x: 430, y: 100 } as unknown as MouseTouchEvent

  it('reports the release when the axis was off auto', () => {
    const { event, actions } = setup(false)
    event.mouseDoubleClickEvent(onAxis)
    expect(actions).toEqual([['onYAxisAutoScaleRelease', { paneId: 'candle_pane', reason: 'doubleClick' }]])
  })

  it('stays quiet when the axis was already auto', () => {
    const { event, actions } = setup(true)
    event.mouseDoubleClickEvent(onAxis)
    expect(actions).toEqual([])
  })
})

describe('chart-level reset', () => {
  it('reports only the panes that were off auto when the symbol changes', () => {
    const actions: Array<[string, unknown]> = []
    const axes = [axisOf(false), axisOf(true)]
    const panes = [
      { getId: () => 'candle_pane', getAxisComponent: () => axes[0] },
      { getId: () => 'indicator_1', getAxisComponent: () => axes[1] }
    ]
    const chart = Object.create(ChartImp.prototype) as ChartImp
    Object.assign(chart, {
      _drawPanes: panes,
      _chartStore: {
        getSymbol: () => ({ ticker: 'A' }),
        setSymbol: vi.fn(),
        hasAction: () => true,
        executeAction: (type: string, data: unknown) => { actions.push([type, data]) }
      }
    })
    chart.setSymbol({ ticker: 'A' })
    expect(actions).toEqual([['onYAxisAutoScaleRelease', { paneId: 'candle_pane', reason: 'reset' }]])
    expect(axes.every(a => a.getAutoCalcTickFlag())).toBe(true)
  })
})
