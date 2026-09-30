import { describe, expect, it } from 'vitest'
import fibonacciExtension from '../extension/overlay/fibonacciExtension'
import fibonacciLine from '../extension/overlay/fibonacciLine'
import fibonacciSegment from '../extension/overlay/fibonacciSegment'
import fibonacciCircle from '../extension/overlay/fibonacciCircle'
import fibonacciSpeedResistanceFan from '../extension/overlay/fibonacciSpeedResistanceFan'
import { formatFibRatio } from '../extension/overlay/fibonacciShared'
import { pitchforkFactories } from '../extension/overlay/tv/pitchforkGann/pitchfork'
import { gannSquareFactories } from '../extension/overlay/tv/pitchforkGann/gannSquare'

// What TradingView draws for these tools' settings, checked against its own charts (the numbers are pixels).
interface Fig { type: string, key?: string, attrs: any, styles?: any }
type Coord = { x: number, y: number }

const chart = {
  getDecimalFold: () => ({ format: (v: string) => v }),
  getThousandsSeparator: () => ({ format: (v: string) => v }),
  getSymbol: () => ({ pricePrecision: 2 })
}
// price = 100 - y, so a level's label carries its own y.
const yAxis = { name: 'normal', isInCandle: () => true, convertToPixel: (p: number) => 100 - p, convertFromPixel: (y: number) => 100 - y }
const bounding = { width: 1000, height: 500 }

const draw = (make: () => unknown, coordinates: Coord[], extendData?: unknown, properties?: unknown): Fig[] => {
  const t = make() as { createPointFigures: (a: unknown) => Fig[], setProperties: (p: unknown, id: string) => void }
  if (properties !== undefined) t.setProperties(properties, 'a')
  const points = coordinates.map((c) => ({ value: 100 - c.y, timestamp: c.x }))
  return t.createPointFigures({ coordinates, bounding, chart, yAxis, overlay: { id: 'a', extendData, points } })
}
const one = (figs: Fig[], key: string): Fig => figs.find((f) => f.key === key)!
const labels = (figs: Fig[]): Fig[] => figs.filter((f) => f.type === 'text')

