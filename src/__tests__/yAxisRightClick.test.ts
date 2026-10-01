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
import type { MouseTouchEvent } from '../common/EventHandler'

function bounds (left: number, top: number, width: number, height: number): Record<string, number> {
  return { left, top, width, height }
}

function setup (consume = false): {
  event: Event
  actions: Array<[string, unknown]>
} {
  const actions: Array<[string, unknown]> = []
  const mainWidget = {
    getName: () => 'main',
    getBounding: () => bounds(0, 0, 400, 300),
    dispatchEvent: vi.fn(() => consume)
  }
  const yAxisWidget = {
    getName: () => 'yAxis',
    getBounding: () => bounds(400, 0, 60, 300),
    dispatchEvent: vi.fn(() => consume)
  }
  const pane = {
    getId: () => 'candle_pane',
    getBounding: () => bounds(0, 0, 460, 300),
    getMainWidget: () => mainWidget,
    getYAxisWidget: () => yAxisWidget
  }
  const store = {
    hasAction: () => true,
    executeAction: (type: string, data: unknown) => { actions.push([type, data]) },
    getCrosshair: () => ({ paneId: 'candle_pane' }),
    setCrosshair: () => { /* noop */ }
  }
  const chart = {
    getSeparatorPanes: () => new Map(),
    getStyles: () => ({ separator: { size: 1 } }),
    getDrawPanes: () => [pane],
    getChartStore: () => store,
    updatePane: () => { /* noop */ }
  }
  const event = Object.create(Event.prototype) as Event
  Object.assign(event, { _chart: chart })
  return { event, actions }
}

function at (x: number, y: number): MouseTouchEvent {
  return { x, y, pageX: x + 10, pageY: y + 20 } as unknown as MouseTouchEvent
}

describe('y-axis right-click', () => {
  it('fires onYAxisRightClick, not onChartRightClick, on the axis', () => {
    const { event, actions } = setup()
    event.mouseRightClickEvent(at(430, 100))
    expect(actions).toEqual([['onYAxisRightClick', { paneId: 'candle_pane', x: 30, y: 100, pageX: 440, pageY: 120 }]])
  })

  it('still fires only onChartRightClick on the main widget', () => {
    const { event, actions } = setup()
    event.mouseRightClickEvent(at(100, 100))
    expect(actions.map(a => a[0])).toEqual(['onChartRightClick'])
  })

  it('stays quiet when an axis overlay consumed the click', () => {
    const { event, actions } = setup(true)
    event.mouseRightClickEvent(at(430, 100))
    expect(actions).toEqual([])
  })

  it('splits long-press the same way', () => {
    const axis = setup()
    expect(axis.event.longTapEvent(at(430, 100))).toBe(true)
    expect(axis.actions.map(a => a[0])).toEqual(['onYAxisRightClick'])
    const main = setup()
    main.event.longTapEvent(at(100, 100))
    expect(main.actions.map(a => a[0])).toEqual(['onChartRightClick'])
  })
})
