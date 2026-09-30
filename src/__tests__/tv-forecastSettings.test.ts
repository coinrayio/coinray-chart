import { describe, expect, it } from 'vitest'
import type { KLineData } from '../common/Data'
import { barFigures, scaleAlpha } from '../extension/overlay/tv/forecastData/common'
import { resolveBands, type AnchoredVwapExtendData } from '../extension/overlay/tv/forecastData/anchoredVwap'
import { buildProfile } from '../extension/overlay/tv/forecastData/volumeProfile'

const bar = (open: number, high: number, low: number, close: number, volume: number): KLineData => ({ timestamp: 0, open, high, low, close, volume })

describe('scaleAlpha', () => {
  it('scales the alpha of hex and rgb colours', () => {
    expect(scaleAlpha('rgba(8, 153, 129, 0.2)', 1.2)).toBe('rgba(8, 153, 129, 0.24)')
    expect(scaleAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(scaleAlpha('#f00', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(scaleAlpha('#ff000080', 1)).toBe('rgba(255, 0, 0, 0.502)')
    expect(scaleAlpha('rgb(1, 2, 3)', 0.25)).toBe('rgba(1, 2, 3, 0.25)')
  })
  it('leaves other colour formats alone', () => {
    expect(scaleAlpha('transparent', 0.5)).toBe('transparent')
  })
})

describe('barFigures', () => {
  const y = (p: number): number => p
  const b = { open: 1, high: 3, low: 0, close: 2 }
  it('leaves out the wick and border when asked', () => {
    const full = barFigures('candle', 'c', 0, 2, b, y, '#fff', '#000')
    expect(full.map((f) => f.key)).toEqual(['c_stem', 'c_body'])
    const bare = barFigures('candle', 'c', 0, 2, b, y, '#fff', '#000', null, null)
    expect(bare.map((f) => f.key)).toEqual(['c_body'])
    expect(bare[0].styles).toMatchObject({ style: 'fill', borderSize: 0 })
  })
})

describe('anchored vwap bands', () => {
  it('draws none until one is switched on', () => {
    expect(resolveBands({})).toEqual([])
    expect(resolveBands({ band1On: false, band2On: false } as AnchoredVwapExtendData)).toEqual([])
  })
  it('reads the flat keys, with TV\'s multipliers, colours and per-side switches', () => {
    const bands = resolveBands({ band1On: true, band3On: true, band3Multiplier: 2.5, upper3On: false, lower3Color: '#123456', lower3Width: '2' } as AnchoredVwapExtendData)
    expect(bands).toHaveLength(2)
    expect(bands[0]).toMatchObject({ multiplier: 1, lower: { color: '#4caf50', width: 1 }, upper: { color: '#4caf50' } })
    expect(bands[1]).toMatchObject({ multiplier: 2.5, upper: null, lower: { color: '#123456', width: 2 } })
  })
  it('still reads the older list of enabled bands', () => {
    const bands = resolveBands({ bands: [{ multiplier: 1 }, { multiplier: 3, color: '#abcdef' }] })
    expect(bands.map((x) => x.multiplier)).toEqual([1, 3])
    expect(bands[1].lower?.color).toBe('#abcdef')
  })
})

describe('volume profile row layout', () => {
  const bars = [bar(0, 10, 0, 5, 100), bar(5, 10, 0, 6, 100)]
  it('takes rows as a count, or as ticks per row', () => {
    expect(buildProfile(bars, 0, 1, 10, 70)?.rows).toHaveLength(10)
    expect(buildProfile(bars, 0, 1, 2, 70, 0.5)?.rows).toHaveLength(10)
    expect(buildProfile(bars, 0, 1, 1, 70, 0.01)?.rows).toHaveLength(1000)
  })
})
