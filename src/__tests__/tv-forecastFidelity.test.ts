import { describe, expect, it, vi } from 'vitest'
import type { KLineData } from '../common/Data'
import { position, positionStats } from '../extension/overlay/position'
import { rangeTool } from '../extension/overlay/rangeTools'
import { forecast } from '../extension/overlay/tv/forecastData/forecast'
import { timeSpan, withAlpha } from '../extension/overlay/tv/forecastData/common'
import { buildProfile } from '../extension/overlay/tv/forecastData/volumeProfile'

vi.mock('../common/utils/canvas', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  calcTextWidth: (t: string) => t.length * 7
}))

const bar = (open: number, high: number, low: number, close: number, volume: number, timestamp = 0): KLineData => ({ timestamp, open, high, low, close, volume })
const bounding = { width: 800, height: 400, left: 0, right: 0, top: 0, bottom: 0 }
const fake = (data: KLineData[], active = false): any => ({
  getDataList: () => data,
  convertToPixel: () => ({ y: 120 }),
  getChartStore: () => ({
    getSymbol: () => ({ pricePrecision: 2 }),
    getHoverOverlayInfo: () => ({ overlay: null }),
    getClickOverlayInfo: () => ({ overlay: null }),
    isOverlaySelected: () => active,
    getPeriod: () => ({ type: 'day', span: 1 }),
    getDateTimeFormat: () => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestampToDataIndex: (ts: number) => ts
  })
})

describe('withAlpha and timeSpan', () => {
  it('sets an alpha, and can darken', () => {
    expect(withAlpha('rgba(8, 153, 129, 0.2)', 1)).toBe('rgba(8, 153, 129, 1)')
    expect(withAlpha('#ff9800', 0.5, 0.5)).toBe('rgba(128, 76, 0, 0.5)')
    expect(withAlpha('transparent', 1)).toBe('transparent')
  })
  it('keeps the two largest units', () => {
    expect(timeSpan(36 * 86400000)).toBe('36d')
    expect(timeSpan((86400 + 3 * 3600 + 5 * 60) * 1000)).toBe('1d 3h')
    expect(timeSpan(90 * 60 * 1000)).toBe('1h 30m')
    expect(timeSpan(0)).toBe('0s')
  })
})

describe('long / short position', () => {
  const run = (extendData: unknown, opts: { active?: boolean, lineColor?: string } = {}): any[] => {
    const tpl = position('long')()
    const overlay = { id: 'p', paneId: 'candle_pane', extendData, points: [{ value: 100 }, { value: 90 }, { value: 120 }, { value: 100 }] }
    if (opts.lineColor !== undefined) tpl.setProperties!({ lineColor: opts.lineColor } as any, 'p')
    return tpl.createPointFigures!({ overlay, coordinates: [{ x: 100, y: 200 }, { x: 100, y: 260 }, { x: 100, y: 100 }, { x: 300, y: 200 }], bounding, chart: fake([bar(1, 1, 1, 101, 1)], opts.active) } as any) as any[]
  }
  const keys = (figs: any[]): Array<string | undefined> => figs.map((f) => f.key)

  it('shows its pills only while hovered or selected, unless Always show stats is on (TV\'s default is off)', () => {
    expect(keys(run({}))).not.toContain('target_label')
    expect(keys(run({}, { active: true }))).toEqual(expect.arrayContaining(['target_label', 'stop_label', 'center_label']))
    expect(keys(run({ alwaysShowStats: true }))).toEqual(expect.arrayContaining(['target_label', 'stop_label', 'center_label']))
    expect(keys(run({ alwaysShowStats: false, showLabels: false }, { active: true }))).not.toContain('target_label')
  })

  it('takes presses on its lines only, until selected, so the box doesn\'t steal them from what lies under it', () => {
    const pressable = (figs: any[]): Array<string | undefined> => figs.filter((f) => f.ignoreEvent !== true).map((f) => f.key)
    expect(pressable(run({}))).toEqual(['target_line', 'stop_line', 'entry'])
    expect(pressable(run({}, { active: true }))).toEqual(expect.arrayContaining(['profit', 'stop', 'target_line', 'stop_line', 'entry']))
  })

  it('takes the level lines and the pill colours from the stop and target colours', () => {
    const figs = run({ stopColor: 'rgba(255, 152, 0, 0.2)', profitColor: 'rgba(33, 150, 243, 0.2)', alwaysShowStats: true }, { lineColor: '#e91e63' })
    const by = (k: string) => figs.find((f) => f.key === k)
    expect(by('target_line').styles.color).toBe('rgba(33, 150, 243, 1)')
    expect(by('stop_line').styles.color).toBe('rgba(255, 152, 0, 1)')
    expect(by('entry').styles.color).toBe('#e91e63')
    expect(by('target_label').styles.color).toBe('rgba(33, 150, 243, 0.95)')
    expect(by('stop_label').styles.color).toBe('rgba(255, 152, 0, 0.95)')
  })

  it('clamps a money risk to the account, as TV does', () => {
    expect(positionStats(100, 90, 120, { accountSize: 1000, risk: 5000, riskMode: 'money' }).riskAmount).toBe(1000)
    expect(positionStats(100, 90, 120, { accountSize: 1000, risk: 25 }).riskAmount).toBe(250)
    expect(positionStats(100, 90, 120, { accountSize: 1000, risk: 400 }).riskAmount).toBe(1000)
  })

  it('sizes and reports like TV: raw qty, lots rounded down, amounts as account after the level', () => {
    // TV: account 1000, risk 25%, stop 18.81 away, lot size 10 -> qty 13.29, Qty label 1; target 18.81 away -> Amount 1250, stop -> 750.
    const s = positionStats(126.16, 107.35, 144.97, { accountSize: 1000, risk: 25, lotSize: 10 })
    expect(s.qty).toBeCloseTo(13.29, 2)
    expect(s.lots).toBe(1)
    expect(s.targetAmount).toBeCloseTo(1250, 0)
    expect(s.stopAmount).toBe(750)
    expect(positionStats(100, 90, 120, { lotSize: 0.5 }).lots).toBe(50)
  })
})

