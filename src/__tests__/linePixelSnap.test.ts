import { describe, it, expect } from 'vitest'
import { drawLine } from '../extension/figure/line'

// A horizontal or vertical line has to cover whole device pixels. Snapping
// by half a CSS pixel only does that when the pixel ratio is a whole number:
// at 110% browser zoom on a 2x screen (ratio 2.2) a 1px grid line spread over
// three device rows at partial alpha and the chart looked blurry.

interface Stroke { from: { x: number, y: number }, to: { x: number, y: number }, lineWidth: number }

function recordingContext (scaleX: number, scaleY: number = scaleX): { ctx: CanvasRenderingContext2D, strokes: Stroke[] } {
  const strokes: Stroke[] = []
  let from = { x: 0, y: 0 }
  let to = { x: 0, y: 0 }
  const noop = (): void => {}
  const ctx = {
    lineWidth: 1,
    getTransform: () => ({ a: scaleX, d: scaleY }),
    setLineDash: noop,
    beginPath: noop,
    moveTo: (x: number, y: number) => { from = { x, y } },
    lineTo: (x: number, y: number) => { to = { x, y } },
    stroke () { strokes.push({ from, to, lineWidth: (this as { lineWidth: number }).lineWidth }) },
    closePath: noop,
    save: noop,
    restore: noop,
    translate: noop
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes }
}

/** The device rows (or columns) a stroke centred on `centre` covers. */
function deviceSpan (centre: number, lineWidth: number, ratio: number): [number, number] {
  return [centre * ratio - lineWidth * ratio / 2, centre * ratio + lineWidth * ratio / 2]
}

const isWhole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9

describe('axis-aligned lines land on whole device pixels', () => {
  for (const ratio of [1, 1.1, 1.25, 1.5, 2, 2.2, 2.5, 3]) {
    for (const size of [1, 2, 3]) {
      it(`a ${size}px line at ratio ${ratio}`, () => {
        for (const at of [100, 100.3, 257.75, 763.667]) {
          const { ctx, strokes } = recordingContext(ratio)
          drawLine(ctx, [
            { coordinates: [{ x: 0, y: at }, { x: 500, y: at }] },
            { coordinates: [{ x: at, y: 0 }, { x: at, y: 500 }] }
          ], { size })
          const [horizontal, vertical] = strokes
          for (const [s, centre] of [[horizontal, horizontal.from.y], [vertical, vertical.from.x]] as const) {
            const [lo, hi] = deviceSpan(centre, s.lineWidth, ratio)
            expect(isWhole(lo) && isWhole(hi), `${size}px at ${at}, ratio ${ratio}: covers ${lo}..${hi}`).toBe(true)
            expect(hi - lo).toBeGreaterThanOrEqual(1 - 1e-9)
          }
        }
      })
    }
  }

  it('is unchanged on whole ratios with whole coordinates, as before', () => {
    const { ctx, strokes } = recordingContext(2)
    drawLine(ctx, { coordinates: [{ x: 0, y: 100 }, { x: 500, y: 100 }] }, { size: 1 })
    expect(strokes[0].from.y).toBe(100.5)
    expect(strokes[0].lineWidth).toBe(1)
  })

  it('snaps each axis by its own scale', () => {
    // The canvas's backing size is rounded per axis, so its x and y scales differ slightly.
    const { ctx, strokes } = recordingContext(2.20008, 2.1996)
    drawLine(ctx, [
      { coordinates: [{ x: 0, y: 700.2 }, { x: 500, y: 700.2 }] },
      { coordinates: [{ x: 700.2, y: 0 }, { x: 700.2, y: 500 }] }
    ], { size: 1 })
    const [lo, hi] = deviceSpan(strokes[0].from.y, strokes[0].lineWidth, 2.1996)
    expect(isWhole(lo) && isWhole(hi)).toBe(true)
    const [vlo, vhi] = deviceSpan(strokes[1].from.x, strokes[1].lineWidth, 2.20008)
    expect(isWhole(vlo) && isWhole(vhi)).toBe(true)
  })
})
