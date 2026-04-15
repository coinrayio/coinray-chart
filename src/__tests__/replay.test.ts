/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from 'vitest'
import StoreImp from '../Store'
import type { ReplayEngine } from '../replay/ReplayEngine'
import type { KLineData } from '../common/Data'
import type {
  DataLoader,
  DataLoaderGetBarsParams,
  DataLoaderGetRangeParams,
  DataLoaderGetFirstCandleTimeParams
} from '../common/DataLoader'
import type { Period } from '../common/Period'
import type Chart from '../Chart'

// ---------------------------------------------------------------------------
// Time constants — period is hour/1, so candles are spaced 1 h apart.
// A candle at timestamp T closes at T + HOUR_MS.
// setCurrentTime(H3) means H0, H1, H2 are closed history; H3 itself opens
// at H3 and closes at H4, so it gets moved to the buffer.
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000
const BASE = Date.UTC(2026, 3, 2, 0, 0, 0) // 2026-04-02 00:00 UTC
const H0 = BASE
const H1 = BASE + HOUR_MS
const H2 = BASE + HOUR_MS * 2
const H3 = BASE + HOUR_MS * 3
const H4 = BASE + HOUR_MS * 4
const H5 = BASE + HOUR_MS * 5

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockChart (): Chart {
  return {
    layout: (_opts?: unknown) => { /* noop */
    },
    updatePane: (_level?: unknown, _paneId?: unknown) => { /* noop */
    }
  } as unknown as Chart
}

interface MockDataLoaderOptions {
  /** Optional static candles (legacy). If provided, getBars returns these instead of generating. */
  candles?: KLineData[]
  /** Optional static rangeCandles (legacy). If provided, getRange returns these instead of generating. */
  rangeCandles?: KLineData[]
  firstCandleTime?: number | null
  /** Earliest timestamp the mock has data for. Default: BASE - 100 * HOUR_MS */
  dataStart?: number
}

interface MockDataLoaderResult {
  loader: DataLoader
}

/** Convert a Period to milliseconds */
function periodToMs (period: { type: string; span: number }): number {
  switch (period.type) {
    case 'second':
      return period.span * 1000
    case 'minute':
      return period.span * 60 * 1000
    case 'hour':
      return period.span * 60 * 60 * 1000
    case 'day':
      return period.span * 24 * 60 * 60 * 1000
    case 'week':
      return period.span * 7 * 24 * 60 * 60 * 1000
    case 'month':
      return period.span * 30 * 24 * 60 * 60 * 1000
    default:
      return 60 * 60 * 1000
  }
}

/** Generate candles at the given period spacing, covering [start, end) */
function generateCandles (start: number, end: number, pMs: number): KLineData[] {
  // Align start to period boundary
  const alignedStart = Math.floor(start / pMs) * pMs
  const result: KLineData[] = []
  for (let t = alignedStart; t < end; t += pMs) {
    if (t >= start - pMs * 500) { // don't generate infinitely far back
      result.push(candle(t))
    }
  }
  return result
}

