import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Canvas from '../common/Canvas'

// A canvas waits one rendered frame (a feature probe) before it attaches its
// device-pixel ResizeObserver. One destroyed inside that frame, as a pane torn
// down by a market switch can be, used to get the observer attached afterwards
// and never removed, keeping the detached canvas and its backing store alive.
class FakeObserver {
  static all: FakeObserver[] = []
  targets = new Set<unknown>()
  constructor (readonly cb: (entries: unknown[]) => void) { FakeObserver.all.push(this) }
  observe (t: unknown): void { this.targets.add(t) }
  unobserve (t: unknown): void { this.targets.delete(t) }
  disconnect (): void { this.targets.clear() }
}

/** Deliver one frame's resize notifications, as the browser does on render. */
function frame (): void {
  for (const ro of [...FakeObserver.all]) {
    if (ro.targets.size > 0) ro.cb([...ro.targets].map(target => ({ target, devicePixelContentBoxSize: [{ inlineSize: 10, blockSize: 10 }] })))
  }
}

const settle = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }
const live = (): number => FakeObserver.all.filter(ro => ro.targets.size > 0).length

describe('Canvas.destroy', () => {
  beforeEach(() => {
    FakeObserver.all = []
    vi.stubGlobal('ResizeObserver', FakeObserver)
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('document', {
      body: {},
      createElement: () => ({ style: {}, clientWidth: 10, clientHeight: 10, getContext: () => ({ scale () {}, clearRect () {} }) })
    })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('leaves no observer when destroyed before the first frame', async () => {
    const canvas = new Canvas({}, () => {})
    canvas.destroy()
    frame()
    await settle()
    expect(live()).toBe(0)
  })

  it('leaves no observer when destroyed after it attached', async () => {
    const canvas = new Canvas({}, () => {})
    frame()
    await settle()
    expect(live()).toBe(1)
    canvas.destroy()
    expect(live()).toBe(0)
  })
})
