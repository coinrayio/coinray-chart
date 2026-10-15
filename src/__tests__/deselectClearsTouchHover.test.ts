import { describe, expect, it, vi } from 'vitest'
import ChartStore from '../Store'

// Handles are drawn for the clicked overlay and for the hovered one. A
// mouse moves off a drawing before it clicks elsewhere, so its hover has
// already moved on; a finger doesn't — a tap is a click with no move before
// it — so the drawing it last touched stays "hovered", and once it is
// deselected it keeps its handles with nothing selected. The deselect takes
// that leftover hover with it.

const none = { paneId: 'candle_pane', overlay: null, figureType: 'none', figureIndex: -1, figure: null }

describe('ChartStore.setClickOverlayInfo', () => {
  const setup = (hovered: { id: string } | null) => {
    const a = { id: 'a' }
    // The real Store bookkeeping, on a bare object: no canvas needed.
    const store = Object.assign(Object.create(ChartStore.prototype) as object, {
      _chart: { updatePane: vi.fn() },
      _clickOverlayInfo: { paneId: 'candle_pane', overlay: a, figureType: 'line', figureIndex: 0, figure: null },
      _hoverOverlayInfo: hovered === null ? { ...none } : { paneId: 'candle_pane', overlay: hovered, figureType: 'line', figureIndex: 0, figure: null },
    }) as unknown as ChartStore
    return { store, a }
  }

  it('drops the hover a tap left on the drawing it deselects', () => {
    const { store, a } = setup(null)
    ;(store as unknown as { _hoverOverlayInfo: object })._hoverOverlayInfo = { paneId: 'candle_pane', overlay: a, figureType: 'line', figureIndex: 0, figure: null }
    store.setClickOverlayInfo({ ...none } as never, () => false, () => false)
    expect(store.getHoverOverlayInfo().overlay).toBeNull()
  })

  it('drops it when the tap selects another drawing too', () => {
    const { store, a } = setup(null)
    ;(store as unknown as { _hoverOverlayInfo: object })._hoverOverlayInfo = { paneId: 'candle_pane', overlay: a, figureType: 'line', figureIndex: 0, figure: null }
    store.setClickOverlayInfo({ paneId: 'candle_pane', overlay: { id: 'b' }, figureType: 'line', figureIndex: 0, figure: null } as never, () => false, () => false)
    expect(store.getHoverOverlayInfo().overlay).toBeNull()
  })

  it('leaves a mouse hover on another drawing alone', () => {
    const b = { id: 'b' }
    const { store } = setup(b)
    store.setClickOverlayInfo({ ...none } as never, () => false, () => false)
    expect(store.getHoverOverlayInfo().overlay).toBe(b)
  })
})