function createMockDataLoader (options: MockDataLoaderOptions = {}): MockDataLoaderResult {
  const { candles, rangeCandles, firstCandleTime = null, dataStart } = options
  const defaultDataStart = dataStart ?? (BASE - 100 * HOUR_MS)

  const loader: DataLoader = {
    getBars: (params: DataLoaderGetBarsParams) => {
      if (params.type === 'init') {
        if (candles !== undefined) {
          // Legacy: return static candles
          params.callback(candles, { backward: false, forward: false })
        } else {
          // Realistic: floor-round timestamp to period boundary (like adjustFromTo
          // in the real datafeed), then generate candles inclusive of that boundary.
          // The inclusive boundary (end + pMs) matches the coinrayjs fix for
          // fetchCandles past-bucket boundary exclusion — see
          // coinrayjs/ai/bug-fetchcandles-boundary-exclusion.md
          const pMs = periodToMs(params.period)
          const rawEnd = params.timestamp ?? Date.now()
          const end = rawEnd - (rawEnd % pMs) // floor to period boundary
          const start = Math.max(defaultDataStart, end - pMs * 500)
          const generated = generateCandles(start, end + pMs, pMs)
          params.callback(generated, { backward: false, forward: false })
        }
      }
    },
    subscribeBar: (_params) => { /* noop */
    },
    unsubscribeBar: (_params) => { /* noop */
    },
    getRange: (params: DataLoaderGetRangeParams) => {
      if (rangeCandles !== undefined) {
        // Legacy: filter static candles
        params.callback(
          rangeCandles.filter(
            (c: KLineData) => c.timestamp >= params.from && c.timestamp < params.to
          )
        )
      } else {
        // Realistic: generate candles between from and to
        const pMs = periodToMs(params.period)
        const generated = generateCandles(params.from, params.to, pMs)
        params.callback(generated)
      }
    }
  }

  if (firstCandleTime !== null) {
    const resolvedTime = firstCandleTime
    loader.getFirstCandleTime = (params: DataLoaderGetFirstCandleTimeParams) => {
      params.callback(resolvedTime)
    }
  }

  return { loader }
}

/** Generate a candle with deterministic prices based on timestamp */
function candle (timestamp: number, open?: number, close?: number): KLineData {
  if (open !== undefined && close !== undefined) {
    return {
      timestamp,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000
    }
  }
  // Deterministic prices from timestamp — different per minute so partials differ from full candles
  const seed = Math.floor(timestamp / 60000) % 100
  const o = 100 + seed * 0.5
  const c = 101 + seed * 0.3
  const h = Math.max(o, c) + 2 + (seed % 5)
  const l = Math.min(o, c) - 2 - (seed % 3)
  return { timestamp, open: o, high: h, low: l, close: c, volume: 1000 + seed * 10 }
}

/** Merge multiple candles into one (same logic as the engine's partial construction) */
function mergeCandles (candles: KLineData[]): {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number
} {
  return {
    open: candles[0].open,
    high: Math.max(...candles.map(c => c.high)),
    low: Math.min(...candles.map(c => c.low)),
    close: candles[candles.length - 1].close,
    volume: candles.reduce((sum, c) => sum + (c.volume ?? 0), 0)
  }
}

interface TestStore {
  store: StoreImp
  engine: ReplayEngine
  mock: MockDataLoaderResult
  chart: Chart
}

function createTestStore (options: MockDataLoaderOptions = {}, period: Period = { type: 'hour', span: 1 }): TestStore {
  const chart = createMockChart()
  const store = new StoreImp(chart)
  const mock = createMockDataLoader(options)

  store.setSymbol({ ticker: 'TEST', pricePrecision: 2, volumePrecision: 0 })
  store.setPeriod(period)
  store.setDataLoader(mock.loader)

  return { store, engine: store.getReplayEngine() as unknown as ReplayEngine, mock, chart }
}

// ---------------------------------------------------------------------------
// Tests — pure logic only. Data-flow tests (re-init, resolution change,
// partial candle construction) are tested via storybook integration tests.
// ---------------------------------------------------------------------------

describe('setCurrentTime — status transitions', () => {
  it('sets status to loading then ready', async () => {
    const statuses: string[] = []
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1), candle(H2)],
      rangeCandles: [candle(H3), candle(H4)]
    })
    engine.onReplayStatusChange(s => {
      statuses.push(s)
    })

    await engine.setCurrentTime(H3)

    expect(statuses).toContain('loading')
    expect(statuses[statuses.length - 1]).toBe('ready')
    expect(engine.getReplayStatus()).toBe('ready')
  })

  it('exits playback mode when null', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    expect(engine.getReplayStatus()).toBe('ready')

    await engine.setCurrentTime(null)
    expect(engine.getReplayStatus()).toBe('idle')
  })

  it('validates against firstCandleTime and emits error', async () => {
    const errors: Array<{ type: string; detail?: unknown }> = []
    const { engine } = createTestStore({
      candles: [candle(H4)],
      rangeCandles: [],
      firstCandleTime: H4
    })
    engine.onReplayError(e => {
      errors.push(e)
    })

    await engine.setCurrentTime(H0) // before firstCandleTime

    expect(errors.length).toBe(1)
    expect(errors[0].type).toBe('no_data_at_time')
    expect(engine.getReplayStatus()).toBe('idle')
  })

  it('second call supersedes first — generation counter', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1), candle(H2)],
      rangeCandles: [candle(H3), candle(H4), candle(H5)]
    })

    const p1 = engine.setCurrentTime(H2)
    const p2 = engine.setCurrentTime(H4)

    await Promise.all([p1, p2])

    expect(engine.getReplayStatus()).toBe('ready')
    expect(engine.getReplayCurrentTime()).toBe(H4)
  })
})

