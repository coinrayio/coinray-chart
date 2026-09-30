import { describe, expect, it } from 'vitest'
import {
  FIB_TV_LEVELS, buildEnrichedLevels, diagonalStroke, fibOneColor, resolveFibSettings
} from '../extension/overlay/fibonacciShared'
import { FIBONACCI_CIRCLE_LEVELS } from '../extension/overlay/fibonacciCircle'
import { FIBONACCI_EXTENSION_LEVELS } from '../extension/overlay/fibonacciExtension'
import { FIBONACCI_CHANNEL_LEVELS, FIBONACCI_RETRACEMENT_LEVELS } from '../extension/overlay/fibonacciLine'
import { enabledLevels } from '../extension/overlay/tv/fibCycles/shared'
import { resolveLevels } from '../extension/overlay/tv/pitchforkGann/shared'

// The settings dialogs (src/lib/widget/overlay/tvSettings/fibGann.ts) show these defaults, so a change here is a change there.
describe('fib defaults follow TradingView', () => {
  it('the line fibs share TV\'s 24 levels, the first eleven on', () => {
    expect(FIB_TV_LEVELS).toHaveLength(24)
    expect(FIB_TV_LEVELS.filter((l) => l.enabled).map((l) => l.value))
      .toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236])
    expect(FIB_TV_LEVELS[7]).toEqual({ value: 1.618, enabled: true, color: '#2962ff' })
    expect(FIB_TV_LEVELS[23]).toEqual({ value: 4.764, enabled: false, color: '#089981' })
    for (const list of [FIBONACCI_RETRACEMENT_LEVELS, FIBONACCI_EXTENSION_LEVELS, FIBONACCI_CHANNEL_LEVELS]) expect(list).toBe(FIB_TV_LEVELS)
  })

  it('the circles draw TV\'s eleven rings', () => {
    expect(FIBONACCI_CIRCLE_LEVELS.map((l) => l.value)).toEqual([0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236, 4.618])
    expect(FIBONACCI_CIRCLE_LEVELS[2].color).toBe('#089981')
  })

  it('background is 20% opaque, labels read as values, the trend line is grey dashed 2px', () => {
    const s = resolveFibSettings(undefined)
    expect([s.backgroundOpacity, s.levelFormat, s.oneColor]).toEqual([20, 'values', undefined])
    expect(diagonalStroke(s)).toEqual({ style: 'dashed', size: 2, color: '#787b86', dashedValue: [4, 4] })
    expect(resolveFibSettings({ levelFormat: 'percent', backgroundOpacity: 5 })).toMatchObject({ levelFormat: 'percent', backgroundOpacity: 5 })
  })
})

describe('use one color', () => {
  it('is off unless ticked, and falls back to grey without a colour', () => {
    expect(fibOneColor(undefined)).toBeUndefined()
    expect(fibOneColor({ oneColor: '#f00' })).toBeUndefined()
    expect(fibOneColor({ useOneColor: true, oneColor: '#f00' })).toBe('#f00')
    expect(fibOneColor({ useOneColor: true })).toBe('#787b86')
  })

  it('paints every level of each family', () => {
    const chart = { getDecimalFold: () => ({ format: (v: string) => v }), getThousandsSeparator: () => ({ format: (v: string) => v }) }
    const enriched = buildEnrichedLevels({
      levels: FIB_TV_LEVELS.filter((l) => l.enabled), anchorFar: { x: 0, y: 0 }, anchorNear: { x: 1, y: 10 }, valueFar: 1, valueNear: 2,
      precision: 2, chart, lineColour: '#000', reverse: false, oneColor: '#f00'
    })
    expect(new Set(enriched.map((l) => l.color))).toEqual(new Set(['#f00']))
    expect(new Set(enabledLevels({}, FIB_TV_LEVELS, { useOneColor: true, oneColor: '#0f0' }).map((l) => l.color))).toEqual(new Set(['#0f0']))
    expect(enabledLevels({}, FIB_TV_LEVELS)[1].color).toBe('#f23645')
    expect(new Set(resolveLevels(undefined, [{ value: 1, color: '#111', enabled: true }, { value: 2, color: '#222', enabled: true }], '#00f').map((l) => l.color)))
      .toEqual(new Set(['#00f']))
  })
})
