import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Canvas from '../common/Canvas'

// The canvas's backing store holds whole device pixels, so at a fractional
// ratio it cannot be exactly CSS size × ratio: a 1545px chart at 125% browser
// zoom on a 2x screen (ratio 2.5) is 3862.5 device pixels and gets 3862.
// Scaling the context by backing / CSS size (2.4997) instead of the ratio drew
// everything up to half a device pixel off the grid the candles and lines are
// rounded to (that uses the ratio), so their edges went soft. Widths whose
// product with the ratio is whole (110%, 120% for that chart) stayed sharp.
class FakeObserver {
  static all: FakeObserver[] = []
  targets = new Set<unknown>()
  constructor (readonly cb: (entries: unknown[]) => void) { FakeObserver.all.push(this) }
  observe (t: unknown): void { this.targets.add(t) }
  unobserve (t: unknown): void { this.targets.delete(t) }
  disconnect (): void { this.targets.clear() }
}

const RATIO = 2.5

interface Call { name: string, args: number[] }

let element: { style: Record<string, string>, clientWidth: number, clientHeight: number, width: number, height: number, ownerDocument: unknown, getContext: () => unknown }
let calls: Call[] = []
let frames: Array<() => void> = []
/** The device-pixel box the browser reports: its own rounding of the CSS box. */
let deviceBox = { inlineSize: 0, blockSize: 0 }

function notifyResize (): void {
  for (const ro of [...FakeObserver.all]) {
    if (ro.targets.size === 0) continue
    ro.cb([...ro.targets].map(target => ({ target, devicePixelContentBoxSize: [deviceBox] })))
  }
}

function runFrame (): void {
  const queued = frames
  frames = []
  for (const cb of queued) cb()
}

const settle = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }

function recorder (): unknown {
  const rec = (name: string) => (...args: number[]) => { calls.push({ name, args }) }
  return { scale: rec('scale'), setTransform: rec('setTransform'), clearRect: rec('clearRect'), save: rec('save'), restore: rec('restore') }
}

async function sized (cssWidth: number, cssHeight: number, clientWidth: number, clientHeight: number): Promise<void> {
  const canvas = new Canvas({}, () => {})
  element.clientWidth = clientWidth
  element.clientHeight = clientHeight
  deviceBox = { inlineSize: Math.floor(cssWidth * RATIO), blockSize: Math.floor(cssHeight * RATIO) }
  notifyResize()
  await settle()
  calls = []
  canvas.update(cssWidth, cssHeight)
  notifyResize()
  runFrame()
}

describe('Canvas context scale', () => {
  beforeEach(() => {
    FakeObserver.all = []
    frames = []
    calls = []
    element = { style: {}, clientWidth: 0, clientHeight: 0, width: 0, height: 0, ownerDocument: { defaultView: { devicePixelRatio: RATIO } }, getContext: recorder }
    vi.stubGlobal('ResizeObserver', FakeObserver)
    vi.stubGlobal('window', {
      requestAnimationFrame: (cb: () => void) => { frames.push(cb); return frames.length },
      devicePixelRatio: RATIO
    })
    vi.stubGlobal('document', { body: {}, createElement: () => element })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('is the device pixel ratio when the backing size had to round', async () => {
    await sized(1545, 916.3, 1545, 916)
    expect(element.width).toBe(3862)
    const scale = calls.filter(c => c.name === 'scale').at(-1)
    expect(scale?.args).toEqual([RATIO, RATIO])
  })

  it('is the device pixel ratio at a fractional pane height', async () => {
    // clientHeight reads 764 for a 763.667px pane
    await sized(383, 763.6666666666666, 383, 764)
    const scale = calls.filter(c => c.name === 'scale').at(-1)
    expect(scale?.args).toEqual([RATIO, RATIO])
  })

  it('clears every backing pixel before drawing', async () => {
    // clientWidth rounds down for a 383.4px canvas, so clearing that many CSS
    // pixels left the last device column holding the previous frame.
    await sized(383.4, 100, 383, 100)
    const clears = calls.filter(c => c.name === 'clearRect')
    expect(clears.length).toBeGreaterThan(0)
    const [x, y, w, h] = clears[clears.length - 1].args
    const setIdentity = calls.findIndex(c => c.name === 'setTransform' && c.args.join() === '1,0,0,1,0,0')
    expect(setIdentity).toBeGreaterThanOrEqual(0)
    expect([x, y, w, h]).toEqual([0, 0, element.width, element.height])
  })
})
