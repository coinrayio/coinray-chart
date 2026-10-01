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
import { getDefaultStyles } from '../common/Styles'
import type { KLineData } from '../common/Data'
import type { Indicator } from '../component/Indicator'
import { collectNameLabels, type NameLabelParams } from '../view/NameLabelView'

const bar = (open: number, close: number): KLineData => ({ timestamp: 0, open, high: close + 1, low: open - 1, close, volume: 1 })

function indicator (shortName: string, result: Array<Record<string, number>>): Indicator {
  return {
    shortName,
    visible: true,
    result,
    styles: null,
    figures: [{ key: 'a', type: 'line' }, { key: 'b', type: 'line' }]
  } as unknown as Indicator
}

function params (over: Partial<NameLabelParams> = {}, show = { symbol: true, indicator: true }): NameLabelParams {
  const styles = getDefaultStyles()
  styles.candle.priceMark.last.nameLabel.show = show.symbol
  styles.indicator.lastValueMark.nameLabel.show = show.indicator
  return {
    isCandle: true,
    styles,
    symbol: { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 0 },
    dataList: [bar(100, 101), bar(101, 110)],
    indicators: [],
    convertToNicePixel: v => v * 2,
    ...over
  }
}

describe('collectNameLabels', () => {
  it('puts the ticker at the last close, in the last-price colour', () => {
    const p = params()
    expect(collectNameLabels(p)).toEqual([
      { text: 'BTCUSDT', y: 220, color: p.styles.candle.priceMark.last.upColor, style: p.styles.candle.priceMark.last.nameLabel }
    ])
  })

  it('falls back to the symbol name when there is no ticker', () => {
    const labels = collectNameLabels(params({ symbol: { name: 'Bitcoin', pricePrecision: 2, volumePrecision: 0 } as never }))
    expect(labels[0].text).toBe('Bitcoin')
  })

  it('puts an indicator short name at its first figure last value only', () => {
    const labels = collectNameLabels(params({
      isCandle: false,
      indicators: [indicator('MA', [{ a: 1, b: 2 }, { a: 50, b: 60 }])]
    }))
    expect(labels.map(l => [l.text, l.y])).toEqual([['MA', 100]])
  })

  it('draws nothing while both flags are off, and no ticker off the candle pane', () => {
    expect(collectNameLabels(params({ indicators: [indicator('MA', [{ a: 1 }, { a: 5 }])] }, { symbol: false, indicator: false }))).toEqual([])
    expect(collectNameLabels(params({ isCandle: false }, { symbol: true, indicator: false }))).toEqual([])
  })

  it('skips an indicator with no value on the last bar', () => {
    expect(collectNameLabels(params({ isCandle: false, indicators: [indicator('MA', [{ a: 1 }, {}])] }))).toEqual([])
  })
})