describe('step — guards and callbacks', () => {
  it('draws candle from buffer and emits callback', async () => {
    const steps: Array<{ candle: KLineData; direction: string }> = []
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2), candle(H3)]
    })
    engine.onReplayStep((c, d) => {
      steps.push({ candle: c, direction: d })
    })

    await engine.setCurrentTime(H2)
    // Init emit: last history candle on ready
    expect(steps.length).toBe(1)
    expect(steps[0].direction).toBe('forward')

    engine.step()
    // Step emit: buffer candle drawn
    expect(steps.length).toBe(2)
    expect(steps[1].direction).toBe('forward')
  })

  it('sets finished when buffer empty', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    engine.step()
    engine.step() // buffer empty

    expect(engine.getReplayStatus()).toBe('finished')
  })

  it('is no-op when idle', () => {
    const { engine } = createTestStore()
    engine.step()
    expect(engine.getReplayStatus()).toBe('idle')
  })

  it('is no-op when finished', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    engine.step()
    engine.step() // finished

    const steps: string[] = []
    engine.onReplayStep((_c, d) => {
      steps.push(d)
    })
    engine.step()
    expect(steps.length).toBe(0)
  })
})

describe('stepBack — guards and boundaries', () => {
  it('removes last drawn candle and returns to buffer', async () => {
    const { store, engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2), candle(H3)]
    })

    await engine.setCurrentTime(H2)
    engine.step()
    engine.step()

    await engine.stepBack()
    const dataList = store.getDataList()
    expect(dataList[dataList.length - 1].timestamp).toBe(H2)
  })

  it('is no-op when nothing drawn', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)

    const steps: string[] = []
    engine.onReplayStep((_c, d) => {
      steps.push(d)
    })
    await engine.stepBack()
    expect(steps.length).toBe(0)
  })

  it('cannot go past session boundary', async () => {
    const { store, engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    engine.step()
    await engine.stepBack()
    await engine.stepBack() // no-op

    const dataList = store.getDataList()
    expect(dataList[dataList.length - 1].timestamp).toBe(H1)
  })

  it('changes status from finished to paused', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    engine.step()
    engine.step() // finished
    expect(engine.getReplayStatus()).toBe('finished')

    await engine.stepBack()
    expect(engine.getReplayStatus()).toBe('paused')
  })

  it('emits step callback with back direction', async () => {
    const steps: Array<{ timestamp: number; direction: string }> = []
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    engine.step()

    engine.onReplayStep((c, d) => {
      steps.push({ timestamp: c.timestamp, direction: d })
    })
    await engine.stepBack()

    expect(steps.length).toBe(1)
    expect(steps[0].direction).toBe('back')
  })
})

describe('play / pause — status transitions', () => {
  it('sets status to playing then paused', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2), candle(H3)]
    })

    await engine.setCurrentTime(H2)
    engine.play(100)
    expect(engine.getReplayStatus()).toBe('playing')

    engine.pause()
    expect(engine.getReplayStatus()).toBe('paused')
  })

  it('play is no-op when idle', () => {
    const { engine } = createTestStore()
    engine.play()
    expect(engine.getReplayStatus()).toBe('idle')
  })

  it('pause is no-op when not playing', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    engine.pause()
    expect(engine.getReplayStatus()).toBe('ready')
  })
})

