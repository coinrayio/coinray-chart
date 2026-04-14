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

import type Nullable from '../common/Nullable'
import type { KLineData } from '../common/Data'
import type { Period } from '../common/Period'
import type { SymbolInfo } from '../common/SymbolInfo'
import type { DataLoader } from '../common/DataLoader'
import type StoreImp from '../Store'

import type { ReplayStatus } from './types'

// ---------------------------------------------------------------------------
// StoreAccess — narrow view of Store's fields and methods the engine calls into.
// Declared here so that Store internals changing surface as compile errors in
// this file (the replay dev's playground), not leaked into Store.ts as wiring.
// ---------------------------------------------------------------------------

interface StoreAccess {
  _dataList: KLineData[]
  _dataLoader: Nullable<DataLoader>
  _period: Nullable<Period>
  _crosshair: Record<string, unknown>
  _loading: boolean
  _chart: {
    layout: (opts: {
      measureWidth?: boolean
      update?: boolean
      buildYAxisTick?: boolean
      cacheYAxisWidth?: boolean
    }) => void
  }
  _addData: (data: KLineData, type: string) => void
  _adjustVisibleRange: () => void
  _processDataLoad: (type: string) => void
  _processDataUnsubscribe: () => void
  _calcIndicator: (indicators: unknown) => void
  getSymbol: () => Nullable<SymbolInfo>
  getPeriod: () => Nullable<Period>
  setCrosshair: (crosshair: unknown, opts: { notInvalidate: boolean }) => void
  getIndicatorsByFilter: (filter: Record<string, unknown>) => unknown[]
  resetData: (fn?: () => void) => void
}

// ---------------------------------------------------------------------------
// ReplayEngine — owns all replay state and logic
// ---------------------------------------------------------------------------

export class ReplayEngine {
  private readonly _s: StoreAccess

  /**
   * Time limit for replay mode — only show candles up to this timestamp
   */
  private _currentTimeLimit: Nullable<number> = null

  /**
   * Upper bound for replay buffer fetch (default: Date.now())
   */
  private _replayEndTime: Nullable<number> = null

  /**
   * Candles waiting to be played
   */
  private _replayBuffer: KLineData[] = []

  /**
   * Candles drawn via play/step — used for stepBack
   */
  private _drawnFromBuffer: KLineData[] = []

  /**
   * The original start time set by the consumer. Never changed by handlePeriodChange.
   * Used as the step-back boundary — stepping back past all drawn candles
   * should reach this time.
   */
  private _replayStartTime: Nullable<number> = null

  /**
   * The effective current time in playback — the close time of the last visible candle.
   * Set to the cursor on setCurrentTime, advances by periodDuration on each step.
   */
  private _replayCurrentTime: Nullable<number> = null

  /**
   * Current playback status
   */
  private _replayStatus: ReplayStatus = 'idle'

  /**
   * Playback speed in candles per second
   */
  private _replaySpeed = 1

  /**
   * setInterval handle for continuous playback
   */
  private _playIntervalId: ReturnType<typeof setInterval> | null = null

  /**
   * One-shot callback fired when init data load completes
   */
  private _onInitComplete: (() => void) | null = null

  /**
   * Replay status change listeners
   */
  private readonly _replayStatusCallbacks = new Set<(status: ReplayStatus) => void>()

  /**
   * Replay step listeners
   */
  private readonly _replayStepCallbacks = new Set<(candle: KLineData, direction: 'forward' | 'back') => void>()

  /**
   * Replay error listeners — fired when a playback operation fails (e.g., no data at resolution)
   */
  private readonly _replayErrorCallbacks = new Set<(error: { type: string; detail?: unknown }) => void>()

  /**
   * Generation counter for setCurrentTime — incremented on each call.
   * After each await, check against the captured value to detect superseded calls.
   */
  private _generation = 0

  constructor (store: StoreImp) {
    this._s = store as unknown as StoreAccess
  }

  // ---------------------------------------------------------------------------
  // Accessors used by Store
  // ---------------------------------------------------------------------------

  getCurrentTimeLimit (): Nullable<number> {
    return this._currentTimeLimit
  }

