import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventHandlerImp from '../common/EventHandler'

// A finger never lands twice on the same pixel, and it wobbles a few pixels
// while it is down. A double-tap has to survive both, as Android's touch slop
// (8dp) and iOS's tap tolerance (about 10pt) do, or it only works when both
// taps land dead still on the same spot.

type Listener = (event: unknown) => void

class FakeTarget {
  private readonly _listeners = new Map<string, Listener[]>()
  addEventListener (type: string, fn: Listener): void {
    this._listeners.set(type, [...(this._listeners.get(type) ?? []), fn])
  }

  removeEventListener (type: string, fn: Listener): void {
    this._listeners.set(type, (this._listeners.get(type) ?? []).filter((f) => f !== fn))
  }

  dispatch (type: string, event: unknown): void {
    for (const fn of [...(this._listeners.get(type) ?? [])]) fn(event)
  }
}

// Fresh per test: the handler binds its listeners and cannot take them all off again.
let root = new FakeTarget()
let target = new FakeTarget()
function freshDom (): void {
  root = new FakeTarget()
  const doc = Object.assign(new FakeTarget(), { documentElement: root })
  target = Object.assign(new FakeTarget(), {
    ownerDocument: doc,
    contains: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  })
}

let now = 0
const touch = (x: number, y: number) => ({ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y })
const touchEvent = (type: string, x: number, y: number) => {
  const t = touch(x, y)
  return { type, timeStamp: now, cancelable: false, changedTouches: [t], touches: type === 'touchend' ? [] : [t], preventDefault: () => {} }
}

/** A tap at (x, y) whose finger drifts by `wobble` px while down. */
function tap (x: number, y: number, wobble = 0): void {
  target.dispatch('touchstart', touchEvent('touchstart', x, y))
  if (wobble > 0) root.dispatch('touchmove', touchEvent('touchmove', x + wobble, y))
  now += 80
  vi.advanceTimersByTime(80)
  root.dispatch('touchend', touchEvent('touchend', x + wobble, y))
}

function pause (ms: number): void {
  now += ms
  vi.advanceTimersByTime(ms)
}

describe('double-tap', () => {
  let doubleTaps = 0
  let handler: EventHandlerImp

  beforeEach(() => {
    vi.useFakeTimers()
    freshDom()
    doubleTaps = 0
    handler = new EventHandlerImp(target as unknown as HTMLElement, {
      tapEvent: () => true,
      doubleTapEvent: () => { doubleTaps++; return true },
      touchMoveEvent: () => true,
    }, { treatVertDragAsPageScroll: () => false, treatHorzDragAsPageScroll: () => false, isOverlayDrawing: () => false })
  })

  afterEach(() => {
    handler.destroy()
    vi.useRealTimers()
  })

  it('fires for two still taps on the same spot', () => {
    tap(100, 100)
    pause(120)
    tap(100, 100)
    expect(doubleTaps).toBe(1)
  })

  it('fires when the finger wobbles a few pixels during a tap', () => {
    tap(100, 100, 7)
    pause(120)
    tap(102, 101, 6)
    expect(doubleTaps).toBe(1)
  })

  it('fires when the second tap lands a fingertip away from the first', () => {
    tap(100, 100)
    pause(120)
    tap(118, 112)
    expect(doubleTaps).toBe(1)
  })

  it('fires for a relaxed double-tap, not only a quick one', () => {
    tap(100, 100)
    pause(300)
    tap(100, 100)
    expect(doubleTaps).toBe(1)
  })

  it('does not fire for a drag followed by a tap', () => {
    tap(100, 100, 40)
    pause(120)
    tap(140, 100)
    expect(doubleTaps).toBe(0)
  })

  it('does not fire for two taps far apart', () => {
    tap(100, 100)
    pause(120)
    tap(200, 100)
    expect(doubleTaps).toBe(0)
  })

  it('does not fire for two taps too far apart in time', () => {
    tap(100, 100)
    pause(700)
    tap(100, 100)
    expect(doubleTaps).toBe(0)
  })
})