describe('range tools', () => {
  const run = (kind: 'price' | 'date' | 'dateAndPrice', extendData: unknown, props: Record<string, unknown> = {}): any[] => {
    const tpl = rangeTool(kind)()
    tpl.setProperties!(props as any, 'r')
    const data = [bar(1, 1, 1, 1, 1000), bar(1, 1, 1, 1, 2500), bar(1, 1, 1, 1, 500)]
    const overlay = { id: 'r', extendData, points: [{ timestamp: 0, dataIndex: 0, value: 100 }, { timestamp: 7200000, dataIndex: 2, value: 110 }] }
    return tpl.createPointFigures!({ overlay, coordinates: [{ x: 100, y: 300 }, { x: 300, y: 100 }], bounding, chart: fake(data) } as any) as any[]
  }
  const by = (figs: any[], k: string): any => figs.find((f) => f.key === k)

  it('extends the fill with the bound lines', () => {
    expect(by(run('price', { extendLeft: true, extendRight: true }), 'background').attrs).toMatchObject({ x: 0, width: 800, y: 100, height: 200 })
    expect(by(run('date', { extendTop: true, extendBottom: true }), 'background').attrs).toMatchObject({ y: 0, height: 400, x: 100, width: 200 })
    expect(by(run('price', {}), 'background').attrs).toMatchObject({ x: 100, width: 200 })
  })

  it('puts its own text at the centre of the box', () => {
    const text = by(run('price', { customTextVisible: true, text: 'hi' }), 'custom_text')
    expect(text.attrs).toMatchObject({ x: 200, y: 200, baseline: 'middle' })
  })

  it('ends the date tools\' label with the range volume, and counts ticks below three decimals', () => {
    expect(by(run('date', {}), 'label').attrs.text).toBe('2 bars, 2h\nVol 4 K')
    expect(by(run('price', {}), 'label').attrs.text).toBe('10.00 (10.00%) 1,000')
  })

  it('ends arrows in an open chevron, and breaks them around its own text', () => {
    const plain = run('price', {})
    expect(by(plain, 'arrow_price_head').type).toBe('line')
    expect(by(plain, 'arrow_price_head').attrs.coordinates).toHaveLength(3)
    expect(by(plain, 'arrow_price_1')).toBeUndefined()
    const broken = run('price', { customTextVisible: true, text: 'hi' })
    // Arrow runs y 300 -> 100 at x 200; the text (halfH 6 + 5) leaves 300..211 and 189..100.
    expect(by(broken, 'arrow_price').attrs.coordinates.map((c: any) => c.y)).toEqual([300, 211])
    expect(by(broken, 'arrow_price_1').attrs.coordinates.map((c: any) => c.y)).toEqual([189, 100])
  })

  it('draws an arrow\'s line even when it is too short for a head', () => {
    const tpl = rangeTool('price')()
    const figs = tpl.createPointFigures!({ overlay: { id: 'x', extendData: {}, points: [{ timestamp: 0, dataIndex: 0, value: 100 }, { timestamp: 0, dataIndex: 1, value: 100.1 }] }, coordinates: [{ x: 100, y: 200 }, { x: 300, y: 195 }], bounding, chart: fake([bar(1, 1, 1, 1, 1), bar(1, 1, 1, 1, 1)]) } as any) as any[]
    expect(by(figs, 'arrow_price')).toBeDefined()
    expect(by(figs, 'arrow_price_head')).toBeUndefined()
  })
})