describe('playUntil — guards', () => {
  it('is no-op when idle', () => {
    const { engine } = createTestStore()
    engine.playUntil(H5)
    expect(engine.getReplayStatus()).toBe('idle')
  })

  it('is no-op when target is before first buffered candle', async () => {
    const statuses: string[] = []
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2), candle(H3), candle(H4)]
    })

    await engine.setCurrentTime(H2)
    engine.step()
    engine.step()
    // Buffer now has [H4]

    engine.onReplayStatusChange(s => {
      statuses.push(s)
    })
    engine.playUntil(H2, 1000)

    await new Promise<void>(resolve => {
      setTimeout(resolve, 50)
    })

    expect(statuses.length).toBe(0)
    expect(engine.getReplayStatus()).toBe('ready')
  })
})

describe('setSymbol — exits playback', () => {
  it('exits playback mode on symbol change', async () => {
    const { store, engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    expect(engine.getReplayStatus()).toBe('ready')

    store.setSymbol({ ticker: 'OTHER', pricePrecision: 2, volumePrecision: 0 })
    expect(engine.getReplayStatus()).toBe('idle')
  })
})

describe('callbacks — unsubscribe', () => {
  it('unsubscribe stops callbacks from firing', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2), candle(H3)]
    })

    const statuses: string[] = []
    const unsub = engine.onReplayStatusChange(s => {
      statuses.push(s)
    })

    await engine.setCurrentTime(H2)
    unsub()

    engine.step()
    engine.step() // finished, but unsub'd

    expect(statuses.every(s => s === 'loading' || s === 'ready')).toBe(true)
  })
})

describe('data boundary post-processing', () => {
  it('Case A: candle at cursor time moves to buffer', async () => {
    const { store, engine } = createTestStore({
      candles: [candle(H0), candle(H1), candle(H2)],
      rangeCandles: []
    })

    await engine.setCurrentTime(H2)

    const dataList = store.getDataList()
    expect(dataList.every(d => d.timestamp < H2)).toBe(true)

    engine.step()
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(H2)
  })

  it('Case C: fully closed candle stays in history', async () => {
    const { store, engine } = createTestStore({
      candles: [candle(H0), candle(H1), candle(H2)],
      rangeCandles: []
    })

    await engine.setCurrentTime(H3)

    const dataList = store.getDataList()
    expect(dataList.length).toBe(3)
    expect(dataList[2].timestamp).toBe(H2)
  })
})

describe('getReplayCurrentTime', () => {
  it('returns cursor time initially, advances on step', async () => {
    const { engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2), candle(H3)]
    })

    expect(engine.getReplayCurrentTime()).toBeNull()

    await engine.setCurrentTime(H2)
    expect(engine.getReplayCurrentTime()).toBe(H2)

    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(H3)

    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(H4)

    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(H3)

    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(H2)

    await engine.setCurrentTime(null)
    expect(engine.getReplayCurrentTime()).toBeNull()
  })

  it('currentTime is candle close time, not start time', async () => {
    const { store, engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2)]
    })

    await engine.setCurrentTime(H2)
    engine.step()

    expect(engine.getReplayCurrentTime()).toBe(H3)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(H2)
  })

  it('at session start, last visible candle closed at cursor time', async () => {
    const { store, engine } = createTestStore({
      candles: [candle(H0), candle(H1), candle(H2), candle(H3)],
      rangeCandles: [candle(H3), candle(H4)]
    })

    await engine.setCurrentTime(H3)

    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(H2)
    expect(engine.getReplayCurrentTime()).toBe(H3)
  })
})

