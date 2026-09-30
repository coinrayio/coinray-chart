import { describe, it, expect, vi } from 'vitest'
import text from '../extension/overlay/text'
import callout from '../extension/overlay/callout'
import anchoredNote from '../extension/overlay/tv/annotations/anchoredNote'
import { glyphFigure, rotatePath } from '../extension/overlay/emojiGlyph'

vi.mock('../common/utils/canvas', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  calcTextWidth: (text: string) => text.length * 7
}))


const bounding = { width: 800, height: 400, left: 0, right: 0, top: 0, bottom: 0 }
const chart = (hover?: string, click?: string) => ({
  getChartStore: () => ({
    getHoverOverlayInfo: () => ({ overlay: hover === undefined ? null : { id: hover } }),
    getClickOverlayInfo: () => ({ overlay: click === undefined ? null : { id: click } })
  })
})
const run = (tpl: any, extendData: unknown, coordinates: any[], ch: unknown = chart()): any[] =>
  tpl.createPointFigures({ overlay: { id: 'o', extendData, styles: {}, points: [] }, coordinates, bounding, chart: ch })

describe('text overlay', () => {
  it('stays a bare editableText by default', () => {
    const figs = run(text, { text: 'hello' }, [{ x: 100, y: 100 }])
    expect(figs.map(f => f.type)).toEqual(['editableText'])
    expect(figs[0].attrs.wrap).toBeUndefined()
  })

  it('draws the border box, wraps at the text width plus padding, and carries italic', () => {
    const figs = run(text, { text: 'hello world', fontSize: 12, drawBorder: true, borderColor: '#f00', wordWrap: true, wordWrapWidth: 40, fontStyle: 'italic' }, [{ x: 100, y: 100 }])
    expect(figs.map(f => f.type)).toEqual(['rect', 'editableText'])
    expect(figs[1].attrs).toMatchObject({ wrap: true, width: 44 })
    expect(figs[1].styles).toMatchObject({ fontStyle: 'italic', paddingLeft: 2 })
    expect(figs[0].attrs.width).toBe(44)
    expect(figs[0].styles.borderColor).toBe('#f00')
  })
})

describe('callout word wrap', () => {
  it('sizes the bubble to the wrap width', () => {
    const figs = run(callout, { text: 'one two three four five six', fontSize: 12, wordWrap: true, wordWrapWidth: 60 }, [{ x: 10, y: 10 }, { x: 200, y: 100 }])
    const t = figs.find(f => f.type === 'editableText')
    expect(t.attrs.wrap).toBe(true)
    const plain = run(callout, { text: 'one two three four five six', fontSize: 12 }, [{ x: 10, y: 10 }, { x: 200, y: 100 }])
    expect(t.attrs.height).toBeGreaterThan(plain.find(f => f.type === 'editableText').attrs.height)
  })
})

describe('anchored note tooltip', () => {
  const draw = (ch: unknown): string[] => run(anchoredNote, { text: 'note' }, [{ x: 100, y: 100 }], ch).map(f => f.type)
  it('shows only while hovered or selected', () => {
    // The pin: a disc, a stem, and the eye.
    expect(draw(chart())).toEqual(['circle', 'polygon', 'circle'])
    expect(draw(chart('o'))).toEqual(['polygon', 'editableText', 'circle', 'polygon', 'circle'])
    expect(draw(chart(undefined, 'o'))).toHaveLength(5)
    expect(draw(chart('other'))).toHaveLength(3)
  })
})

describe('icon rotation', () => {
  it('rotates a path about the box centre', () => {
    expect(rotatePath('M12 0L12 12Z', Math.PI / 2)).toBe('M24.00 12.00L12.00 12.00Z')
  })
  it('uses rotatedText for a rotated emoji and leaves upright ones alone', () => {
    expect((glyphFigure({ x: 0, y: 0, value: 'x', size: 10, color: '#000' })).type).toBe('text')
    expect((glyphFigure({ x: 0, y: 0, value: 'x', size: 10, color: '#000', angle: 1 })).type).toBe('rotatedText')
  })
})
