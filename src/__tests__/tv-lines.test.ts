import { describe, expect, it } from 'vitest'
import { channelText } from '../extension/overlay/tv/linesShapes/channelText'
import { timeAxisLabel } from '../extension/overlay/crossLine'
import { priceAxisLabelUnlessOff } from '../extension/overlay/horizontalRayLine'
import parallelChannel from '../extension/overlay/parallelChannel'

const upper = [{ x: 0, y: 10 }, { x: 100, y: 10 }]
const lower = [{ x: 0, y: 50 }, { x: 100, y: 50 }]

describe('channel text', () => {
  it('sits on the line the vertical alignment names, at the horizontal alignment', () => {
    const top = channelText({ textAlignVertical: 'top', textAlignHorizontal: 'left', text: 'a' }, lower, upper)
    expect(top.attrs).toMatchObject({ x: 0, y: 6, baseline: 'bottom', align: 'start', text: 'a' })
    const bottom = channelText({ textAlignVertical: 'bottom', textAlignHorizontal: 'right' }, upper, lower)
    expect(bottom.attrs).toMatchObject({ x: 100, y: 54, baseline: 'top', align: 'end' })
    const middle = channelText({ textAlignVertical: 'middle', textAlignHorizontal: 'center' }, upper, lower)
    expect(middle.attrs).toMatchObject({ x: 50, y: 30, align: 'center' })
  })
})

describe('parallel channel', () => {
  it('draws TV\'s 2px channel, a 1px dashed middle line and its label', () => {
    const template = parallelChannel()
    const overlay = { id: 'c', extendData: undefined }
    const figures = template.createPointFigures!({
      coordinates: [{ x: 10, y: 10 }, { x: 60, y: 20 }, { x: 40, y: 50 }], bounding: { width: 200, height: 100 }, overlay
    } as never) as Array<{ key: string, styles?: Record<string, unknown> }>
    const by = (key: string) => figures.find((f) => f.key === key)!
    expect(by('line_0').styles).toMatchObject({ size: 2 })
    expect(by('midline').styles).toMatchObject({ size: 1, style: 'dashed' })
    expect(by('text')).toBeDefined()
  })
})

describe('axis labels on by default', () => {
  const chart = { getSymbol: () => ({ pricePrecision: 2 }), getDecimalFold: () => ({ format: (s: string) => s }), getThousandsSeparator: () => ({ format: (s: string) => s }), getChartStore: () => ({ getInnerFormatter: () => ({ formatDate: () => 'when' }) }) }
  const params = (extendData?: object) => ({ chart, overlay: { extendData, points: [{ value: 5, timestamp: 1 }] }, coordinates: [{ x: 1, y: 2 }], bounding: { width: 100 }, yAxis: null }) as never
  it('shows the time label unless switched off', () => {
    expect(timeAxisLabel(params())).toHaveLength(1)
    expect(timeAxisLabel(params({ showTimeLabel: false }))).toEqual([])
  })
  it('shows the price label unless switched off', () => {
    expect(priceAxisLabelUnlessOff(params())).toHaveLength(1)
    expect(priceAxisLabelUnlessOff(params({ showPriceLabels: false }))).toEqual([])
  })
})