  isInReplay (): boolean {
    return this._currentTimeLimit !== null
  }

  getReplayEndTime (): Nullable<number> {
    return this._replayEndTime
  }

  getReplayBufferLength (): number {
    return this._replayBuffer.length
  }

  // ---------------------------------------------------------------------------
  // Init complete notification — called by Store._processDataLoad
  // ---------------------------------------------------------------------------

  notifyInitComplete (): void {
    if (this._onInitComplete !== null) {
      const cb = this._onInitComplete
      this._onInitComplete = null
      cb()
    }
  }

  // ---------------------------------------------------------------------------
  // Period change handling — called by Store.setPeriod when in playback mode
  // ---------------------------------------------------------------------------

  handlePeriodChange (period: Period, resetFn: () => void): void {
    this._clearPlayInterval()
    this._updateStatus('loading')

    // Increment generation so any in-flight setCurrentTime operation will abort
    const gen = ++this._generation

    // A period change during replay when no period is set is invalid — bail out.
    const savedPeriod = this._s.getPeriod()
    if (savedPeriod === null) return

    // Reject second-resolution — not supported for replay
    if (period.type === 'second') {
      this._emitReplayError('unsupported_resolution', { period })
      return
    }

    // Advance _currentTimeLimit to actual playback position before clearing drawn
    // history. Use _replayCurrentTime (the true cursor) instead of computing from
    // the last drawn candle — that computation overshoots for partial candles
    // (e.g. partial at 09:00 on 1H + 1H = 10:00, but cursor is actually 09:03).
    const savedLimit = this._currentTimeLimit
    const savedBuffer = this._replayBuffer
    const savedDrawn = this._drawnFromBuffer
    if (this._replayCurrentTime !== null) {
      this._currentTimeLimit = this._replayCurrentTime
    }

    const cursorLimit = this._currentTimeLimit

    this._replayBuffer = []
    this._clearDrawnHistory()
    this._replayCurrentTime = null

    this._onInitComplete = () => {
      void (async () => {
        try {
          // Abort if a newer operation (setCurrentTime or another handlePeriodChange) superseded this one
          if (this._generation !== gen) return

          const dataList = this._s._dataList
          // Check if fetched data covers the cursor position.
          const dataEmpty = dataList.length === 0
          const dataAfterCursor = !dataEmpty && dataList[dataList.length - 1].timestamp > (cursorLimit ?? 0)
          if (dataEmpty || dataAfterCursor) {
            // Determine error type before revert — need the new period active for firstCandleTime lookup.
            // dataAfterCursor: datafeed returned candles after cursor → cursor before firstCandleTime.
            // dataEmpty: datafeed returned nothing. Could be either "resolution unsupported" (1W/1M)
            // or "cursor before firstCandleTime" (some datafeeds return empty for out-of-range times).
            // Check firstCandleTime explicitly to disambiguate.
            let errorType: 'unsupported_resolution' | 'no_data_at_time' = 'unsupported_resolution'
            if (dataAfterCursor) {
              errorType = 'no_data_at_time'
            } else {
              const firstCandleTime = await this._getFirstCandleTime()
              if (this._generation !== gen) return
              if (firstCandleTime !== null && cursorLimit !== null && cursorLimit < firstCandleTime) {
                errorType = 'no_data_at_time'
              }
            }

            // Revert: restore previous period, limit, buffer, drawn history
            this._currentTimeLimit = savedLimit
            this._replayBuffer = savedBuffer
            this._drawnFromBuffer = savedDrawn
            // Re-fetch at previous period, then restore ready state
            this._onInitComplete = () => {
              this._updateStatus('ready')
            }
            this._s.resetData(() => { this._s._period = savedPeriod })

            if (errorType === 'unsupported_resolution') {
              this._emitReplayError('unsupported_resolution', { period })
            } else {
              this._emitReplayError('no_data_at_time', { timestamp: cursorLimit, period })
            }
            return
          }

          // Phase: populate drawn history
          // Order matters: _postProcessDataBoundary may push the partial to _drawnFromBuffer,
          // and _trackExtraCandlesBeyondStart reads it to avoid duplicate tracking.
          await this._fetchReplayBuffer()
          if (this._generation !== gen) return
          await this._postProcessDataBoundary(gen)
          if (this._generation !== gen) return
          this._trackExtraCandlesBeyondStart()
          this._replayCurrentTime = cursorLimit
          this._updateStatus('ready')
        } catch (err) {
          // Resolution change failed (e.g., unsupported resolution in datafeed).
          // Revert to previous period/state so the session is not lost.
          if (this._generation !== gen) return // superseded — don't revert
          console.error('[ReplayEngine] handlePeriodChange failed, reverting:', err)
          this._currentTimeLimit = savedLimit
          this._replayBuffer = savedBuffer
          this._drawnFromBuffer = savedDrawn
          this._onInitComplete = () => {
            this._updateStatus('ready')
          }
          this._s.resetData(() => { this._s._period = savedPeriod })
          this._emitReplayError('resolution_change_failed', { period, error: err instanceof Error ? err.message : String(err) })
        }
      })()
    }

    resetFn()
  }

