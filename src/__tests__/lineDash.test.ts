import { describe, it, expect } from 'vitest'
import { drawLine } from '../extension/figure/line'

/** A context that keeps only the dash pattern, the state under test. */
function dashContext (initial: number[]): { ctx: CanvasRenderingContext2D, dash: () => number[] } {
  let dash = initial
  const noop = (): void => {}
  const ctx = {
    setLineDash: (v: number[]) => { dash = v },
    getLineDash: () => dash,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    closePath: noop,
    save: noop,
    restore: noop,
    translate: noop
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, dash: () => dash }
}

const coordinates = [{ x: 0, y: 0 }, { x: 10, y: 10 }]

describe('drawLine dash state', () => {
  it('leaves the context solid after a dashed line', () => {
    const { ctx, dash } = dashContext([])
    drawLine(ctx, { coordinates }, { style: 'dashed', dashedValue: [4, 4] })
    expect(dash()).toEqual([])
  })

  it('draws a solid line solid, whatever dash it inherits', () => {
    const { ctx, dash } = dashContext([4, 4])
    drawLine(ctx, { coordinates }, { style: 'solid' })
    expect(dash()).toEqual([])
  })
})