describe('destroy cleanup', () => {
  it('destroy during playback does not throw', async () => {
    const { store, engine } = createTestStore({
      candles: [candle(H0), candle(H1)],
      rangeCandles: [candle(H2), candle(H3), candle(H4)]
    })

    await engine.setCurrentTime(H2)
    engine.play(1000)
    expect(engine.getReplayStatus()).toBe('playing')

    expect(() => {
      store.destroy()
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// PRD Example tests — realistic mock (generates candles per period)
// ---------------------------------------------------------------------------

describe('PRD Example 1: 1min→1hr, cursor 09:07', () => {
  // Session start: 09:00 on 1min. Play to 09:07, switch to 1hr.
  // All times in UTC.
  const START = H1 // 01:00 UTC as "09:00 local" — using H1 as a round hour
  const MIN = 60_000
  const CURSOR = START + 7 * MIN // 09:07 = START + 7min

  it('full example sequence', async () => {
    // Start on 1min with realistic mock
    const { store, engine } = createTestStore({}, { type: 'minute', span: 1 })

    // 1. Start session at START
    await engine.setCurrentTime(START)
    expect(engine.getReplayStatus()).toBe('ready')
    expect(engine.getReplayCurrentTime()).toBe(START)

    // 2. Play to 09:07 (7 steps on 1min → currentTime = START + 7min)
    for (let i = 0; i < 7; i++) {
      engine.step()
    }
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)

    // 3. Switch to 1hr
    store.setPeriod({ type: 'hour', span: 1 })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })

    // After switch: partial at START (09:00), currentTime = CURSOR (09:07)
    expect(engine.getReplayStatus()).toBe('ready')
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)
    const dataAfterSwitch = store.getDataList()
    // Last candle should be at START (the partial 09:00 candle)
    const partialCandle = dataAfterSwitch[dataAfterSwitch.length - 1]
    expect(partialCandle.timestamp).toBe(START)

    // Verify it's actually a partial: its OHLCV should match merging the first 7 minutes
    // (START+0min through START+6min), NOT the full hour candle
    const first7min = Array.from({ length: 7 }, (_, i) => candle(START + i * MIN))
    const expectedPartial = mergeCandles(first7min)
    const fullHourCandle = candle(START) // what a full 1hr candle at START would look like
    expect(partialCandle.open).toBe(expectedPartial.open)
    expect(partialCandle.high).toBe(expectedPartial.high)
    expect(partialCandle.low).toBe(expectedPartial.low)
    expect(partialCandle.close).toBe(expectedPartial.close)
    // Confirm the partial differs from the full hour candle
    expect(partialCandle.close).not.toBe(fullHourCandle.close)

    // 4. Step → : completes partial, currentTime = START + 1hr
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(START + HOUR_MS)
    const completedCandle = store.getDataList()[store.getDataList().length - 1]
    expect(completedCandle.timestamp).toBe(START)
    // After completion, the candle should be the full hour candle (different from partial)
    expect(completedCandle.close).toBe(fullHourCandle.close)

    // 5. Step → : draws next 1hr candle, currentTime = START + 2hr
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(START + 2 * HOUR_MS)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START + HOUR_MS)

    // 6. Step ← : back to completed START candle, currentTime = START + 1hr
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START + HOUR_MS)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START)

    // 7. Step ← : removes START candle, shows START - 1hr, currentTime = START
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START - HOUR_MS)

    // 8. Step ← : blocked (at session boundary)
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START - HOUR_MS)
  })
})

describe('PRD Example 2: 1min→1hr, cursor 10:24', () => {
  const START = H1
  const MIN = 60_000
  const CURSOR = START + 84 * MIN // 10:24 = START + 84min (1hr24min)

  it('full example sequence', async () => {
    const { store, engine } = createTestStore({}, { type: 'minute', span: 1 })

    await engine.setCurrentTime(START)
    // Play 84 steps on 1min to reach 10:24
    for (let i = 0; i < 84; i++) {
      engine.step()
    }
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)

    // Switch to 1hr
    store.setPeriod({ type: 'hour', span: 1 })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })

    // After switch: partial at START+1hr (10:00), currentTime = CURSOR (10:24)
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)
    const partialTs = START + HOUR_MS // 10:00
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(partialTs)

    // Verify it's a partial — OHLCV from 24 minutes of sub-resolution data
    const partialCandle = store.getDataList()[store.getDataList().length - 1]
    const sub24min = Array.from({ length: 24 }, (_, i) => candle(partialTs + i * MIN))
    const expectedPartial = mergeCandles(sub24min)
    expect(partialCandle.open).toBe(expectedPartial.open)
    expect(partialCandle.close).toBe(expectedPartial.close)

    // Step → : completes partial, currentTime = START + 2hr (11:00)
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(START + 2 * HOUR_MS)

    // Step → : draws 11:00, currentTime = START + 3hr (12:00)
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(START + 3 * HOUR_MS)

    // Step ← : back to 10:00 full, currentTime = 11:00
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START + 2 * HOUR_MS)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(partialTs)

    // Step ← : removes 10:00, shows 09:00, currentTime = 10:00
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START + HOUR_MS)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START)

    // Step ← : removes 09:00, shows 08:00, currentTime = 09:00
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START - HOUR_MS)

    // Step ← : blocked
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START - HOUR_MS)
  })
})