  // ---------------------------------------------------------------------------
  // Exit playback — called by Store.setSymbol when in playback mode
  // ---------------------------------------------------------------------------

  exitPlayback (): void {
    this._clearPlayInterval()
    this._currentTimeLimit = null
    this._replayEndTime = null
    this._replayBuffer = []
    this._clearDrawnHistory()
    this._replayStartTime = null
    this._replayCurrentTime = null
    this._updateStatus('idle')
  }

  // ---------------------------------------------------------------------------
  // Public replay API — delegated from Store
  // ---------------------------------------------------------------------------

  async setCurrentTime (timestamp: Nullable<number>, endTime?: Nullable<number>): Promise<void> {
    if (timestamp !== null) {
      // Increment generation counter — any in-flight setCurrentTime will see stale gen and abort
      const gen = ++this._generation

      // Save previous state in case validation fails
      const prevLimit = this._currentTimeLimit
      const prevStatus = this._replayStatus

      // Enter or update playback mode
      this._clearPlayInterval()
      this._updateStatus('loading')

      this._s._processDataUnsubscribe()
      this._currentTimeLimit = timestamp
      // Capture effective end time at entry (avoid Date.now() drift across awaits)
      const capturedEndTime = endTime ?? Date.now()
      this._replayEndTime = capturedEndTime

      // Reject second-resolution — not supported for replay
      const currentPeriod = this._s.getPeriod()
      if (currentPeriod !== null && currentPeriod.type === 'second') {
        this._emitReplayError('unsupported_resolution', { period: currentPeriod })
        this._currentTimeLimit = prevLimit
        this._updateStatus(prevLimit !== null ? prevStatus : 'idle')
        if (prevLimit === null) {
          this._s.resetData()
        }
        return
      }

      // Validate start time against first available candle
      const firstCandleTime = await this._getFirstCandleTime()
      // Abort if superseded by a newer setCurrentTime call
      if (this._generation !== gen) return
      if (firstCandleTime !== null && timestamp < firstCandleTime) {
        this._emitReplayError('no_data_at_time', { timestamp, firstCandleTime, period: this._s.getPeriod() })
        // Restore previous state
        this._currentTimeLimit = prevLimit
        this._updateStatus(prevLimit !== null ? prevStatus : 'idle')
        if (prevLimit === null) {
          this._s.resetData()
        }
        return
      }

      // Always re-fetch history ending at the cursor via the full init path.
      // This goes through Store._addData('init') → _clearData(), ensuring visible
      // range, scroll position, and indicator state are reset cleanly. The previous
      // splice optimization left stale internal state from the live session and
      // caused live candles to remain visible until the user interacted with the chart.
      this._replayBuffer = []
      await this._waitForInit()
      if (this._generation !== gen) return

      // Phase: populate drawn history
      // Order matters: _postProcessDataBoundary may push the partial to _drawnFromBuffer,
      // and _trackExtraCandlesBeyondStart reads it to avoid duplicate tracking.
      this._clearDrawnHistory()

      await this._fetchReplayBuffer()
      if (this._generation !== gen) return
      await this._postProcessDataBoundary(gen)
      if (this._generation !== gen) return
      // Check if the init fetch returned any data. Empty dataList after all processing
      // likely means the resolution is unsupported (e.g., 1W/1M).
      if (this._s._dataList.length === 0 && this._replayBuffer.length === 0) {
        this._emitReplayError('unsupported_resolution', { period: this._s.getPeriod() })
        this._currentTimeLimit = prevLimit
        this._updateStatus(prevLimit !== null ? prevStatus : 'idle')
        if (prevLimit === null) {
          this._s.resetData()
        }
        return
      }

      this._replayStartTime ??= timestamp
      this._trackExtraCandlesBeyondStart()
      this._replayCurrentTime = timestamp
      this._updateStatus('ready')
    } else {
      // Exit playback mode
      this.exitPlayback()
      this._s.resetData()
    }
  }

