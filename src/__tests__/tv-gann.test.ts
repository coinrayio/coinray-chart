import { describe, expect, it } from 'vitest'
import { applyLevelOverrides, formatCoeff, GANN_BOX_LEVELS, gannBoxFactories, levelAt } from '../extension/overlay/tv/pitchforkGann/gannBox'
import { gannSquareFactories } from '../extension/overlay/tv/pitchforkGann/gannSquare'

interface Fig { type: string, key: string, attrs: { coordinates?: Array<{ x: number, y: number }> }, styles?: { color?: string } }
const draw = (factory: () => unknown, extendData: unknown, properties?: unknown): Fig[] => {
  const t = factory() as {
    createPointFigures: (a: unknown) => Fig[]
    setProperties: (p: unknown, id: string) => void
  }
  if (properties !== undefined) t.setProperties(properties, 'a')
  return t.createPointFigures({ chart: { getSymbol: () => null }, coordinates: [{ x: 0, y: 0 }, { x: 100, y: 50 }], overlay: { id: 'a', extendData, points: [{ value: 10, dataIndex: 0 }, { value: 5, dataIndex: 20 }] } })
}

describe('tvGannBox', () => {
  it('measures levels from the first point, or the second when reversed', () => {
    expect(levelAt(10, 110, 0.25, false)).toBe(35)
    expect(levelAt(10, 110, 0.25, true)).toBe(85)
  })
  it('draws TV defaults: 7 + 7 lines, 12 bands, 4 labels each', () => {
    const f = draw(gannBoxFactories[0], undefined)
    expect(f.filter((x) => /^[hv]_/.test(x.key))).toHaveLength(14)
    expect(f.filter((x) => x.key.endsWith('Fill_1') || /Fill_/.test(x.key))).toHaveLength(12)
    expect(f.filter((x) => x.type === 'text')).toHaveLength(28)
    expect(f.some((x) => x.key.startsWith('f'))).toBe(false)
  })
  it('fans add four corner lines per level pair, labels can be hidden', () => {
    const f = draw(gannBoxFactories[0], { fans: true, showTopLabels: false, showBottomLabels: false, showLeftLabels: false, showRightLabels: false })
    expect(f.filter((x) => /^f[xy]_/.test(x.key))).toHaveLength(56)
    expect(f.some((x) => x.type === 'text')).toBe(false)
  })
  it('figureLevels override value, colour and visibility by position', () => {
    const custom = [{ value: 0.1, color: '#ff0000', enabled: false }]
    const rows = applyLevelOverrides(GANN_BOX_LEVELS, custom, 0)
    expect(rows[0]).toEqual({ value: 0.1, color: '#ff0000', visible: false })
    expect(rows[1]).toEqual(GANN_BOX_LEVELS[1])
    expect(applyLevelOverrides(GANN_BOX_LEVELS, [], 0)).toBe(GANN_BOX_LEVELS)
    expect(formatCoeff(0.382)).toBe('0.382')
  })
})

describe('gann square level overrides', () => {
  it('hides a grid row and recolours another through figureLevels', () => {
    const base = draw(gannSquareFactories[0], undefined)
    const f = draw(gannSquareFactories[0], undefined, { figureLevels: [{ value: 0, enabled: false }, { value: 0.2, color: '#123456' }] })
    expect(base.some((x) => x.key === 'v_0')).toBe(true)
    expect(f.some((x) => x.key === 'v_0')).toBe(false)
    expect(f.find((x) => x.key === 'v_1')?.styles?.color).toBe('#123456')
  })
})