describe('PRD Example 3: 1min→4hr, cursor 09:07 (boundary partial)', () => {
  const MIN = 60_000
  const FOUR_HR = 4 * HOUR_MS
  // Use H1 (01:00 UTC) as start. 4hr candles: 00:00, 04:00. 01:00 is mid the 00:00 candle.

  it('full example sequence with boundary partial cycle', async () => {
    // Use H1 as start (01:00 UTC). 4hr candle at 00:00 spans 01:00 → boundary partial case.
    const start = H1
    const cursor = start + 7 * MIN
    const fourHrCandle = H0 // 00:00 — the 4hr candle containing start
    const nextFourHr = H0 + FOUR_HR // 04:00
    const nextNextFourHr = H0 + 2 * FOUR_HR // 08:00

    const { store, engine } = createTestStore({}, { type: 'minute', span: 1 })

    await engine.setCurrentTime(start)
    for (let i = 0; i < 7; i++) {
      engine.step()
    }
    expect(engine.getReplayCurrentTime()).toBe(cursor)

    // Switch to 4hr
    store.setPeriod({ type: 'hour', span: 4 })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })

    // After switch: partial at 00:00 (to cursor), currentTime = cursor
    expect(engine.getReplayCurrentTime()).toBe(cursor)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(fourHrCandle)

    // Step → : completes partial, currentTime = 04:00
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(nextFourHr)

    // Step → : draws 04:00, currentTime = 08:00
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(nextNextFourHr)

    // Step ← : back to 00:00 full, currentTime = 04:00
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(nextFourHr)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(fourHrCandle)

    // Step ← : boundary partial — 00:00 candle spans start (01:00)
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(start)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(fourHrCandle)

    // Step ← : blocked
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(start)

    // Step → : completes boundary partial, currentTime = 04:00 (cycle repeats)
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(nextFourHr)

    // Step → : draws 04:00, currentTime = 08:00
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(nextNextFourHr)

    // Step ← : back to 00:00 full
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(nextFourHr)

    // Step ← : boundary partial again
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(start)

    // Step ← : blocked again
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(start)
  })
})

describe('PRD Example 4: 1min→1hr, cursor 10:00 (exact boundary)', () => {
  const START = H1
  const MIN = 60_000
  const CURSOR = START + 60 * MIN // 10:00 = START + 60min = START + 1hr

  it('full example sequence — no partial', async () => {
    const { store, engine } = createTestStore({}, { type: 'minute', span: 1 })

    await engine.setCurrentTime(START)
    for (let i = 0; i < 60; i++) {
      engine.step()
    }
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)

    // Switch to 1hr — exact boundary, no partial
    store.setPeriod({ type: 'hour', span: 1 })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })

    expect(engine.getReplayCurrentTime()).toBe(CURSOR)
    // Last candle should be START (09:00), fully closed at 10:00 = CURSOR
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START)

    // Step → : draws 10:00, currentTime = 11:00
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(START + 2 * HOUR_MS)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START + HOUR_MS)

    // Step ← : back to 09:00, currentTime = 10:00
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START + HOUR_MS)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START)

    // Step ← : removes 09:00, shows 08:00, currentTime = 09:00
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START - HOUR_MS)

    // Step ← : blocked
    await engine.stepBack()
    expect(engine.getReplayCurrentTime()).toBe(START)
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START - HOUR_MS)
  })
})

