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
import { describe, it, expect } from 'vitest'
import IndicatorPane from '../pane/IndicatorPane'

type Placement = Array<{ side: string, outer: boolean, axis: unknown }>

/** A pane's scales without a DOM: its own scale, and a second one when given. */
function pane (primary: 'left' | 'right', secondary: 'left' | 'right' | null, primaryHidden = false): { placements: () => Placement, primaryAxis: object, secondaryAxis: object } {
  const primaryAxis = { position: primary }
  const secondaryAxis = { position: secondary }
  const p = Object.create(IndicatorPane.prototype) as IndicatorPane
  Object.assign(p, {
    _axis: primaryAxis,
    _yAxisWidget: { name: 'primary' },
    _secondaryAxis: secondary === null ? null : secondaryAxis,
    _secondaryWidget: secondary === null ? null : { name: 'secondary' },
    _secondaryActive: secondary !== null,
    _primaryHidden: primaryHidden
  })
  return { placements: () => p.getYAxisPlacements() as unknown as Placement, primaryAxis, secondaryAxis }
}

describe('a pane\'s scale placements', () => {
  it('puts a second scale on the other side next to the plot', () => {
    const { placements, secondaryAxis } = pane('right', 'left')
    expect(placements().map(({ side, outer }) => ({ side, outer }))).toEqual([
      { side: 'right', outer: false },
      { side: 'left', outer: false }
    ])
    expect(placements()[1].axis).toBe(secondaryAxis)
  })

  it('stands a second scale on the same side outside the pane\'s own', () => {
    // tradingview.com's "Pin to new right scale".
    const { placements } = pane('right', 'right')
    expect(placements().map(({ side, outer }) => ({ side, outer }))).toEqual([
      { side: 'right', outer: false },
      { side: 'right', outer: true }
    ])
  })

  it('shows the second scale alone, next to the plot, when nothing uses the pane\'s own', () => {
    const { placements, secondaryAxis } = pane('right', 'left', true)
    expect(placements().map(({ side, outer, axis }) => ({ side, outer, second: axis === secondaryAxis }))).toEqual([
      { side: 'left', outer: false, second: true }
    ])
  })
})
