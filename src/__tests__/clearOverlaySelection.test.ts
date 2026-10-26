import { describe, expect, it, vi } from 'vitest'
import ChartImp from '../Chart'
import ChartStore from '../Store'

// A programmatic deselect must do what a click on empty space does: drop
// the clicked overlay (the one whose handles are drawn) and fire its
// onDeselected, not only empty the selection set.

describe('Chart.clearOverlaySelection', () => {
  const setup = () => {
    const onDeselected = vi.fn()
    const overlay = { id: 'a', onDeselected }
    const updatePane = vi.fn()
    // The real Store bookkeeping, on a bare object: no canvas needed.
    const store = Object.assign(Object.create(ChartStore.prototype) as object, {
      _chart: { updatePane },
      _clickOverlayInfo: { paneId: 'candle_pane', overlay, figureType: 'line', figureIndex: 0, figure: null },
      _hoverOverlayInfo: { paneId: 'candle_pane', overlay: null, figureType: 'none', figureIndex: -1, figure: null },
      _selectedOverlayIds: new Set(['a']),
      executeAction: vi.fn(),
    }) as unknown as ChartStore
    // Private fields set on bare objects: typed as the classes only afterwards.
    const chart = Object.assign(Object.create(ChartImp.prototype) as object, { _chartStore: store }) as unknown as ChartImp
    return { chart, store, overlay, onDeselected, updatePane }
  }

  it('drops the clicked overlay and fires its onDeselected', () => {
    const { chart, store, overlay, onDeselected } = setup()
    chart.clearOverlaySelection()
    expect(store.getClickOverlayInfo().overlay).toBeNull()
    expect(onDeselected).toHaveBeenCalledWith(expect.objectContaining({ chart, overlay }))
  })

  it('empties the selection set and repaints', () => {
    const { chart, store, updatePane } = setup()
    chart.clearOverlaySelection()
    expect(store.getSelectedOverlayIds()).toEqual([])
    expect(updatePane).toHaveBeenCalled()
  })
})