describe('fib level labels', () => {
  it('write ratios the way TV does', () => {
    expect([0, 0.5, 1, 1.618, 4.236].map((v) => formatFibRatio(v, 'values'))).toEqual(['0', '0.5', '1', '1.618', '4.236'])
    expect([0, 0.236, 1].map((v) => formatFibRatio(v, 'percent'))).toEqual(['0.00%', '23.60%', '100.00%'])
  })

  it('carry a level\'s own text: centred on the line by default, joined to the label when they share a spot', () => {
    const two = [{ x: 0, y: 100 }, { x: 100, y: 0 }]
    const props = { figureLevels: [{ value: 0, enabled: true }, { value: 0.5, enabled: true, color: '#4caf50', text: 'Mid' }, { value: 1, enabled: true }] }
    const custom = labels(draw(fibonacciSegment, two, {}, props)).find((t) => t.attrs.key === 'level_0.5_custom')!
    expect(custom.attrs).toMatchObject({ text: 'Mid', x: 50, align: 'center', baseline: 'middle' })
    expect(custom.styles.color).toBe('#4caf50')
    const joined = draw(fibonacciSegment, two, { levelTextAlignHorizontal: 'left' }, { ...props, textAlignVertical: 'middle' })
    expect(labels(joined).find((t) => t.attrs.key === 'level_0.5_text')!.attrs.text).toBe('0.5 (50.00) · Mid')
    expect(labels(joined).some((t) => t.attrs.key === 'level_0.5_custom')).toBe(false)
    expect(labels(draw(fibonacciSegment, two, { showText: false }, props)).some((t) => t.attrs.text.includes('Mid'))).toBe(false)
    expect(labels(draw(fibonacciSegment, two, { showText: false }, props)).length).toBe(3)
  })

  it('take the colour of their own level, on the retracement, extension and channel', () => {
    const two = [{ x: 0, y: 100 }, { x: 100, y: 0 }]
    const three = [{ x: 0, y: 100 }, { x: 50, y: 20 }, { x: 80, y: 60 }]
    for (const figs of [draw(fibonacciSegment, two), draw(fibonacciExtension, three), draw(fibonacciLine, three)]) {
      const text = labels(figs)
      expect(text.length).toBeGreaterThan(5)
      const red = text.find((t) => t.attrs.text.startsWith('0.236'))!
      expect(red.styles.color).toBe('#f23645')
      expect(new Set(text.map((t) => t.styles.color)).size).toBeGreaterThan(3)
    }
  })

  it('put "top" below the line and "bottom" above it, as TV does', () => {
    const two = [{ x: 0, y: 100 }, { x: 100, y: 0 }]
    const at = (v: 'top' | 'middle' | 'bottom') => labels(draw(fibonacciSegment, two, undefined, { textAlignVertical: v }))[0].attrs.baseline
    expect([at('top'), at('middle'), at('bottom')]).toEqual(['top', 'middle', 'bottom'])
  })

  it('the channel prints prices unless they are switched off', () => {
    const three = [{ x: 0, y: 100 }, { x: 100, y: 40 }, { x: 30, y: 70 }]
    const on = labels(draw(fibonacciLine, three, undefined, { figureLevels: [{ value: 0, enabled: true }] }))[0].attrs.text
    expect(on).toMatch(/^0 \(\d/)
    const off = labels(draw(fibonacciLine, three, { showPrices: false }, { figureLevels: [{ value: 0, enabled: true }] }))[0].attrs.text
    expect(off).toBe('0')
    const only = labels(draw(fibonacciLine, three, { showLevels: false }, { figureLevels: [{ value: 0, enabled: true }] }))[0].attrs.text
    expect(only).toMatch(/^\(\d/)
  })

  it('only follow a log scale when the axis is one', () => {
    const two = [{ x: 0, y: 100 }, { x: 100, y: 0 }]
    const y = (axis: string) => {
      const t = fibonacciSegment() as any
      t.setProperties({ figureLevels: [{ value: 0.5, enabled: true }] }, 'a')
      const points = [{ value: 10, timestamp: 0 }, { value: 1000, timestamp: 100 }]
      const figs: Fig[] = t.createPointFigures({
        coordinates: two, bounding, chart, yAxis: { ...yAxis, name: axis, convertToPixel: (p: number) => 100 - Math.log10(p) * 50 },
        overlay: { id: 'a', extendData: { logScale: true }, points }
      })
      return one(figs, 'level_0.5').attrs.coordinates[0].y
    }
    expect(y('normal')).toBe(50)
    expect(y('logarithm')).not.toBe(50)
  })
})

describe('trend-based fib extension', () => {
  const three = [{ x: 0, y: 100 }, { x: 50, y: 20 }, { x: 80, y: 60 }]
  const levels = { figureLevels: [{ value: 0, enabled: true }, { value: 0.5, enabled: true }] }
  it('keeps level 0 on the third anchor and grows the levels the other way when reversed', () => {
    const y = (extendData?: unknown) => {
      const figs = draw(fibonacciExtension, three, extendData, levels)
      return [one(figs, 'level_0').attrs.coordinates[0].y, one(figs, 'level_0.5').attrs.coordinates[0].y]
    }
    expect(y()).toEqual([60, 20])
    expect(y({ reverse: true })).toEqual([60, 100])
  })
})

describe('fib circles', () => {
  it('draw a ring of level L with semi-axes L times half the anchors\' distance, labelled below in the ring\'s colour', () => {
    const figs = draw(fibonacciCircle, [{ x: 100, y: 200 }, { x: 200, y: 100 }], undefined,
      { figureLevels: [{ value: 2, enabled: true, color: '#123456' }] })
    const ring = figs.find((f) => f.type === 'polygon')!.attrs[0].coordinates as Coord[]
    const xs = ring.map((p) => p.x)
    const ys = ring.map((p) => p.y)
    expect(Math.max(...xs) - 150).toBeCloseTo(100)
    expect(Math.max(...ys) - 150).toBeCloseTo(100)
    const label = labels(figs)[0]
    expect(label.styles.color).toBe('#123456')
    expect(label.attrs).toMatchObject({ x: 150, y: 250, text: '2' })
  })
})

describe('fib speed resistance fan', () => {
  const two = [{ x: 100, y: 400 }, { x: 300, y: 100 }]
  const only = { fanPriceLevels: [{ value: 0, enabled: true }, { value: 1, enabled: true }], fanTimeLevels: [{ value: 0, enabled: true }, { value: 1, enabled: true }] }
  const grid = (reverse: boolean) => {
    const figs = draw(fibonacciSpeedResistanceFan, two, { ...only, reverse })
    return figs.find((f) => f.type === 'line' && Array.isArray(f.attrs) && f.attrs[0]?.key?.startsWith('grid'))!.attrs as Array<{ key: string, coordinates: Coord[] }>
  }
  it('measures the levels from the second anchor, and from the first when reversed', () => {
    const g = grid(false)
    expect(g.find((l) => l.key === 'grid_price_0')!.coordinates[0].y).toBe(100)
    expect(g.find((l) => l.key === 'grid_price_1')!.coordinates[0].y).toBe(400)
    expect(g.find((l) => l.key === 'grid_time_0')!.coordinates[0].x).toBe(300)
    const r = grid(true)
    expect(r.find((l) => l.key === 'grid_price_0')!.coordinates[0].y).toBe(400)
    expect(r.find((l) => l.key === 'grid_time_0')!.coordinates[0].x).toBe(100)
  })
  it('price levels are horizontal grid lines and time levels vertical ones', () => {
    const g = grid(false)
    const h = g.find((l) => l.key === 'grid_price_1')!.coordinates
    const v = g.find((l) => l.key === 'grid_time_1')!.coordinates
    expect(h[0].y).toBe(h[1].y)
    expect(v[0].x).toBe(v[1].x)
  })
  it('always radiates from the first anchor, 2px wide', () => {
    const figs = draw(fibonacciSpeedResistanceFan, two, { ...only, reverse: true })
    const ray = figs.find((f) => f.key?.startsWith('price_ray'))!
    expect(ray.attrs.coordinates[0]).toEqual(two[0])
    expect(ray.styles.size).toBe(2)
  })
})

describe('pitchfork', () => {
  it('styles the median (and handle lines) apart from the levels', () => {
    const figs = draw(pitchforkFactories[0], [{ x: 0, y: 100 }, { x: 40, y: 20 }, { x: 60, y: 60 }], undefined, { lineWidth: 6, lineColor: '#00f', lineStyle: 'dashed' })
    expect(one(figs, 'median').styles).toMatchObject({ size: 6, color: '#00f', style: 'dashed' })
    expect(one(figs, 'segment_0').styles).toMatchObject({ size: 6, style: 'dashed' })
    const level = figs.find((f) => f.key?.startsWith('level_'))!
    expect(level.styles).toMatchObject({ size: 2, style: 'solid' })
  })
})

describe('gann square reverse', () => {
  const two = [{ x: 100, y: 300 }, { x: 200, y: 200 }]
  it('puts the origin on the second point', () => {
    for (const make of gannSquareFactories) {
      const start = (extendData?: unknown) => draw(make, two, extendData).find((f) => f.key === 'fan_5')!.attrs.coordinates[0]
      expect(start()).toEqual(two[0])
      expect(start({ reverse: true })).toEqual(two[1])
    }
  })
})
