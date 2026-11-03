import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Canvas from '../common/Canvas'

// A resize is applied inside the next animation frame. When a redraw was
// already waiting for that frame, the resize used to be dropped: the canvas
// kept its old backing size, and since it now believed it had the old size,
// every later `update` with the new size waited for a ResizeObserver
// notification that never came again. The canvas never painted again: a chart
// moved into a smaller multi-chart cell froze on its last frame.
class FakeObserver {
  static all: FakeObserver[] = []
  targets = new Set<unknown>()
  constructor (readonly cb: (entries: unknown[]) => void) { FakeObserver.all.push(this) }
  observe (t: unknown): void { this.targets.add(t) }
  unobserve (t: unknown): void { this.targets.delete(t) }
  disconnect (): void { this.targets.clear() }
}

interface FakeCanvasElement { style: Record<string, string>, clientWidth: number, clientHeight: number, width: number, height: number, ownerDocument: unknown, getContext: () => unknown }

let element: FakeCanvasElement
let frames: Array<() => void> = []

/** The browser's resize notifications for this render, at the element's current size. */
function notifyResize (): void {
  for (const ro of [...FakeObserver.all]) {
    if (ro.targets.size === 0) continue
    ro.cb([...ro.targets].map(target => ({
      target,
      devicePixelContentBoxSize: [{ inlineSize: element.clientWidth, blockSize: element.clientHeight }]
    })))
  }
}

function runFrame (): void {
  const queued = frames
  frames = []
  for (const cb of queued) cb()
}

const settle = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }

describe('Canvas resize while a redraw is pending', () => {
  beforeEach(() => {
    FakeObserver.all = []
    frames = []
    element = { style: {}, clientWidth: 1973, clientHeight: 100, width: 0, height: 0, ownerDocument: { defaultView: { devicePixelRatio: 1 } }, getContext: () => ({ scale () {}, clearRect () {} }) }
    vi.stubGlobal('ResizeObserver', FakeObserver)
    vi.stubGlobal('window', {
      requestAnimationFrame: (cb: () => void) => { frames.push(cb); return frames.length },
      devicePixelRatio: 1
    })
    vi.stubGlobal('document', { body: {}, createElement: () => element })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('applies the resize and keeps painting', async () => {
    const draw = vi.fn()
    const canvas = new Canvas({}, draw)
    // The feature probe, then the canvas's own observer reporting its first size.
    notifyResize()
    await settle()
    notifyResize()
    runFrame()
    expect(element.width).toBe(1973)

    // A redraw is requested, and before its frame the cell shrinks.
    canvas.update(1973, 100)
    element.clientWidth = 952
    notifyResize()
    runFrame()
    expect(element.width).toBe(952)

    // The chart keeps drawing at the new size.
    draw.mockClear()
    canvas.update(952, 100)
    runFrame()
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('keeps painting at a fractional pane height', async () => {
    // Panes split the chart into fractional heights (763.667 next to 83.333).
    // The element reports its size rounded (764), so comparing against that
    // saw a resize on every update and never drew again.
    const draw = vi.fn()
    const canvas = new Canvas({}, draw)
    notifyResize()
    await settle()
    notifyResize()
    runFrame()

    element.clientWidth = 383
    element.clientHeight = 764
    canvas.update(383, 763.6666666666666)
    notifyResize()
    runFrame()

    draw.mockClear()
    canvas.update(383, 763.6666666666666)
    runFrame()
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('draws at a new size even when the device-pixel size does not change', async () => {
    // A size change that rounds to the same device pixels gets no resize
    // notification at all, so the redraw cannot wait for one.
    const draw = vi.fn()
    const canvas = new Canvas({}, draw)
    notifyResize()
    await settle()
    notifyResize()
    runFrame()

    draw.mockClear()
    canvas.update(1973, 100.2)
    runFrame()
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('is not frozen by a draw that throws once', async () => {
    let fail = true
    const draw = vi.fn(() => { if (fail) { fail = false; throw new Error('draw failed') } })
    const canvas = new Canvas({}, draw)
    notifyResize()
    await settle()
    notifyResize()
    expect(() => { runFrame() }).toThrow('draw failed')

    canvas.update(1973, 100)
    runFrame()
    expect(draw).toHaveBeenCalledTimes(2)
  })
})