describe('PRD Example 5: 1hr→1D, cursor Apr 3 14:00', () => {
  const START = H1 // session start at 01:00 UTC
  const CURSOR = START + 29 * HOUR_MS // 29 hours later = "Apr 3 14:00" relative

  it('full example sequence with boundary partial', async () => {
    const { store, engine } = createTestStore({}, { type: 'hour', span: 1 })

    await engine.setCurrentTime(START)
    // Play 29 steps on 1hr
    for (let i = 0; i < 29; i++) {
      engine.step()
    }
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)

    // Switch to 1D
    store.setPeriod({ type: 'day', span: 1 })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })

    expect(engine.getReplayCurrentTime()).toBe(CURSOR)

    // The last candle should be a 1D candle whose close > CURSOR (partial)
    const lastCandle = store.getDataList()[store.getDataList().length - 1]
    const DAY_MS = 24 * HOUR_MS
    // The day candle containing CURSOR
    const dayStart = Math.floor(CURSOR / DAY_MS) * DAY_MS
    // If cursor is mid-day, last candle is a partial at dayStart
    // If cursor is on day boundary, last candle is the previous day
    if (CURSOR % DAY_MS !== 0) {
      expect(lastCandle.timestamp).toBe(dayStart)
    }

    // Step → : completes the day candle
    engine.step()
    const dayClose = dayStart + DAY_MS
    expect(engine.getReplayCurrentTime()).toBe(dayClose)

    // Step ← : back to previous day
    await engine.stepBack()
    const prevDayTs = store.getDataList()[store.getDataList().length - 1].timestamp
    expect(engine.getReplayCurrentTime()).toBe(prevDayTs + DAY_MS)

    // Keep stepping back until blocked (at session boundary)
    let prevCt = engine.getReplayCurrentTime()!
    for (let i = 0; i < 10; i++) {
      await engine.stepBack()
      const ct = engine.getReplayCurrentTime()!
      if (ct === prevCt) break // blocked
      prevCt = ct
    }
    // Should be blocked at or near START
    expect(engine.getReplayCurrentTime()!).toBeLessThanOrEqual(START)
  })
})

// ---------------------------------------------------------------------------
// Regression: partial candle missing after period change (mid-period cursor)
//
// The real datafeed's adjustFromTo() floors `to` to the period boundary.
// When the replay cursor is mid-period (e.g. 08:37 on 1H), the floor drops
// to 08:00 and the 08:00 candle is excluded from the fetch.  getInitFetchTimestamp()
// compensates by ceiling the timestamp so the candle is included.
//
// The mock's getBars now replicates this floor rounding, so this test would
// fail without the getInitFetchTimestamp() fix.
// ---------------------------------------------------------------------------

describe('Regression: partial candle present after 1m→1H switch at mid-hour cursor', () => {
  const MIN = 60_000
  // Start session at 08:00 on 1min, step to 08:37, then switch to 1H.
  const START = H0 + 8 * HOUR_MS // 08:00 UTC
  const CURSOR = START + 37 * MIN // 08:37

  it('shows partial 08:00 candle after switching to 1H at 08:37', async () => {
    const { store, engine } = createTestStore({}, { type: 'minute', span: 1 })

    // 1. Start replay at 08:00
    await engine.setCurrentTime(START)
    expect(engine.getReplayStatus()).toBe('ready')

    // 2. Step forward 37 times (1min each) → cursor at 08:37
    for (let i = 0; i < 37; i++) {
      engine.step()
    }
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)

    // 3. Switch to 1H
    store.setPeriod({ type: 'hour', span: 1 })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })

    // 4. Verify: last candle is a partial at 08:00, NOT 07:00
    expect(engine.getReplayStatus()).toBe('ready')
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)

    const dataList = store.getDataList()
    const lastCandle = dataList[dataList.length - 1]
    expect(lastCandle.timestamp).toBe(START) // 08:00, not 07:00

    // 5. Verify it's a partial (built from 37 sub-resolution minutes, not a full hour)
    const first37min = Array.from({ length: 37 }, (_, i) => candle(START + i * MIN))
    const expectedPartial = mergeCandles(first37min)
    expect(lastCandle.open).toBe(expectedPartial.open)
    expect(lastCandle.close).toBe(expectedPartial.close)

    // 6. Step forward → next candle is 09:00
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(START + HOUR_MS) // 09:00
    expect(store.getDataList()[store.getDataList().length - 1].timestamp).toBe(START)
  })
})

