import { describe, expect, it } from 'vitest'

import IndicatorImp, { figureStyleAt, getFigureDefaults, invalidateFigureStyles } from '../component/Indicator'
import { getDefaultStyles } from '../common/Styles'

interface Row { v: number }

function setup (): { indicator: IndicatorImp<Row>, calls: () => number } {
  let calls = 0
  const Template = IndicatorImp.extend<Row>({
    name: 'TEST_STYLE_CACHE',
    figures: [{
      key: 'v',
      type: 'bar',
      styles: ({ data }) => {
        calls++
        return { color: (data.current?.v ?? 0) > 0 ? 'green' : 'red' }
      }
    }],
    calc: () => []
  })
  const indicator = new Template() as unknown as IndicatorImp<Row>
  indicator.result = [{ v: 1 }, { v: -1 }]
  return { indicator, calls: () => calls }
}

describe('figure style cache', () => {
  const defaultStyles = getDefaultStyles().indicator

  it('evaluates a per-bar style once per bar', () => {
    const { indicator, calls } = setup()
    const defaults = getFigureDefaults(indicator, defaultStyles)
    expect(figureStyleAt(indicator, defaults, 0, 0, defaultStyles).color).toBe('green')
    expect(figureStyleAt(indicator, defaults, 0, 1, defaultStyles).color).toBe('red')
    figureStyleAt(indicator, defaults, 0, 0, defaultStyles)
    figureStyleAt(indicator, defaults, 0, 1, defaultStyles)
    expect(calls()).toBe(2)
  })

  it('re-evaluates after a new result, an override or a chart style change', () => {
    const { indicator, calls } = setup()
    const at0 = (): unknown => figureStyleAt(indicator, getFigureDefaults(indicator, defaultStyles), 0, 0, defaultStyles).color
    at0()

    indicator.result = [{ v: -5 }]
    expect(at0()).toBe('red')
    expect(calls()).toBe(2)

    indicator.override({ visible: true })
    at0()
    expect(calls()).toBe(3)

    invalidateFigureStyles()
    at0()
    expect(calls()).toBe(4)

    at0()
    expect(calls()).toBe(4)
  })
})