  play (speed?: number): void {
    if (this._replayStatus !== 'ready' && this._replayStatus !== 'paused' && this._replayStatus !== 'playing') {
      return
    }
    if (speed !== undefined) {
      this._replaySpeed = speed
    }
    // Only fire the status callback if not already playing — avoid spurious callbacks when changing speed
    if (this._replayStatus !== 'playing') {
      this._updateStatus('playing')
    }

    this._clearPlayInterval()
    const playSpeed = this._replaySpeed
    let debt = 0
    let lastTick = performance.now()
    const MIN_INTERVAL = 4
    const interval = Math.max(MIN_INTERVAL, 1000 / playSpeed)
    this._playIntervalId = setInterval(() => {
      if (this._replayStatus !== 'playing') {
        this._clearPlayInterval()
        return
      }
      const now = performance.now()
      const elapsed = now - lastTick
      lastTick = now
      debt += elapsed * playSpeed / 1000
      const steps = Math.floor(debt)
      debt -= steps
      for (let i = 0; i < steps; i++) {
        this.step()
        // step() may change status (e.g. to 'finished'); re-read to avoid stale narrowing
        const status: string = this._replayStatus
        if (status !== 'playing') break
      }
    }, interval)
  }

  pause (): void {
    this._clearPlayInterval()
    if (this._replayStatus === 'playing') {
      this._updateStatus('paused')
    }
  }

  step (): void {
    if (this._replayStatus === 'idle' || this._replayStatus === 'loading' || this._replayStatus === 'finished') {
      return
    }

    const candle = this._replayBuffer.shift()
    if (candle === undefined) {
      this._clearPlayInterval()
      this._updateStatus('finished')
      return
    }

    this._drawCandle(candle)

    // If this is an in-place update (same timestamp as last drawn entry in _drawnFromBuffer),
    // merge: replace the entry instead of pushing a new one. This happens when a partial
    // candle is completed — the full candle replaces the partial in both _dataList and
    // _drawnFromBuffer. StepBack will pop once, removing the candle entirely.
    const lastDrawn = this._drawnFromBuffer.length > 0 ? this._drawnFromBuffer[this._drawnFromBuffer.length - 1] : null
    if (lastDrawn !== null && candle.timestamp === lastDrawn.timestamp) {
      this._drawnFromBuffer[this._drawnFromBuffer.length - 1] = candle
    } else {
      this._drawnFromBuffer.push(candle)
    }

    // Update effective current time to candle close
    const period = this._s.getPeriod()
    if (period !== null) {
      this._replayCurrentTime = Math.min(
        candle.timestamp + this._getPeriodDurationMs(period),
        this._replayEndTime ?? Date.now()
      )
    }

    this._emitReplayStep(candle, 'forward')
  }

