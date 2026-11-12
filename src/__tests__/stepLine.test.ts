import { describe, it, expect } from 'vitest'
import { extendLine } from '../view/IndicatorView'

describe('step lines', () => {
  it('a plain line goes straight to the next value', () => {
    const line = [{ x: 0, y: 10 }]
    extendLine(line, 8, 10, 20, false)
    expect(line).toEqual([{ x: 0, y: 10 }, { x: 8, y: 20 }])
  })

  it('a step runs flat to the next bar, then rises to its value', () => {
    const line = [{ x: 0, y: 10 }]
    extendLine(line, 8, 10, 20, true)
    expect(line).toEqual([{ x: 0, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 20 }])
  })

  it('a step with no change adds no riser', () => {
    const line = [{ x: 0, y: 10 }]
    extendLine(line, 8, 10, 10, true)
    expect(line).toEqual([{ x: 0, y: 10 }, { x: 8, y: 10 }])
  })

  it('a step whose next bar has no value runs flat to it and stops', () => {
    const line = [{ x: 0, y: 10 }]
    extendLine(line, 8, 10, undefined, true)
    expect(line).toEqual([{ x: 0, y: 10 }, { x: 8, y: 10 }])
  })
})