// ---------------------------------------------------------------------------
// Regression: cursor jumps forward when switching back from higher resolution
// with a partial candle visible.
//
// Bug: handlePeriodChange computed the cursor as lastDrawn.timestamp + oldPeriodDuration.
// For a partial candle (e.g. partial at 09:00 on 1H), this gives 09:00 + 1H = 10:00,
// even though the actual cursor is 09:03. Switching back to 1m then starts at 10:00.
// ---------------------------------------------------------------------------

describe('Regression: cursor preserved when switching back from higher resolution with partial', () => {
  const MIN = 60_000

  it('1m→1H→1m at 09:03 keeps cursor at 09:03', async () => {
    const START = H0 + 9 * HOUR_MS // 09:00 UTC
    const CURSOR = START + 3 * MIN // 09:03

    const { store, engine } = createTestStore({}, { type: 'minute', span: 1 })

    // 1. Start at 09:00 on 1m
    await engine.setCurrentTime(START)
    expect(engine.getReplayStatus()).toBe('ready')

    // 2. Step 3 times → cursor at 09:03
    for (let i = 0; i < 3; i++) {
      engine.step()
    }
    expect(engine.getReplayCurrentTime()).toBe(CURSOR)

    // 3. Switch to 1H — shows partial 09:00 candle
    store.setPeriod({ type: 'hour', span: 1 })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })

    expect(engine.getReplayStatus()).toBe('ready')
    expect(engine.getReplayCurrentTime()).toBe(CURSOR) // still 09:03

    // 4. Switch back to 1m — cursor must stay at 09:03, not jump to 10:00
    store.setPeriod({ type: 'minute', span: 1 })
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })

    expect(engine.getReplayStatus()).toBe('ready')
    expect(engine.getReplayCurrentTime()).toBe(CURSOR) // 09:03, not 10:00

    // 5. Last drawn candle should be at 09:02 (the last fully closed 1m candle before 09:03)
    const dataList = store.getDataList()
    const lastCandle = dataList[dataList.length - 1]
    expect(lastCandle.timestamp).toBe(CURSOR - MIN) // 09:02
  })
})

describe('currentTime capped at endTime', () => {
  it('last step currentTime does not exceed endTime', async () => {
    // endTime is mid-candle: H4 + 30min. The last buffer candle opens at H4,
    // its theoretical close is H5, but currentTime should be capped at endTime.
    const endTime = H4 + HOUR_MS / 2 // H4:30
    const { engine } = createTestStore()

    await engine.setCurrentTime(H3, endTime)
    expect(engine.getReplayStatus()).toBe('ready')

    // Step until finished
    let steps = 0
    while (engine.getReplayStatus() !== 'finished') {
      engine.step()
      steps++
      if (steps > 100) break // safety
    }

    expect(steps).toBeGreaterThan(0)
    expect(engine.getReplayCurrentTime()).toBeLessThanOrEqual(endTime)
  })

  it('currentTime equals candle close when close is before endTime', async () => {
    // endTime is after H5 close, so stepping to H4 should give currentTime = H5 (candle close), not endTime
    const endTime = H5 + HOUR_MS / 2
    const { engine } = createTestStore()

    await engine.setCurrentTime(H4, endTime)
    expect(engine.getReplayStatus()).toBe('ready')

    // Step once — draws the H4 candle, close = H5
    engine.step()
    expect(engine.getReplayCurrentTime()).toBe(H5)
  })
})
