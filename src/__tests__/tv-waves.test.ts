import { describe, expect, it } from 'vitest'
import fiveWaves from '../extension/overlay/fiveWaves'
import threeWaves from '../extension/overlay/threeWaves'
import eightWaves from '../extension/overlay/eightWaves'
import anyWaves from '../extension/overlay/anyWaves'
import { timeCycles } from '../extension/overlay/tv/fibCycles/cycles'
import xabcd from '../extension/overlay/xabcd'
import headAndShoulders from '../extension/overlay/tv/patterns/headAndShoulders'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const draw = (tpl: any, coordinates: Array<{ x: number, y: number }>, extendData?: unknown): any[] =>
  tpl.createPointFigures({ coordinates, bounding: { width: 100, height: 100 }, overlay: { id: 'a', extendData, points: coordinates.map((p) => ({ value: -p.y })) } })

const c5 = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 10, y: i % 2 === 0 ? 50 : 10 }))
const c3 = c5.slice(0, 4)
const texts = (figs: any[]): string[] => figs.filter((f) => f.type === 'text').map((f) => f.attrs.text)

describe('fiveWaves and threeWaves degree', () => {
  it('defaults to TV\'s Intermediate degree and its blue, 2 px wave', () => {
    const figs = draw(fiveWaves(), c5)
    expect(texts(figs)).toEqual(['(1)', '(2)', '(3)', '(4)', '(5)'])
    expect(figs[0].styles).toMatchObject({ color: '#3D85C6', size: 2 })
  })
  it('takes the degree as a string index, as the dialog\'s select hands it over', () => {
    expect(texts(draw(fiveWaves(), c5, { degree: '9' }))).toEqual(['i', 'ii', 'iii', 'iv', 'v'])
  })
  it('labels eightWaves and anyWaves with their own sequences', () => {
    const c9 = Array.from({ length: 9 }, (_, i) => ({ x: i * 10, y: i % 2 === 0 ? 50 : 10 }))
    expect(texts(draw(eightWaves(), c9, { degree: 8 }))).toEqual(['1', '2', '3', '4', '5', 'a', 'b', 'c'])
    expect(texts(draw(anyWaves(), c9.slice(0, 4), { degree: 8 }))).toEqual(['1', '2', '3'])
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

describe('pattern fills follow the dialog\'s Background checkbox', () => {
  const c = [0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: i % 2 === 0 ? 50 : 10 }))
  const fill = (tpl: any, style?: string): any => {
    tpl.setProperties(style === undefined ? {} : { style }, 'a')
    return draw(tpl, c).find((f) => f.key === 'fill')
  }
  it('draws xabcd\'s triangles in TV\'s blue, and hides them when style is stroke', () => {
    expect(fill(xabcd()).styles).toMatchObject({ style: 'fill', color: 'rgba(41, 98, 255, 0.15)' })
    expect(fill(xabcd(), 'stroke').styles.color).toBe('transparent')
    expect(fill(xabcd(), 'stroke_fill').styles.color).toBe('rgba(41, 98, 255, 0.15)')
  })
  it('does the same for the tv pattern tools', () => {
    expect(fill(headAndShoulders(), 'stroke').styles.color).toBe('transparent')
  })
})

describe('time cycles background', () => {
  const chart = { getChartStore: () => ({ timestampToDataIndex: (t: number) => t, coordinateToDataIndex: (x: number) => x / 10, dataIndexToCoordinate: (i: number) => i * 10 }) }
  const points = [{ dataIndex: 2, timestamp: 2 }, { dataIndex: 5, timestamp: 5 }]
  const fills = (props: object, extendData?: object): any[] => {
    const tpl = timeCycles()
    tpl.setProperties?.(props as never, 'a')
    const figs = (tpl as any).createPointFigures({ chart, coordinates: [{ x: 20, y: 5 }, { x: 50, y: 5 }], bounding: { width: 100, height: 100 }, overlay: { id: 'a', points, extendData } })
    return figs.filter((f: any) => f.type === 'polygon')
  }
  it('fills with TV\'s colour, alpha included, unless style is stroke', () => {
    expect(fills({})[0].styles.color).toBe('rgba(106, 168, 79, 0.5)')
    expect(fills({ backgroundColor: 'rgba(1, 2, 3, 0.2)' })[0].styles.color).toBe('rgba(1, 2, 3, 0.2)')
    expect(fills({ style: 'stroke' })).toHaveLength(0)
    expect(fills({ style: 'stroke_fill' }, { showBackground: false }).length).toBeGreaterThan(0)
  })
  it('still honours a saved showBackground / backgroundOpacity', () => {
    expect(fills({}, { showBackground: false })).toHaveLength(0)
    expect(fills({ backgroundColor: '#010203' }, { backgroundOpacity: 20 })[0].styles.color).toBe('rgba(1, 2, 3, 0.2)')
  })
})
