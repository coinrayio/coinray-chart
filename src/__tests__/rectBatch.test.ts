import { describe, it, expect } from 'vitest'
import RectBatch from '../common/RectBatch'

/** Records the calls a batch makes, with the style in force at each paint. */
function recordingContext (): { ctx: CanvasRenderingContext2D, calls: string[] } {
  const calls: string[] = []
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 0 }
  const ctx = {
    set fillStyle (v: string) { state.fillStyle = v },
    set strokeStyle (v: string) { state.strokeStyle = v },
    set lineWidth (v: number) { state.lineWidth = v },
    setLineDash: () => {},
    beginPath: () => { calls.push('begin') },
    rect: (x: number, y: number, w: number, h: number) => { calls.push(`rect ${x},${y},${w},${h}`) },
    fill: () => { calls.push(`fill ${state.fillStyle}`) },
    stroke: () => { calls.push(`stroke ${state.strokeStyle} ${state.lineWidth}`) },
    fillRect: (x: number, y: number, w: number, h: number) => { calls.push(`fillRect ${state.fillStyle} ${x},${y},${w},${h}`) }
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('RectBatch', () => {
  it('fills each colour as one path, layer by layer', () => {
    const batch = new RectBatch()
    batch.fill(1, 'green', { x: 0, y: 0, width: 4, height: 10 })
    batch.fill(0, 'grey', { x: 1, y: 0, width: 1, height: 20 })
    batch.fill(1, 'green', { x: 10, y: 0, width: 4, height: 10 })
    batch.fill(1, 'red', { x: 20, y: 0, width: 4, height: 10 })
    const { ctx, calls } = recordingContext()
    batch.draw(ctx)
    expect(calls).toEqual([
      'begin', 'rect 1,0,1,20', 'fill grey',
      'begin', 'rect 0,0,4,10', 'rect 10,0,4,10', 'fill green',
      'begin', 'rect 20,0,4,10', 'fill red'
    ])
  })

  it('strokes a 1px border on the half pixel, after the layer fills', () => {
    const batch = new RectBatch()
    batch.stroke(0, 'blue', { x: 0, y: 0, width: 5, height: 6 }, 'white')
    batch.fill(0, 'white', { x: 0, y: 0, width: 5, height: 6 })
    const { ctx, calls } = recordingContext()
    batch.draw(ctx)
    expect(calls).toEqual([
      'begin', 'rect 0,0,5,6', 'fill white',
      'begin', 'rect 0.5,0.5,4,5', 'stroke blue 1'
    ])
  })

  it('fills a rect too thin to stroke with its border colour, unless its body is already that colour', () => {
    const batch = new RectBatch()
    batch.stroke(0, 'blue', { x: 0, y: 0, width: 2, height: 9 }, null)
    batch.stroke(0, 'blue', { x: 5, y: 0, width: 2, height: 9 }, 'blue')
    const { ctx, calls } = recordingContext()
    batch.draw(ctx)
    expect(calls).toEqual(['fillRect blue 0,0,2,9'])
  })

  // Zoomed out, a hollow-look candle (body the background colour) vanished:
  // the body filled, the border was dropped as too thin to stroke.
  it('paints the border colour over a thin body of another colour', () => {
    const batch = new RectBatch()
    expect(batch.fill(0, 'black', { x: 0, y: 0, width: 2, height: 9 })).toBe(true)
    batch.stroke(0, 'green', { x: 0, y: 0, width: 2, height: 9 }, 'black')
    const { ctx, calls } = recordingContext()
    batch.draw(ctx)
    expect(calls).toEqual(['begin', 'rect 0,0,2,9', 'fill black', 'fillRect green 0,0,2,9'])
  })

  it('skips transparent colours and reports them as not filled', () => {
    const batch = new RectBatch()
    expect(batch.fill(0, 'transparent', { x: 0, y: 0, width: 4, height: 4 })).toBe(false)
    expect(batch.fill(0, 'rgba(0, 0, 0, 0)', { x: 0, y: 0, width: 4, height: 4 })).toBe(false)
    batch.stroke(0, 'transparent', { x: 0, y: 0, width: 4, height: 4 }, null)
    const { ctx, calls } = recordingContext()
    batch.draw(ctx)
    expect(calls).toEqual([])
  })
})
