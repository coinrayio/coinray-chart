import { describe, expect, it } from 'vitest'
import brush from '../extension/overlay/brush'
import rect from '../extension/overlay/rect'
import curve from '../extension/overlay/curve'
import arrowMarker from '../extension/overlay/arrowMarker'
import { arrowMark } from '../extension/overlay/arrowMark'
import { multiPoint } from '../extension/overlay/polyline'
import { ellipse, doubleCurve } from '../extension/overlay/tv/linesShapes/shapes'
import type { ProOverlayTemplate } from '../extension/overlay/types'

const bounding = { width: 800, height: 400, left: 0, right: 0, top: 0, bottom: 0 }
const run = (tpl: ProOverlayTemplate, coordinates: Array<{ x: number, y: number }>, extendData?: unknown): any[] =>
  tpl.createPointFigures!({ overlay: { id: 'o', extendData, styles: {}, points: [] }, coordinates, bounding } as never) as any[]
const box = [{ x: 100, y: 100 }, { x: 300, y: 200 }]
const stroke = [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }, { x: 150, y: 40 }]

describe('TV defaults are exposed as properties, so the dialog reads what is drawn', () => {
  it.each([
    ['rect', rect(), { borderColor: '#9C27B0', borderWidth: 2, style: 'stroke_fill', textFontSize: 14 }],
    ['brush', brush('brush'), { lineColor: '#00BCD4', lineWidth: 2, style: 'stroke' }],
    ['path', multiPoint('path')(), { lineColor: '#2962FF', lineWidth: 2 }],
    ['polyline', multiPoint('polyline')(), { lineColor: '#00BCD4', style: 'stroke_fill' }],
    ['curve', curve(), { lineColor: '#2962FF', style: 'stroke' }],
    ['doubleCurve', doubleCurve(), { lineColor: '#673AB7', style: 'stroke' }],
    ['ellipse', ellipse(), { borderColor: '#F23645', backgroundColor: 'rgba(242, 54, 69, 0.2)' }],
    ['arrowMarker', arrowMarker(), { backgroundColor: '#1E53E5', textFontSize: 16, textFontWeight: 'bold' }],
    ['arrowMarkDown', arrowMark('down')(), { backgroundColor: '#CC2F3C', textColor: '#CC2F3C', textFontSize: 14 }]
  ])('%s', (_, tpl, expected) => {
    expect(tpl.getProperties!('o')).toMatchObject(expected)
  })

  it('lets a set property win', () => {
    const tpl = rect()
    tpl.setProperties!({ borderColor: '#111111' }, 'o')
    expect(tpl.getProperties!('o')).toMatchObject({ borderColor: '#111111', borderWidth: 2 })
  })
})

describe('rect', () => {
  it('draws the middle line only when asked, styled by its own properties', () => {
    const tpl = rect()
    expect(run(tpl, box).some((f) => f.key === 'middleLine')).toBe(false)
    tpl.setProperties!({ showMiddleLine: true, middleLineColor: '#f00', middleLineWidth: 3 } as never, 'o')
    const middle = run(tpl, box).find((f) => f.key === 'middleLine')
    expect(middle.attrs.coordinates).toEqual([{ x: 100, y: 150 }, { x: 300, y: 150 }])
    expect(middle.styles).toMatchObject({ color: '#f00', size: 3, style: 'dashed' })
  })

  it('aligns text as TV does: horizontally inside the box, vertical Top / Bottom hung outside the opposite edge', () => {
    const tpl = rect()
    expect(run(tpl, box).find((f) => f.type === 'editableText').attrs).toMatchObject({ x: 200, y: 150, align: 'center', baseline: 'middle' })
    tpl.setProperties!({ textAlignHorizontal: 'right', textAlignVertical: 'top' }, 'o')
    expect(run(tpl, box).find((f) => f.type === 'editableText').attrs).toMatchObject({ x: 292, y: 203, align: 'right', baseline: 'top' })
    tpl.setProperties!({ textAlignHorizontal: 'left', textAlignVertical: 'bottom' }, 'o')
    expect(run(tpl, box).find((f) => f.type === 'editableText').attrs).toMatchObject({ x: 108, y: 97, align: 'left', baseline: 'bottom' })
  })
})

