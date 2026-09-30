import { describe, expect, it } from 'vitest'
import fiveWaves from '../extension/overlay/fiveWaves'
import threeWaves from '../extension/overlay/threeWaves'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const draw = (tpl: any, coordinates: Array<{ x: number, y: number }>, extendData?: unknown): any[] =>
  tpl.createPointFigures({ coordinates, overlay: { id: 'a', extendData } })

const c5 = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 10, y: i % 2 === 0 ? 50 : 10 }))
const c3 = c5.slice(0, 4)
const texts = (figs: any[]): string[] => figs.filter((f) => f.type === 'text').map((f) => f.attrs.text)

describe('fiveWaves and threeWaves degree', () => {
  it('keeps the plain (n) labels and the line without a degree', () => {
    const figs = draw(fiveWaves(), c5)
    expect(figs.map((f) => f.type)).toEqual(['line', 'text'])
    expect(figs[1].attrs.map((t: { text: string }) => t.text)).toEqual(['(0)', '(1)', '(2)', '(3)', '(4)', '(5)'])
  })
  it('draws the impulse label set of the degree', () => {
    // Degree d: t = 14 - d, set = floor(t / 3), decoration = plain, (x), circled for t % 3 = 0, 1, 2.
    expect(texts(draw(fiveWaves(), c5, { degree: 7 }))).toEqual(['(1)', '(2)', '(3)', '(4)', '(5)'])
    expect(texts(draw(fiveWaves(), c5, { degree: 'Minor' }))).toEqual(['1', '2', '3', '4', '5'])
    expect(texts(draw(fiveWaves(), c5, { degree: 9 }))).toEqual(['i', 'ii', 'iii', 'iv', 'v'])
    expect(draw(fiveWaves(), c5, { degree: 9 }).filter((f) => f.type === 'circle')).toHaveLength(5)
  })
  it('uses the correction letters, lower case on the odd sets', () => {
    expect(texts(draw(threeWaves(), c3, { degree: 8 }))).toEqual(['A', 'B', 'C'])
    expect(texts(draw(threeWaves(), c3, { degree: 10 }))).toEqual(['(a)', '(b)', '(c)'])
  })
  it('hides the line when showWave is false', () => {
    expect(draw(threeWaves(), c3, { degree: 8, showWave: false }).some((f) => f.type === 'line')).toBe(false)
    expect(draw(threeWaves(), c3, { degree: 8 }).some((f) => f.type === 'line')).toBe(true)
  })
})
