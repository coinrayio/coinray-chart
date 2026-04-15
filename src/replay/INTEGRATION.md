# Replay Engine — Consumer Integration Guide

This guide covers what a consumer app (e.g. Altrady) needs to integrate Superchart's
replay engine. For engine internals, see `packages/coinray-chart/src/replay/README.md`.
For a working reference implementation, see `.storybook/api-stories/replay/`.

## Prerequisites

### Datafeed requirements

The replay engine requires two optional `Datafeed` methods. Without them, replay will
degrade or fail:

| Method | Required for | Consequence if missing |
|--------|-------------|----------------------|
| `getFirstCandleTime(ticker, resolution, callback)` | `setCurrentTime` validation | Engine skips the "is this timestamp too early?" check — user can start a session before any data exists, resulting in an empty chart |
| `getBars` with `countBack: 0` | `getRange` (buffer fetch, partial construction) | **Replay will not work.** The `createDataLoader` bridge calls `getBars` with `countBack: 0` and explicit `from`/`to` to fetch arbitrary ranges. Your `getBars` must handle this — when `countBack === 0`, use the `from` parameter directly instead of computing it from `countBack`. |

If your existing `getBars` ignores `from` when `countBack > 0`, that's fine — it only
matters when `countBack === 0`.

### Unsupported resolutions

Second-resolution periods (e.g. `1s`, `5s`) are rejected by `setCurrentTime` with an
`unsupported_resolution` error. Weekly and monthly resolutions work in theory but depend
on your datafeed returning data at those resolutions.

## Accessing the engine

```ts
const sc = new Superchart({ ... })

// sc.replay is null until the chart mounts.
// If you need immediate access, poll:
const interval = setInterval(() => {
  if (sc.replay !== null) {
    clearInterval(interval)
    wireReplayCallbacks(sc.replay)
  }
}, 50)
```

The `ReplayEngine` type is exported from both `klinecharts` and `superchart`:
```ts
import type { ReplayEngine } from 'superchart'
```

## Starting a session

```ts
// Start replay at a specific timestamp (milliseconds)
await sc.replay.setCurrentTime(startTimeMs)

// With a custom end time (default: now)
await sc.replay.setCurrentTime(startTimeMs, endTimeMs)
```

`setCurrentTime` is async — it fetches history and builds the replay buffer. The
status transitions through `idle → loading → ready`. Wait for it to resolve (or
listen to `onReplayStatusChange`) before calling `play`/`step`.

The `endTime` parameter caps how far forward the buffer extends. Omit it (or pass
`null`) to use the current time. Useful if you want to replay a specific historical
window rather than playing all the way to the present.

## Playback controls

```ts
sc.replay.play(speed)      // Start continuous playback. Speed = candles per second (default: 1)
sc.replay.pause()          // Pause playback
sc.replay.step()           // Advance one candle
await sc.replay.stepBack() // Remove last candle (async — may construct a boundary partial)
sc.replay.playUntil(ts)    // Play until currentTime >= ts, then auto-pause
```

Speed values are candles per second: `1, 2, 5, 10, 20, 100, 200, 400` are reasonable
options. Higher values just reduce the interval between steps.

## Subscribing to events

```ts
// Status changes (idle/loading/ready/playing/paused/finished)
const unsub1 = sc.replay.onReplayStatusChange((status) => {
  updateUI(status)
})

// Each step forward/back
const unsub2 = sc.replay.onReplayStep((candle, direction) => {
  // direction: 'forward' | 'back'
  // candle: the KLineData that was added/removed
  const currentTime = sc.replay.getReplayCurrentTime()
  updateTimeDisplay(currentTime)
})

// Errors
const unsub3 = sc.replay.onReplayError((error) => {
  // error.type is a key, not a message. Map to your own UI strings:
  //   'unsupported_resolution'       — resolution not supported (second-resolution or 1W/1M w/o data)
  //   'no_data_at_time'              — cursor time is before first available candle at this resolution
  //   'resolution_change_failed'     — period change failed, session auto-reverted
  //   'partial_construction_failed'  — sub-resolution fetch failed
  showToast(errorMessages[error.type])
})

// Clean up on dispose
unsub1(); unsub2(); unsub3()
```

## Period changes during replay

When the user changes the period (resolution) during an active replay session,
Superchart's `setPeriod` automatically delegates to the engine's `handlePeriodChange`.
You don't need to call any replay method — just call `setPeriod` normally.

**Important: period revert sync.** If the new resolution has no data, the engine
reverts to the previous period internally. But your UI's period selector won't know
unless you sync it. Superchart handles this automatically via an internal error
listener that updates the signal store. If your app has its own period state outside
of Superchart's store, subscribe to `onReplayError` and check for
`resolution_change_failed` to revert your UI:

```ts
sc.replay.onReplayError((error) => {
  if (error.type === 'resolution_change_failed') {
    // Read the actual period from the chart engine
    const chart = sc.getChart()
    const enginePeriod = chart?.getPeriod()
    if (enginePeriod) {
      myAppState.setPeriod(enginePeriod) // sync your UI
    }
  }
})
```

## Symbol changes during replay

Calling `sc.setSymbol()` while replay is active automatically exits the replay
session (status → idle, chart resumes live mode). You don't need to call
`setCurrentTime(null)` first.

## Exiting replay

```ts
// Explicit exit — clears replay state, resumes live data
await sc.replay.setCurrentTime(null)
```

## What to disable during replay

The engine handles data isolation (blocks live candle updates, skips subscriptions),
but your UI should reflect that the user is in a historical context:

- **Live price ticker / current price display** — hide or freeze; the chart shows
  historical data, not the current market
- **Order placement** — disable or gate behind a confirmation; the displayed price
  is historical
- **Alerts based on chart price** — suppress or clearly label as replay prices
- **"Go to live" / "Jump to now" button** — show this so users can exit replay easily

## Current time semantics

`sc.replay.getReplayCurrentTime()` returns the effective "now" from a time-traveler's
perspective — the close time of the last visible candle, not its start time.

| Last candle timestamp | Period | `getReplayCurrentTime()` |
|----------------------|--------|--------------------------|
| 09:00 | 1hr | 10:00 |
| 08:00 | 4hr | 12:00 |

Exception: when a partial candle is visible (cursor mid-period), current time equals
the cursor timestamp — the point up to which the partial has data.

## Full example

```ts
import { Superchart, createDataLoader } from 'superchart'
import type { ReplayEngine } from 'superchart'

const sc = new Superchart({
  container: '#chart',
  dataLoader: createDataLoader(myDatafeed), // datafeed must support countBack: 0
  symbol: { ticker: 'BTCUSDT', pricePrecision: 2, volumePrecision: 0 },
  period: { span: 1, type: 'hour', text: '1H' },
})

function onReplayReady(engine: ReplayEngine) {
  engine.onReplayStatusChange(updateStatusUI)
  engine.onReplayStep(() => {
    updateTimeDisplay(engine.getReplayCurrentTime())
  })
  engine.onReplayError(handleError)
}

// Wait for chart mount
const poll = setInterval(() => {
  if (sc.replay) {
    clearInterval(poll)
    onReplayReady(sc.replay)
  }
}, 50)

// Start replay (called from UI)
async function startReplay(timestamp: number) {
  await sc.replay?.setCurrentTime(timestamp)
  sc.replay?.play(20) // 20 candles/sec
}
```