  async stepBack (): Promise<void> {
    if (this._drawnFromBuffer.length === 0) {
      return
    }
    this._clearPlayInterval()

    const candle = this._drawnFromBuffer.pop()!
    const period = this._s.getPeriod()
    const startTime = this._replayStartTime ?? 0

    if (candle.timestamp < startTime && period !== null) {
      // Boundary partial: this candle spans the session start.
      // Instead of removing, replace with a partial showing data up to startTime.
      // Save the full candle to buffer so step forward can complete it.
      this._replayBuffer.unshift(candle)

      // Construct boundary partial via sub-resolution fetch
      const partial = await this._fetchSubResolutionPartial(candle, startTime)
      if (partial !== null) {
        const dataList = this._s._dataList
        if (dataList.length > 0) {
          this._s._dataList[dataList.length - 1] = partial
        }
      } else {
        // Fallback: no sub-resolution data available — the full candle stays in _dataList.
        // Emit an error so the consumer knows partial construction failed.
        this._emitReplayError('partial_construction_failed', { candle, truncateAt: startTime })
      }
      this._replayCurrentTime = this._replayStartTime
      this._finalizeStepBack()

      // Emit the partial (or current last candle in _dataList) — not the popped candle,
      // which is now in the buffer. The consumer should see what's actually visible.
      const lastInDataList = this._s._dataList
      const emitCandle = lastInDataList.length > 0 ? lastInDataList[lastInDataList.length - 1] : candle
      this._emitReplayStep(emitCandle, 'back')
    } else {
      // Normal stepBack: remove the candle from _dataList, put back in buffer
      const dataList = this._s._dataList
      if (dataList.length > 0) {
        this._s._dataList.pop()
      }
      this._replayBuffer.unshift(candle)

      // currentTime = close time of last visible candle in _dataList
      const updatedDataList = this._s._dataList
      if (updatedDataList.length > 0 && period !== null) {
        const last = updatedDataList[updatedDataList.length - 1]
        this._replayCurrentTime = last.timestamp + this._getPeriodDurationMs(period)
      } else {
        this._replayCurrentTime = this._replayStartTime ?? this._currentTimeLimit
      }

      this._finalizeStepBack()
      this._emitReplayStep(candle, 'back')
    }
  }

  /**
   * Fetch sub-resolution candles for anchorCandle from anchorCandle.timestamp to truncateAt,
   * merging them into a single partial OHLCV entry anchored at anchorCandle.timestamp.
   * Uses a two-tier (coarse + fine) fetch strategy determined by the current period.
   * Returns null if prerequisites are missing or no sub-candles fall in the window.
   * If gen is provided, aborts and returns null after each await if the generation has changed.
   */
  private async _fetchSubResolutionPartial (
    anchorCandle: KLineData,
    truncateAt: number,
    gen?: number
  ): Promise<KLineData | null> {
    const dataLoader = this._s._dataLoader
    const symbol = this._s.getSymbol()
    const period = this._s.getPeriod()

    if (dataLoader?.getRange == null || symbol === null || period === null) {
      return null
    }

    const getRange = dataLoader.getRange
    const tiers = this._getSubResolutionTiers(period)
    let subCandles: KLineData[] = []

    if (tiers.coarse !== null) {
      const coarsePeriod = tiers.coarse
      const coarseMs = this._getPeriodDurationMs(coarsePeriod)
      const coarseEnd = anchorCandle.timestamp + Math.floor((truncateAt - anchorCandle.timestamp) / coarseMs) * coarseMs

      if (coarseEnd > anchorCandle.timestamp) {
        const coarseCandles = await new Promise<KLineData[]>((resolve) => {
          void getRange({ symbol, period: coarsePeriod, from: anchorCandle.timestamp, to: coarseEnd, callback: resolve })
        })
        if (gen !== undefined && this._generation !== gen) return null
        subCandles = subCandles.concat(coarseCandles)
      }

      const fineStart = coarseEnd > anchorCandle.timestamp ? coarseEnd : anchorCandle.timestamp
      if (fineStart < truncateAt) {
        const fineCandles = await new Promise<KLineData[]>((resolve) => {
          void getRange({ symbol, period: tiers.fine, from: fineStart, to: truncateAt, callback: resolve })
        })
        if (gen !== undefined && this._generation !== gen) return null
        subCandles = subCandles.concat(fineCandles)
      }
    } else {
      const fineCandles = await new Promise<KLineData[]>((resolve) => {
        void getRange({ symbol, period: tiers.fine, from: anchorCandle.timestamp, to: truncateAt, callback: resolve })
      })
      if (gen !== undefined && this._generation !== gen) return null
      subCandles = fineCandles
    }

    subCandles = subCandles.filter(c => c.timestamp >= anchorCandle.timestamp && c.timestamp < truncateAt)

    if (subCandles.length === 0) {
      return null
    }

    subCandles.sort((a, b) => a.timestamp - b.timestamp)

    return {
      timestamp: anchorCandle.timestamp,
      open: subCandles[0].open,
      high: Math.max(...subCandles.map(c => c.high)),
      low: Math.min(...subCandles.map(c => c.low)),
      close: subCandles[subCandles.length - 1].close,
      volume: subCandles.reduce((sum, c) => sum + (c.volume ?? 0), 0)
    }
  }

