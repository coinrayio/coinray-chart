# Replay Engine

The replay engine (`ReplayEngine.ts`) provides chart playback — time-travel through
historical candle data with step, play, pause, and resolution change support. It owns
the replay buffer, playback controls, partial candle construction, and all async state
management. Consumers access it via `sc.replay` on the Superchart instance.

## State Machine

```
idle → loading → ready → playing ⇄ paused → finished
                   ↑        ↓
                   └─ loading ←┘   (setCurrentTime / setPeriod during playback)

Any state → idle                   (setCurrentTime(null) / setSymbol)
```

- **idle**: No replay session. Chart is in normal live mode.
- **loading**: Async operations in progress (init fetch, buffer fetch, partial construction).
- **ready**: Session active, waiting for user action (step/play).
- **playing**: Continuous playback via setInterval.
- **paused**: Playback paused, can resume or step.
- **finished**: Buffer exhausted. Can step back or restart.

## Data Flow

### Starting a session: `setCurrentTime(timestamp)`

1. Increment generation counter (cancels any in-flight operations)
2. Validate: reject second-resolution, check firstCandleTime
3. Set `_currentTimeLimit = timestamp`
4. Trim or re-fetch `_dataList` to show history up to the cursor
5. Fetch replay buffer via `getRange` (candles from cursor to endTime)
6. Run `_postProcessDataBoundary` — handle the last candle:
   - **Case 1 (fully closed)**: Keep as-is, trigger deferred layout
   - **Case 2 (just opened at cursor)**: Move to buffer
   - **Case 3 (mid-candle)**: Construct partial from sub-resolution data
7. Track extra candles beyond `_replayStartTime` in `_drawnFromBuffer`
8. Status → ready

### Stepping

- **step()**: Shift candle from `_replayBuffer`, draw via `_addData('update')`,
  push to `_drawnFromBuffer`. If same timestamp as last drawn (partial completion),
  merge instead of push.
- **stepBack()**: Pop from `_drawnFromBuffer`, pop from `_dataList`, return candle
  to buffer. If the candle spans `_replayStartTime` (boundary partial case),
  construct a new partial at the start time instead of removing.
- **play(speed)**: Start setInterval calling `step()` at the given rate.
- **playUntil(timestamp)**: Play until `_replayCurrentTime >= timestamp`, then pause.

### Resolution change: `setPeriod` during playback

Handled by `handlePeriodChange`:
1. Advance `_currentTimeLimit` to the actual playback position
2. Clear buffer and drawn history
3. Re-fetch at the new resolution via `resetData`
4. Re-run boundary processing and extra-candle tracking
5. If no data at the new resolution: full revert to previous period

### Exiting: `setCurrentTime(null)`

Calls `exitPlayback()` (clears all replay state) then `resetData()` to resume live mode.

## Current Time (Time-Travel Semantics)

`getReplayCurrentTime()` returns the effective "now" from a time-traveler's perspective.
It represents the moment the user is observing — what they would see if they were
actually looking at a live chart at that point in time.

**Current time = the close time of the last visible candle.**

This is NOT the timestamp of the last drawn candle. A candle's timestamp is its START
time (when the period opens). Its close time is `timestamp + periodDuration`. The
difference matters:

| Last drawn candle (timestamp) | Period | Current time (close) |
|-------------------------------|--------|---------------------|
| 09:00 | 1hr | 10:00 |
| 08:00 | 4hr | 12:00 |
| Apr 2 00:00 | 1D | Apr 3 00:00 |

A time-traveler at 10:00 would see the 09:00 1hr candle as the most recent CLOSED
candle. The 10:00 candle hasn't formed yet — it's in the future. So `currentTime = 10:00`
means "I'm at 10:00, the last thing I can see is the completed 09:00 candle."

**Exception: partial candles.** When a partial candle is visible (mid-period cursor),
current time equals the cursor timestamp — the time up to which the partial has data.
Not the candle's close time (which hasn't been reached yet).

## Partial Candles

A partial candle appears when the cursor doesn't align with a candle boundary — e.g.,
switching from 1min to 1hr at 09:07 produces a partial 09:00 candle with only 7 minutes
of data.

**Construction:** `_fetchSubResolutionPartial` fetches candles at a smaller resolution
(two-tier: coarse like 15min for the bulk, fine like 1min for the remainder) and merges
them into a single OHLCV entry.

**Lifecycle:** The partial is shown immediately. First step forward completes it (in-place
update). After completion, the partial is forgotten — stepBack removes the candle entirely,
no partial state is ever restored.

**Boundary partials:** When stepping back would put current time before `_replayStartTime`,
the candle is replaced with a new partial constructed at the start time. This represents
the candle's state at session start. Stepping forward from it completes it normally.

## Store Integration

The engine is a standalone class. Store integrates it through 5 hooks in existing methods:

1. **`setSymbol`**: Checks `isInReplay()`, calls `exitPlayback()` before symbol change
2. **`setPeriod`**: Checks `isInReplay()`, delegates to `handlePeriodChange()`
3. **`_addData` guard**: Blocks live `'update'` candles when `isInReplay()` — prevents
   subscribeBar data from reaching the chart during replay
4. **`_addData` layout suppression**: Skips layout during init in replay mode — deferred
   to `_postProcessDataBoundary` to prevent partial candle flicker
5. **`_processDataLoad`**: In replay mode, uses `_currentTimeLimit` as init timestamp,
   skips `subscribeBar`, and notifies the engine via `notifyInitComplete()`

The engine communicates with Store through the `ReplayEngineHost` interface — a set of
callbacks wired in the Store constructor. This keeps the engine decoupled from Store
internals.

## Generation Counter

`_generation` is incremented at the start of `setCurrentTime` and `handlePeriodChange`.
After each `await` in these methods, the code checks if the generation still matches.
If it doesn't, a newer operation has started — the current one aborts silently. This
prevents race conditions when the user rapidly clicks "Jump" or changes resolution.

## Consumer Access

```ts
const sc = new Superchart({ ... })

// Access the engine (null before chart mounts)
sc.replay?.setCurrentTime(startTime)
sc.replay?.play(20)
sc.replay?.onReplayStatusChange(status => console.log(status))
sc.replay?.onReplayStep((candle, direction) => updateUI(candle))
sc.replay?.onReplayError(error => showToast(error.type))
```

The `ReplayEngine` type is exported from `klinecharts` and re-exported from `superchart`
for consumer-side typing.
