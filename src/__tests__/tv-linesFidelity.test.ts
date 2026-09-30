import { describe, expect, it, vi } from 'vitest'
import segment from '../extension/overlay/segment'
import horizontalStraightLine from '../extension/overlay/horizontalStraightLine'
import { horizontalLineText, scaleDialogDashes, tvDashedValue, verticalLineText } from '../extension/overlay/tvLine'
import { disjointAngle, flatBottom, trendAngleTool } from '../extension/overlay/tv/linesShapes/lines'

// Text is measured on a canvas, which node does not have: half the font size per character.
vi.mock('../common/utils/canvas', async (original) => ({ ...(await original<object>()), calcTextWidth: (text: string, size = 12) => text.length * size / 2 }))

type Figure = { type: string, key?: string, attrs: Record<string, unknown> & { coordinates?: Array<{ x: number, y: number }>, text?: string }, styles?: Record<string, unknown> }

const store = (hoveredId?: string) => ({
  getHoverOverlayInfo: () => ({ overlay: hoveredId === undefined ? null : { id: hoveredId } }),
  getClickOverlayInfo: () => ({ overlay: null })
})
const chart = (hoveredId?: string) => ({
  getChartStore: () => store(hoveredId),
  getSymbol: () => ({ pricePrecision: 2 }),
  getThousandsSeparator: () => ({ format: (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') }),
  getDecimalFold: () => ({ format: (s: string) => s }),
  getDom: () => null,
  convertFromPixel: (points: Array<{ y: number }>) => points.map((p) => ({ value: 400 - p.y }))
})

describe('dashes scale with the stroke, as in TV', () => {
  it('turns the dialog\'s fixed patterns into TV\'s', () => {
    expect(tvDashedValue([4, 4], 2)).toEqual([10, 12])
    expect(tvDashedValue([1, 3], 2)).toEqual([2, 4])
    expect(tvDashedValue([4, 4], 4)).toEqual([20, 24])
    expect(tvDashedValue(undefined, 1)).toEqual([5, 6])
  })
  it('scales every overlay figure\'s dialog dash, line or border, but not its own patterns', () => {
    expect(scaleDialogDashes({ style: 'dashed', size: 3, dashedValue: [4, 4] }).dashedValue).toEqual([15, 18])
    expect(scaleDialogDashes({ borderStyle: 'dashed', borderSize: 2, borderDashedValue: [1, 3] }).borderDashedValue).toEqual([2, 4])
    expect(scaleDialogDashes({ style: 'dashed', size: 3, dashedValue: [2, 2] }).dashedValue).toEqual([2, 2])
    expect(scaleDialogDashes({ style: 'solid', size: 3, dashedValue: [4, 4] }).dashedValue).toEqual([4, 4])
  })
})

describe('text on horizontal and vertical lines', () => {
  it('runs along the span of the line, and top is above it', () => {
    const at = (h: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom') => horizontalLineText(100, 50, 250, { textAlignHorizontal: h, textAlignVertical: v }, { horizontal: 'center', vertical: 'middle' })
    expect(at('left', 'middle')).toMatchObject({ x: 58, y: 100, align: 'left', baseline: 'middle' })
    expect(at('center', 'top')).toMatchObject({ x: 150, y: 94, baseline: 'bottom' })
    expect(at('right', 'bottom')).toMatchObject({ x: 242, y: 106, align: 'right', baseline: 'top' })
    expect(horizontalLineText(100, 0, 400, {}, { horizontal: 'center', vertical: 'bottom' })).toMatchObject({ x: 200, baseline: 'top' })
  })
  it('turns to read upward: top/middle/bottom along the line, left/centre/right beside it', () => {
    const at = (h: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom') => verticalLineText(100, 400, { textAlignHorizontal: h, textAlignVertical: v }, { horizontal: 'center', vertical: 'middle' })
    expect(at('left', 'top')).toMatchObject({ x: 94, y: 8, angle: -Math.PI / 2, align: 'end', baseline: 'bottom' })
    expect(at('center', 'middle')).toMatchObject({ x: 100, y: 200, align: 'center', baseline: 'middle' })
    expect(at('right', 'bottom')).toMatchObject({ x: 106, y: 392, align: 'start', baseline: 'top' })
  })
  it('leaves a gap in a horizontal line for text that sits on it', () => {
    const template = horizontalStraightLine()
    template.setProperties!({ text: 'x' }, 'h')
    const figures = template.createPointFigures!({
      coordinates: [{ x: 10, y: 50 }], bounding: { width: 200, height: 100 }, overlay: { id: 'h', extendData: undefined },
      chart: chart()
    } as never) as Figure[]
    const text = figures.find((f) => f.type === 'editableText')!
    expect(text.attrs).toMatchObject({ x: 100, y: 50, baseline: 'middle' })
    expect(text.styles).toMatchObject({ color: '#2962FF' })
    // The gap: an 'x' of 12px is 6 wide, so 10 with its margin, taken out of the middle of the line.
    const line = figures.find((f) => f.type === 'line')!
    expect(line.attrs).toEqual([
      { coordinates: [{ x: 0, y: 50 }, { x: 95, y: 50 }] },
      { coordinates: [{ x: 105, y: 50 }, { x: 200, y: 50 }] }
    ])
    // Text above the line leaves it whole.
    const above = horizontalStraightLine()
    above.setProperties!({ text: 'x', textAlignVertical: 'top' }, 'a')
    const kept = above.createPointFigures!({ coordinates: [{ x: 10, y: 50 }], bounding: { width: 200, height: 100 }, overlay: { id: 'a', extendData: undefined }, chart: chart() } as never) as Figure[]
    expect(kept.find((f) => f.type === 'line')!.attrs).toEqual({ coordinates: [{ x: 0, y: 50 }, { x: 200, y: 50 }] })
  })
})

describe('trend line', () => {
  const overlay = (extendData: object, id = 't') => ({
    id, extendData,
    points: [{ value: 100, dataIndex: 10, timestamp: 0 }, { value: 117.63, dataIndex: 85, timestamp: 107 * 86400000 }]
  })
  const draw = (extendData: object, hovered?: string, props: object = {}) => {
    const template = segment()
    template.setProperties!(props, 't')
    return template.createPointFigures!({
      coordinates: [{ x: 100, y: 300 }, { x: 550, y: 60 }], bounding: { width: 1000, height: 600 }, overlay: overlay(extendData), chart: chart(hovered)
    } as never) as Figure[]
  }

  it('ends in an open two-stroke arrowhead of the line\'s colour and width, not a filled triangle', () => {
    const figures = draw({ endCapRight: 'arrow' }, undefined, { lineWidth: 2 })
    expect(figures.filter((f) => f.type === 'polygon')).toEqual([])
    const head = figures.filter((f) => f.type === 'line')[1]
    expect(head.attrs.coordinates).toHaveLength(3)
    expect(head.styles).toMatchObject({ style: 'solid', size: 2 })
  })

  it('dashes like TV: long dashes that grow with the stroke', () => {
    const line = draw({}, undefined, { lineStyle: 'dashed', lineDashedValue: [4, 4], lineWidth: 2 })[0]
    expect(line.styles).toMatchObject({ dashedValue: [10, 12] })
  })

  it('shows the middle point and the stats only for a line that is pointed at', () => {
    const ext = { showMidPoint: true, stats: ['priceRange', 'percentRange', 'pipsChange', 'barsRange', 'timeRange', 'distance', 'angle'] }
    expect(draw(ext).some((f) => f.type === 'circle')).toBe(false)
    expect(draw(ext).some((f) => f.attrs.text?.includes('bars'))).toBe(false)
    const pointed = draw(ext, 't')
    expect(pointed.some((f) => f.type === 'circle')).toBe(true)
    expect(pointed.find((f) => f.attrs.text?.includes('bars'))).toBeDefined()
    // "Always show stats" is statsOnSelect: false.
    expect(draw({ ...ext, statsOnSelect: false }).find((f) => f.attrs.text?.includes('bars'))).toBeDefined()
  })

  it('writes the stats as TV does: 17.63 (11.32%), 1,763 / 75 bars (107d), distance: 510 px / 28 deg', () => {
    const box = draw({ stats: ['priceRange', 'percentRange', 'pipsChange', 'barsRange', 'timeRange', 'distance', 'angle'], statsOnSelect: false })
      .find((f) => typeof f.attrs.text === 'string' && f.attrs.text.includes('bars'))!
    expect(box.attrs.text!.split('\n')).toEqual(['17.63 (17.63%), 1,763', '75 bars (107d), distance: 510 px', '28°'])
  })

  it('writes only what is ticked, joined the way TV joins it', () => {
    const rows = (stats: string[]): string[] => draw({ stats, statsOnSelect: false }).find((f) => typeof f.attrs.text === 'string' && f.type === 'text' && f.attrs.baseline !== 'middle')!.attrs.text!.split('\n')
    expect(rows(['percentRange'])).toEqual(['17.63%'])
    expect(rows(['priceRange', 'pipsChange'])).toEqual(['17.63, 1,763'])
    expect(rows(['timeRange', 'distance'])).toEqual(['107d, distance: 510 px'])
    expect(rows(['barsRange'])).toEqual(['75 bars'])
  })

  it('puts the box on the empty side of the line: under a rising one, its left edge at the anchor the position names', () => {
    const at = (statsPosition: string) => draw({ stats: ['angle'], statsOnSelect: false, statsPosition }).find((f) => f.attrs.text === '28°')!.attrs
    expect(at('left')).toMatchObject({ x: 100, y: 310, align: 'left', baseline: 'top' })
    expect(at('right')).toMatchObject({ x: 550, y: 70 })
    expect(at('center')).toMatchObject({ x: 325, y: 190 })
    expect(at('auto')).toMatchObject({ x: 325 })
  })

  it('labels its price axis in white on the line colour', () => {
    const template = segment()
    const figures = template.createYAxisFigures!({
      chart: chart(), overlay: overlay({ showPriceLabels: true }), coordinates: [{ x: 0, y: 1 }, { x: 0, y: 2 }], bounding: { width: 60 }, yAxis: null
    } as never) as Figure[]
    expect(figures[0].styles).toMatchObject({ color: '#FFFFFF', backgroundColor: '#2962FF' })
  })
})

describe('trend angle', () => {
  it('draws the dotted horizontal the angle is measured from, and keeps its label blue', () => {
    const template = trendAngleTool()
    const figures = template.createPointFigures!({
      coordinates: [{ x: 100, y: 300 }, { x: 400, y: 100 }], bounding: { width: 1000, height: 600 }, overlay: { id: 'a', extendData: undefined, points: [] }, chart: chart()
    } as never) as Figure[]
    expect(figures.find((f) => f.key === 'angleBase')!.attrs.coordinates).toEqual([{ x: 100, y: 300 }, { x: 150, y: 300 }])
    const label = figures.find((f) => f.key === 'angleLabel')!
    expect(label.styles).toMatchObject({ color: '#2962FF' })
    expect(label.attrs.text).toMatch(/°$/)
  })
})

describe('one-sided channels', () => {
  const draw = (make: () => ReturnType<typeof flatBottom>, extendData: object = {}) => {
    const template = make()
    return template.createPointFigures!({
      coordinates: [{ x: 100, y: 300 }, { x: 400, y: 100 }, { x: 400, y: 350 }], bounding: { width: 1000, height: 600 },
      overlay: { id: 'c', extendData, paneId: 'candle_pane' }, chart: chart()
    } as never) as Figure[]
  }
  const by = (figures: Figure[], key: string): Figure => figures.find((f) => f.key === key)!

  it('starts orange (flat) and teal (disjoint), with the fill and the text in the same colour', () => {
    const flat = draw(flatBottom, { showBackground: true })
    expect(by(flat, 'line_0').styles).toMatchObject({ color: '#FF9800' })
    expect(by(flat, 'background').styles).toMatchObject({ color: 'rgba(255, 152, 0, 0.2)' })
    expect(by(flat, 'text').styles).toMatchObject({ color: '#FF9800' })
    expect(by(draw(disjointAngle), 'line_0').styles).toMatchObject({ color: '#089981' })
  })

  it('slopes a disjoint channel\'s second line the opposite way, so the two cross', () => {
    const [, right] = by(draw(disjointAngle), 'line_1').attrs.coordinates!
    const left = by(draw(disjointAngle), 'line_1').attrs.coordinates![0]
    // First line rises 200 over 300; the second ends at y 350 and rises 200 going left.
    expect(right).toEqual({ x: 400, y: 350 })
    expect(left).toEqual({ x: 100, y: 150 })
    expect(by(draw(flatBottom), 'line_1').attrs.coordinates).toEqual([{ x: 100, y: 350 }, { x: 400, y: 350 }])
  })

  it('takes the fill along when extended right, but not when extended left', () => {
    const xs = (extendData: object): number[] => by(draw(flatBottom, extendData), 'background').attrs.coordinates!.map((p) => p.x)
    expect(Math.min(...xs({ extendLeft: true }))).toBe(100)
    expect(Math.max(...xs({ extendRight: true }))).toBe(1000)
    expect(Math.min(...by(draw(flatBottom, { extendLeft: true }), 'line_0').attrs.coordinates!.map((p) => p.x))).toBe(0)
  })

  it('puts an arrow on the ends of both lines when asked', () => {
    const keys = draw(flatBottom, { endCapRight: 'arrow', endCapLeft: 'arrow' }).map((f) => f.key)
    expect(keys.filter((k) => k?.startsWith('head_'))).toHaveLength(4)
  })

  it('writes the price at each end of both lines when Prices is on', () => {
    const figures = draw(flatBottom, { showPrices: true, pricesColor: '#123456', pricesFontSize: 20, pricesBold: true })
    const prices = figures.filter((f) => f.key?.startsWith('price_'))
    expect(prices.map((f) => f.attrs.text)).toEqual(['100.00', '300.00', '50.00', '50.00'])
    expect(prices[0].attrs).toMatchObject({ align: 'right' })
    expect(prices[1].attrs).toMatchObject({ align: 'left' })
    expect(prices[0].styles).toMatchObject({ color: '#123456', size: 20, weight: 'bold' })
    expect(draw(flatBottom).some((f) => f.key?.startsWith('price_'))).toBe(false)
  })
})