  playUntil (timestamp: number, speed?: number): void {
    if (this._replayStatus !== 'ready' && this._replayStatus !== 'paused') {
      return
    }
    // Early exit if target is already reached or buffer is empty
    if (this._replayBuffer.length === 0 || (this._replayCurrentTime !== null && this._replayCurrentTime >= timestamp)) {
      return
    }
    if (speed !== undefined) {
      this._replaySpeed = speed
    }
    this._updateStatus('playing')

    this._clearPlayInterval()
    this._playIntervalId = setInterval(() => {
      if (this._replayStatus !== 'playing') {
        this._clearPlayInterval()
        return
      }
      // Check if current time has reached or exceeded the target
      if (this._replayBuffer.length === 0 || (this._replayCurrentTime !== null && this._replayCurrentTime >= timestamp)) {
        this._clearPlayInterval()
        this._updateStatus('paused')
        return
      }
      this.step()
    }, 1000 / this._replaySpeed)
  }

  getReplayStatus (): ReplayStatus {
    return this._replayStatus
  }

  getReplayCurrentTime (): Nullable<number> {
    return this._replayCurrentTime
  }

  onReplayStatusChange (callback: (status: ReplayStatus) => void): () => void {
    this._replayStatusCallbacks.add(callback)
    return () => { this._replayStatusCallbacks.delete(callback) }
  }

  onReplayStep (callback: (candle: KLineData, direction: 'forward' | 'back') => void): () => void {
    this._replayStepCallbacks.add(callback)
    return () => { this._replayStepCallbacks.delete(callback) }
  }

  onReplayError (callback: (error: { type: string; detail?: unknown }) => void): () => void {
    this._replayErrorCallbacks.add(callback)
    return () => { this._replayErrorCallbacks.delete(callback) }
  }