describe('background checkbox (style)', () => {
  it('fills a brush stroke and a curve only once style asks for it', () => {
    for (const [tpl, pts] of [[brush('brush'), stroke], [curve(), [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 30 }]]] as const) {
      expect(run(tpl, [...pts]).some((f) => f.key === 'fill' || f.type === 'polygon')).toBe(false)
      tpl.setProperties!({ style: 'stroke_fill' }, 'o')
      expect(run(tpl, [...pts]).some((f) => f.type === 'polygon')).toBe(true)
    }
  })

  it('unfills a closed polyline', () => {
    const tpl = multiPoint('polyline')()
    const triangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }]
    expect(run(tpl, triangle, { closed: true })[0].styles.style).toBe('stroke_fill')
    tpl.setProperties!({ style: 'stroke' }, 'o')
    expect(run(tpl, triangle, { closed: true })[0].styles.style).toBe('stroke')
  })
})

describe('line ends', () => {
  it('put an arrowhead on the ends extendData names, on brush, curve and double curve', () => {
    const three = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 30 }]
    const four = [...three, { x: 70, y: -30 }]
    for (const [tpl, pts] of [[brush('brush'), stroke], [curve(), three], [doubleCurve(), four]] as const) {
      expect(run(tpl, [...pts]).some((f) => f.key?.startsWith('head'))).toBe(false)
      const keys = run(tpl, [...pts], { endCapLeft: 'arrow', endCapRight: 'arrow' }).map((f) => f.key)
      expect(keys).toContain('head_start')
      expect(keys).toContain('head_end')
    }
  })
})

describe('line end arrows are TV\'s open head, not a filled triangle', () => {
  it('draws two barbs at 45 degrees, 7.5 px per pixel of width, on the path\'s last segment', () => {
    const tpl = multiPoint('path')()
    const figures = run(tpl, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])
    const head = figures.find((f) => f.key === 'head_end')
    expect(head.type).toBe('line')
    const [a, tip, b] = head.attrs.coordinates
    expect(tip).toEqual({ x: 100, y: 100 })
    // heading down (+y): the barbs sit up-left and up-right of the tip, 15 px long at width 2
    expect(Math.hypot(a.x - tip.x, a.y - tip.y)).toBeCloseTo(15)
    expect([a.x, b.x].sort((p, q) => p - q)).toEqual([expect.closeTo(100 - 15 * Math.SQRT1_2), expect.closeTo(100 + 15 * Math.SQRT1_2)])
    expect(a.y).toBeCloseTo(100 - 15 * Math.SQRT1_2)
    expect(b.y).toBeCloseTo(100 - 15 * Math.SQRT1_2)
    expect(run(tpl, [{ x: 0, y: 0 }, { x: 100, y: 0 }], { endCapRight: 'normal' }).some((f) => f.key === 'head_end')).toBe(false)
  })
})

describe('extend left / right on curves', () => {
  it('runs the curve on past its ends along its own parabola', () => {
    const pts = [{ x: 300, y: 200 }, { x: 500, y: 200 }, { x: 400, y: 260 }]
    const plain = run(curve(), pts).find((f) => f.key === 'curve').attrs.coordinates
    const both = run(curve(), pts, { extendLeft: true, extendRight: true }).find((f) => f.key === 'curve').attrs.coordinates
    expect(both.length).toBeGreaterThan(plain.length)
    const off = (p: { x: number, y: number }): boolean => p.x < 0 || p.x > 800 || p.y < 0 || p.y > 400
    expect(off(both[0])).toBe(true)
    expect(off(both[both.length - 1])).toBe(true)
    const right = run(curve(), pts, { extendRight: true }).find((f) => f.key === 'curve').attrs.coordinates
    expect(right[0]).toEqual(plain[0])
  })

  it('draws a straight ray on a double curve', () => {
    const pts = [{ x: 300, y: 200 }, { x: 500, y: 200 }, { x: 350, y: 260 }, { x: 450, y: 140 }]
    const line = run(doubleCurve(), pts, { extendRight: true }).find((f) => f.key === 'curve').attrs.coordinates
    const last = line[line.length - 1]
    expect(last.x).toBeGreaterThan(800)
  })
})

describe('arrow mark', () => {
  it('is TV\'s size: 21 px across the head, 22 tall', () => {
    const up = run(arrowMark('up')(), [{ x: 100, y: 100 }]).find((f) => f.key === 'arrow').attrs.coordinates
    const xs = up.map((p: { x: number }) => p.x)
    const ys = up.map((p: { y: number }) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(21)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(22)
  })
})

describe('ellipse', () => {
  it('carries a centred label once its third point is placed', () => {
    const tpl = ellipse()
    tpl.setProperties!({ text: 'hi', textFontStyle: 'italic' }, 'o')
    const label = run(tpl, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 30 }]).find((f) => f.type === 'editableText')
    expect(label.attrs).toMatchObject({ x: 50, y: 0, text: 'hi' })
    expect(label.styles).toMatchObject({ fontStyle: 'italic', color: '#F23645', size: 14 })
  })
})
