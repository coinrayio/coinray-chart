import { describe, it, expect, vi } from 'vitest'
import text from '../extension/overlay/text'
import callout from '../extension/overlay/callout'
import note from '../extension/overlay/note'
import priceNote from '../extension/overlay/priceNote'
import signpost from '../extension/overlay/signpost'
import anchoredText from '../extension/overlay/tv/annotations/anchoredText'
import anchoredNote from '../extension/overlay/tv/annotations/anchoredNote'

vi.mock('../common/utils/canvas', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  calcTextWidth: (t: string) => t.length * 7
}))

const bounding = { width: 800, height: 400, left: 0, right: 0, top: 0, bottom: 0 }
const chart = {
  getSymbol: () => null,
  getChartStore: () => ({
    getHoverOverlayInfo: () => ({ overlay: { id: 'o' } }),
    getClickOverlayInfo: () => ({ overlay: null })
  })
}
const run = (tpl: any, extendData: unknown, coordinates: any[], styles: unknown = {}): any[] =>
  tpl.createPointFigures({ overlay: { id: 'o', extendData, styles, points: [{ value: 1 }] }, coordinates, bounding, chart })
const at = [{ x: 100, y: 100 }]

describe('settings-dialog flags and defaults', () => {
  it('text: the background flag draws a filled box, off by default; wrap uses TV\'s width', () => {
    expect(run(text, { text: 'hi' }, at).map(f => f.type)).toEqual(['editableText'])
    const figs = run(text, { text: 'hi', backgroundVisible: true, wordWrap: true }, at)
    expect(figs.map(f => f.type)).toEqual(['rect', 'editableText'])
    expect(figs[0].styles).toMatchObject({ style: 'fill', color: 'rgba(91, 133, 191, 0.3)', borderSize: 0 })
    expect(figs[1].attrs).toMatchObject({ wrap: true, width: 200 + 2 * (14 / 6) })
    expect(figs[1].styles.color).toBe('#2962FF')
  })

  it('text: the border flag wins over a saved colour', () => {
    const figs = run(text, { text: 'hi', borderVisible: false, borderColor: '#f00' }, at)
    expect(figs.map(f => f.type)).toEqual(['editableText'])
  })

  it('anchored text: draws its background and border boxes, which it never used to', () => {
    const plain = run(anchoredText, { text: 'hi' }, at)
    expect(plain.map(f => f.type)).toEqual(['editableText'])
    const figs = run(anchoredText, { text: 'hi', backgroundVisible: true, borderVisible: true, wordWrap: true }, at)
    expect(figs.map(f => f.type)).toEqual(['rect', 'editableText'])
    expect(figs[0].styles).toMatchObject({ style: 'stroke_fill', borderColor: '#667b8b', borderSize: 1 })
    expect(figs[1].attrs).toMatchObject({ wrap: true, width: 200 })
    // Saved charts carry a colour, not a flag.
    expect(run(anchoredText, { text: 'hi', backgroundColor: '#0f0' }, at)[0].styles.color).toBe('#0f0')
  })

  it('note: the anchored note\'s pin and tooltip at a bar and price, so its point still drags', () => {
    const one = (d: unknown) => run(note, d, at)
    // (This suite's chart always reports the note hovered, so the tooltip shows.)
    const kinds = ['polygon', 'editableText', 'circle', 'polygon', 'circle']
    expect(one({ text: 'x' }).map(f => f.type)).toEqual(kinds)
    expect(one({ text: 'x' }).some(f => f.noTranslate === true)).toBe(false)
    expect(run(anchoredNote, { text: 'x' }, at).every(f => f.noTranslate === true)).toBe(true)
    // A saved two-point note keeps its first point as the pin.
    expect(run(note, { text: 'x' }, [at[0], { x: 200, y: 200 }]).map(f => f.type)).toEqual(kinds)
    // A note saved before the merge called its marker colour lineColor.
    expect(one({ lineColor: '#123456' }).find(f => f.type === 'circle').styles.color).toBe('#123456')
  })

  it('note: TV\'s fill and no border, and the tooltip only while hovered', () => {
    const tip = (d: unknown) => run(note, d, at).find(f => f.type === 'polygon' && f.styles.style === 'stroke_fill')
    expect(tip({ text: 'x' }).styles).toMatchObject({ color: '#2a2e39', borderSize: 0 })
    expect(tip({ backgroundVisible: false, borderVisible: true }).styles).toMatchObject({ color: 'transparent', borderColor: '#434651', borderSize: 1 })
  })

  it('anchored note: fill on, border off by default', () => {
    const poly = (d: unknown) => run(anchoredNote, d, at).find(f => f.type === 'polygon' && f.styles.style === 'stroke_fill')
    expect(poly({ text: 'x' }).styles).toMatchObject({ color: '#2a2e39', borderSize: 0 })
    expect(poly({ text: 'x', borderVisible: true, backgroundVisible: false }).styles).toMatchObject({ color: 'transparent', borderSize: 1 })
  })

  it('callout: TV\'s teal and a border width that follows the style', () => {
    const bubble = (styles: unknown) => run(callout, { text: 'hi' }, [at[0], { x: 300, y: 200 }], styles).find(f => f.type === 'polygon')
    expect(bubble({}).styles).toMatchObject({ color: 'rgba(0, 151, 167, 0.7)', borderColor: 'rgba(0, 151, 167, 1)', borderSize: 2 })
    expect(bubble({ polygon: { borderSize: 5 } }).styles.borderSize).toBe(5)
  })

  it('price note: the line text carries its own style, apart from the label', () => {
    const figs = run(priceNote, { lineText: 'x', lineTextVisible: true, lineTextSize: 20, lineTextBold: true, lineTextItalic: true, fontSize: 12 }, [at[0], { x: 300, y: 200 }])
    const line = figs.find(f => f.type === 'editableText')
    expect(line.styles).toMatchObject({ size: 20, weight: 'bold', fontStyle: 'italic', color: '#2962ff' })
    const label = figs.find(f => f.type === 'text')
    expect(label.styles).toMatchObject({ size: 12, color: '#ffffff' })
  })

  it('price note: TV\'s label at both points, the line text off until its checkbox is on', () => {
    const figs = run(priceNote, { lineText: 'x' }, [at[0], { x: 300, y: 200 }])
    expect(figs.filter(f => f.type === 'text')).toHaveLength(2)
    expect(figs.some(f => f.type === 'editableText')).toBe(false)
    const on = run(priceNote, { lineText: 'x', lineTextVisible: true }, [at[0], { x: 300, y: 200 }])
    const t = on.find(f => f.type === 'editableText')
    // Down-right line: the text hangs below it, i.e. towards the lower left.
    expect(t.attrs.y).toBeGreaterThan((100 + 200) / 2)
    expect(t.attrs.x).toBeLessThan((100 + 300) / 2 + 40)
  })

  it('text: the box\'s top-left corner sits on the point, as in TV', () => {
    const t = run(text, { text: 'hi' }, at).find(f => f.type === 'editableText')
    expect(t.attrs).toMatchObject({ x: 100, y: 100, align: 'left', baseline: 'top' })
  })

  it('signpost: TV\'s wrapped, bordered label and a disc pin between it and the pole', () => {
    const long = 'Sample text that is quite long and should wrap around somewhere'
    const figs = (signpost as any).createPointFigures({
      overlay: { id: 'o', extendData: { text: long, emojiEnabled: true, emojiRingColor: '#123456' }, styles: {}, points: [{ value: 1 }] },
      coordinates: [{ x: 200, y: 100 }], bounding, chart: { getDataList: () => [] }, yAxis: null
    }) as any[]
    const label = figs.find(f => f.type === 'editableText')
    expect(label.attrs.wrap).toBe(true)
    expect(label.styles.color).toBe('#d1d4dc')
    expect(figs.some(f => f.type === 'rect' && f.styles.borderColor === '#2a2e39')).toBe(true)
    const pin = figs.find(f => f.type === 'circle')
    expect(pin.attrs.r).toBe(35)
    expect(pin.styles).toMatchObject({ style: 'fill', color: '#123456' })
  })
})
