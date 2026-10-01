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
import ChartImp from '../Chart'

function axisOf (auto: boolean, position = 'right'): { auto: boolean, position: string, getAutoCalcTickFlag: () => boolean, setAutoCalcTickFlag: (f: boolean) => void } {
  const axis = {
    auto,
    position,
    getAutoCalcTickFlag: () => axis.auto,
    setAutoCalcTickFlag: (flag: boolean) => { axis.auto = flag }
  }
  return axis
}

describe('new indicator panes', () => {
  function setup (position: string): { chart: ChartImp, created: Array<{ id: string, options: { axis?: { position?: string } } }> } {
    const created: Array<{ id: string, options: { axis?: { position?: string } } }> = []
    const chart = Object.create(ChartImp.prototype) as ChartImp
    Object.assign(chart, {
      _candlePane: { getAxisComponent: () => axisOf(true, position), getId: () => 'candle_pane' },
      _drawPanes: [],
      _chartStore: { addIndicator: () => true },
      _createPane: (_cls: unknown, id: string, options: { axis?: { position?: string } }) => { created.push({ id, options }) },
      getDrawPaneById: () => null,
      setPaneOptions: vi.fn(),
      layout: vi.fn()
    })
    return { chart, created }
  }

  it('start on the side the candle pane scale is on', () => {
    const { chart, created } = setup('left')
    chart.createIndicator('MA', false, { id: 'pane_a' })
    expect(created[0].options.axis?.position).toBe('left')
  })

  it('keep an explicit position', () => {
    const { chart, created } = setup('left')
    chart.createIndicator('MA', false, { id: 'pane_a', axis: { position: 'right' } })
    expect(created[0].options.axis?.position).toBe('right')
  })
})
