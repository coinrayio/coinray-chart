import { describe, it, expect, afterEach, vi } from 'vitest'
import ChartImp from '../Chart'

// `layout()` batches requests into one pass on a microtask, guarded by a
// pending flag. The flag used to be cleared only after a pass that returned,
// and the error was swallowed: one pass that threw left the flag set, every
// later request was skipped, and the chart stopped painting with nothing in
// the console. The crosshair and the DOM legend kept moving over a frozen chart.
const settle = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)) }

function fakeChart (layout: () => void): { layoutPending: () => boolean, request: () => void } {
  const self = { _layoutOptions: {}, _layoutPending: false, _layout: layout }
  return {
    layoutPending: () => self._layoutPending,
    request: () => { ChartImp.prototype.layout.call(self as unknown as ChartImp, { update: true }) }
  }
}

describe('Chart.layout after a pass that throws', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('runs the next pass and reports the error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail = true
    const pass = vi.fn(() => { if (fail) { fail = false; throw new Error('pass failed') } })
    const chart = fakeChart(pass)

    chart.request()
    await settle()
    expect(pass).toHaveBeenCalledTimes(1)
    expect(chart.layoutPending()).toBe(false)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('layout'), expect.objectContaining({ message: 'pass failed' }))

    chart.request()
    await settle()
    expect(pass).toHaveBeenCalledTimes(2)
  })
})