describe('forecast', () => {
  const run = (target: number, data: KLineData[], extendData: unknown = {}): any[] => {
    const tpl = forecast()
    const overlay = { id: 'f', extendData, points: [{ timestamp: 0, dataIndex: 0, value: 100 }, { timestamp: 86400000, dataIndex: 2, value: target }] }
    return tpl.createPointFigures!({ overlay, coordinates: [{ x: 100, y: 300 }, { x: 300, y: 100 }], bounding, chart: fake(data) } as any) as any[]
  }
  const by = (figs: any[], k: string): any => figs.find((f) => f.key === k)
  const flat = [bar(100, 101, 99, 100, 1), bar(100, 105, 99, 104, 1), bar(100, 108, 99, 107, 1), bar(100, 109, 99, 108, 1)]

  it('judges success on the target bar alone, and keeps the target balloon in the target colours', () => {
    const hit = run(108, flat, { successBackColor: '#0f0', targetBackColor: '#00f' })
    expect(by(hit, 'status').attrs.text).toContain('SUCCESS')
    expect(by(hit, 'status').styles.backgroundColor).toBe('#0f0')
    expect(by(hit, 'target_label').styles.backgroundColor).toBe('#00f')
    // The path crossed 105 on the way, but the target bar itself only reached 108.
    const miss = run(112, flat, { failureBackColor: '#f00', failureTextColor: '#fff' })
    expect(by(miss, 'status').attrs.text).toContain('FAILURE')
    expect(by(miss, 'status').styles).toMatchObject({ backgroundColor: '#f00', color: '#fff' })
  })

  it('has no outcome while the target bar is the last one and has not been reached, or is not there yet', () => {
    expect(by(run(112, flat.slice(0, 3)), 'status')).toBeUndefined()
    expect(by(run(112, flat.slice(0, 2)), 'status')).toBeUndefined()
  })

  it('writes TV\'s two-line balloons', () => {
    const figs = run(108, flat)
    expect(by(figs, 'source_label').attrs.text).toBe('100.00\n1970-01-01')
    expect(by(figs, 'target_label').attrs.text).toBe('8.00 (8.00%) in 1d\n108.00 1970-01-02')
  })
})

describe('volume profile rows and value area', () => {
  it('with ticks per row, rows sit on multiples of their width', () => {
    const p = buildProfile([bar(3, 7.5, 2.5, 5, 100)], 0, 0, 2, 70, 0.5)!
    // 1.0-wide rows: 2..3, 3..4, ... 7..8.
    expect(p.rows[0].low).toBe(2)
    expect(p.rows[p.rows.length - 1].high).toBe(8)
    expect(p.rows).toHaveLength(6)
  })

  it('takes the bigger neighbour first and stops before passing the share', () => {
    // Volumes by row 1,2,10,4,3,1: POC row 2; 70% of 21 = 14.7.
    const bars = [1, 2, 10, 4, 3, 1].map((v, i) => bar(i, i + 1, i, i + 0.5, v))
    const p = buildProfile(bars, 0, 5, 6, 70)!
    expect(p.poc).toBe(2)
    // 10 + 4 (above, the bigger) = 14, and the next (3 or 2) would pass 14.7 only for 3; 2 fits: 16 > 14.7, so it stops at 14.
    expect([p.vaFrom, p.vaTo]).toEqual([2, 3])
  })
})