  /**
   * Clean up all resources — called from Store.destroy().
   * Clears the play interval, all callback sets, pending init promise, and internal caches.
   */
  destroy (): void {
    this._clearPlayInterval()
    this._replayStatusCallbacks.clear()
    this._replayStepCallbacks.clear()
    this._replayErrorCallbacks.clear()
    this._onInitComplete = null
    this._replayBuffer = []
    this._clearDrawnHistory()
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _updateStatus (status: ReplayStatus): void {
    this._replayStatus = status
    for (const cb of this._replayStatusCallbacks) {
      cb(this._replayStatus)
    }
    // Emit initial candle when session becomes ready, so consumers get the
    // starting price through onReplayStep without reaching into getDataList().
    if (status === 'ready') {
      const dataList = this._s._dataList
      if (dataList.length > 0) {
        this._emitReplayStep(dataList[dataList.length - 1], 'forward')
      }
    }
  }

  private _clearDrawnHistory (): void {
    this._drawnFromBuffer = []
  }

  /**
   * Track candles in _dataList that wouldn't exist in a fresh setCurrentTime(_replayStartTime).
   * These are candles whose close time > startTime — loaded because the cursor was
   * advanced past startTime (e.g., by setPeriod). They need to be in _drawnFromBuffer
   * so stepBack can remove them.
   */
  private _trackExtraCandlesBeyondStart (): void {
    const startTime = this._replayStartTime
    const period = this._s.getPeriod()
    if (startTime === null || period === null) return

    const periodMs = this._getPeriodDurationMs(period)
    const dataList = this._s._dataList

    // _postProcessDataBoundary may have already pushed the partial to _drawnFromBuffer.
    // We need to track any OTHER candles between the partial and the start boundary.
    // Walk from the end of _dataList backwards, skip any already tracked.
    const alreadyTracked = new Set(this._drawnFromBuffer.map(c => c.timestamp))

    for (let i = dataList.length - 1; i >= 0; i--) {
      const c = dataList[i]
      if (c.timestamp + periodMs <= startTime) {
        break // this candle and all before it are fully closed at startTime
      }
      if (!alreadyTracked.has(c.timestamp)) {
        this._drawnFromBuffer.unshift(c)
      }
    }
  }

  private _finalizeStepBack (): void {
    this._recalcIndicators()
    this._resetCrosshair()
    this._s._adjustVisibleRange()
    this._triggerLayout(true)
    if (this._replayStatus === 'finished') {
      this._updateStatus('paused')
    }
  }

  private _emitReplayStep (candle: KLineData, direction: 'forward' | 'back'): void {
    for (const cb of this._replayStepCallbacks) {
      cb(candle, direction)
    }
  }

  private _emitReplayError (type: string, detail?: unknown): void {
    const error = { type, detail }
    for (const cb of this._replayErrorCallbacks) {
      cb(error)
    }
  }

  private _clearPlayInterval (): void {
    if (this._playIntervalId !== null) {
      clearInterval(this._playIntervalId)
      this._playIntervalId = null
    }
  }

  private async _waitForInit (): Promise<void> {
    await new Promise<void>((resolve) => {
      this._onInitComplete = resolve
      this._s._loading = false
      this._s._processDataLoad('init')
    })
  }

  private async _fetchReplayBuffer (): Promise<void> {
    const dataLoader = this._s._dataLoader
    const symbol = this._s.getSymbol()
    const period = this._s.getPeriod()
    const getRange = dataLoader?.getRange
    if (getRange == null || this._currentTimeLimit === null || symbol === null || period === null) {
      return
    }
    const currentTimeLimit = this._currentTimeLimit
    // _replayEndTime is always set at setCurrentTime entry (or handlePeriodChange re-fetch uses existing value)
    const to = this._replayEndTime ?? Date.now()
    await new Promise<void>((resolve) => {
      void getRange({
        symbol,
        period,
        from: currentTimeLimit,
        to,
        callback: (data) => {
          this._replayBuffer = data.filter(d => d.timestamp >= currentTimeLimit)
          resolve()
        }
      })
    })
  }

  private _getPeriodDurationMs (period: Period): number {
    switch (period.type) {
      case 'second': return period.span * 1000
      case 'minute': return period.span * 60 * 1000
      case 'hour': return period.span * 60 * 60 * 1000
      case 'day': return period.span * 24 * 60 * 60 * 1000
      case 'week': return period.span * 7 * 24 * 60 * 60 * 1000
      case 'month': return period.span * 30 * 24 * 60 * 60 * 1000
      case 'year': return period.span * 365 * 24 * 60 * 60 * 1000
    }
  }

  private _getSubResolutionTiers (period: Period): { coarse: Period | null; fine: Period } {
    const MIN_1: Period = { type: 'minute', span: 1 }
    const MIN_15: Period = { type: 'minute', span: 15 }
    const HOUR_1: Period = { type: 'hour', span: 1 }
    const DAY_1: Period = { type: 'day', span: 1 }

    switch (period.type) {
      case 'year':
        return { coarse: { type: 'month', span: 1 }, fine: DAY_1 }
      case 'month':
      case 'week':
        return { coarse: DAY_1, fine: HOUR_1 }
      case 'day':
        return { coarse: HOUR_1, fine: MIN_1 }
      case 'hour':
        if (period.span >= 4) return { coarse: HOUR_1, fine: MIN_1 }
        return { coarse: MIN_15, fine: MIN_1 }
      case 'minute':
        return { coarse: null, fine: MIN_1 }
      case 'second':
        // Partials on second resolution don't make sense — return null to skip sub-resolution fetch
        return { coarse: null, fine: { type: 'second', span: 1 } }
    }
  }

  private async _postProcessDataBoundary (gen?: number): Promise<void> {
    const period = this._s.getPeriod()
    const dataList = this._s._dataList

    if (this._currentTimeLimit === null || dataList.length === 0 || period === null) {
      this._triggerDeferredLayout()
      return
    }

    const lastCandle = dataList[dataList.length - 1]
    const periodMs = this._getPeriodDurationMs(period)
    const candleEnd = lastCandle.timestamp + periodMs

    // Case 1: candle has fully closed — valid history, no action
    if (candleEnd <= this._currentTimeLimit) {
      this._triggerDeferredLayout()
      return
    }

    // Case 2: candle just opened at cursor time — no data yet, remove and queue in buffer
    if (this._currentTimeLimit <= lastCandle.timestamp) {
      this._s._dataList.pop()
      // Only queue if not already in buffer (already fetched by _fetchReplayBuffer)
      if (this._replayBuffer.length === 0 || this._replayBuffer[0].timestamp !== lastCandle.timestamp) {
        this._replayBuffer.unshift(lastCandle)
      }
      this._resetCrosshair()
      this._s._adjustVisibleRange()
      this._triggerLayout(true)
      return
    }

    // Case 3: mid-candle — construct partial from sub-resolution data
    const partial = await this._fetchSubResolutionPartial(lastCandle, this._currentTimeLimit, gen)
    if (gen !== undefined && this._generation !== gen) return

    if (partial === null) {
      return
    }

    // Remove the original candle and replace with partial
    const currentDataList = this._s._dataList
    this._s._dataList[currentDataList.length - 1] = partial

    // Always track the partial as a drawn entry so stepBack can handle it
    this._drawnFromBuffer.push(partial)

    // Recalculate indicators after partial candle replacement
    this._recalcIndicators()

    // Force repaint so the partial candle is visible immediately
    this._s._adjustVisibleRange()
    this._triggerLayout(true)

    // Queue the full original candle at the front of the buffer with the ORIGINAL
    // timestamp (not _currentTimeLimit). This way drawCandle sees a matching timestamp
    // and updates the partial candle in place, rather than appending a new bar.
    // Only queue if not already in buffer (already fetched by _fetchReplayBuffer)
    if (this._replayBuffer.length === 0 || this._replayBuffer[0].timestamp !== lastCandle.timestamp) {
      this._replayBuffer.unshift(lastCandle)
    }
  }

  /**
   * Trigger the layout that was deferred during init in playback mode.
   * Called after _postProcessDataBoundary finishes modifying data.
   */
  private _triggerDeferredLayout (): void {
    this._resetCrosshair()
    this._triggerLayout(false)
  }

  private _drawCandle (candle: KLineData): void {
    // Store._addData blocks 'update' type when isInReplay() is true.
    // Save/restore _currentTimeLimit to bypass the guard for engine-driven draws.
    const savedLimit = this._currentTimeLimit
    this._currentTimeLimit = null
    this._s._addData(candle, 'update')
    this._currentTimeLimit = savedLimit
  }

  private _resetCrosshair (): void {
    this._s._crosshair = {}
    this._s.setCrosshair(this._s._crosshair, { notInvalidate: true })
  }

  private _triggerLayout (cacheYAxisWidth: boolean): void {
    this._s._chart.layout({ measureWidth: true, update: true, buildYAxisTick: true, cacheYAxisWidth })
  }

  private _recalcIndicators (): void {
    const filterIndicators = this._s.getIndicatorsByFilter({})
    if (filterIndicators.length > 0) {
      this._s._calcIndicator(filterIndicators)
    }
  }

  private async _getFirstCandleTime (): Promise<number | null> {
    const dataLoader = this._s._dataLoader
    const symbol = this._s.getSymbol()
    const period = this._s.getPeriod()

    if (dataLoader?.getFirstCandleTime == null || symbol === null || period === null) {
      return null
    }
    const getFirstCandleTime = dataLoader.getFirstCandleTime
    return await new Promise<number | null>((resolve) => {
      void getFirstCandleTime({
        symbol,
        period,
        callback: (timestamp) => {
          resolve(timestamp)
        }
      })
    })
  }
}
