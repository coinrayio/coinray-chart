import { describe, expect, it } from 'vitest'

import {
  LocalClock, TimeMarkWeight, timeMarkWeight, selectTimeTickMarks, timeMarkTemplate, boldWeightThreshold
} from '../common/timeTickMarks'
import { formatTimestampByTemplate } from '../common/utils/format'

function format (timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en', {
    hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone
  })
}

function weightsFor (clock: LocalClock, start: number, step: number, count: number): number[] {
  const out: number[] = []
  let prev = clock.get(start - step)
  for (let i = 0; i < count; i++) {
    const cur = clock.get(start + i * step)
    out.push(timeMarkWeight(prev, cur))
    prev = cur
  }
  return out
}

describe('time tick marks', () => {
  it('weighs a boundary by the largest unit it crosses', () => {
    const clock = new LocalClock(format('UTC'))
    const at = (iso: string): ReturnType<LocalClock['get']> => clock.get(Date.parse(iso))
    expect(timeMarkWeight(at('2025-12-31T23:00Z'), at('2026-01-01T00:00Z'))).toBe(TimeMarkWeight.Year)
    expect(timeMarkWeight(at('2026-09-30T00:00Z'), at('2026-10-01T00:00Z'))).toBe(TimeMarkWeight.Month)
    expect(timeMarkWeight(at('2026-10-07T23:00Z'), at('2026-10-08T00:00Z'))).toBe(TimeMarkWeight.Day)
    expect(timeMarkWeight(at('2026-10-08T11:00Z'), at('2026-10-08T12:00Z'))).toBe(TimeMarkWeight.Hour12)
    expect(timeMarkWeight(at('2026-10-08T13:00Z'), at('2026-10-08T14:00Z'))).toBe(TimeMarkWeight.Hour1)
    expect(timeMarkWeight(at('2026-10-08T14:10Z'), at('2026-10-08T14:15Z'))).toBe(TimeMarkWeight.Minute15)
  })

  it('reads wall-clock time in the chart timezone, across DST', () => {
    const clock = new LocalClock(format('Europe/Amsterdam'))
    // 2026-10-25 01:00Z is 02:00 CET, just after the clocks go back.
    const t = clock.get(Date.parse('2026-10-25T01:00Z'))
    expect(t.secondOfDay).toBe(2 * 3600)
    expect(clock.get(Date.parse('2026-07-01T22:30Z')).day).toBe(2)
  })

  it('keeps round boundaries and spaces the rest', () => {
    const clock = new LocalClock(format('UTC'))
    const start = Date.parse('2026-10-08T00:00Z')
    const weights = weightsFor(clock, start, 60000, 241) // 4h of 1m bars
    const marks = selectTimeTickMarks(weights, 20)
    const labels = marks.map(m => formatTimestampByTemplate(clock.format, start + m.index * 60000, timeMarkTemplate(m.weight, false)))
    expect(labels).toEqual(['8', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30', '04:00'])
  })

  it('skips minute levels that would land at odd times', () => {
    const clock = new LocalClock(format('UTC'))
    const start = Date.parse('2026-10-08T11:00Z')
    const weights = weightsFor(clock, start, 60000, 61)
    const marks = selectTimeTickMarks(weights, 7)
    const labels = marks.map(m => formatTimestampByTemplate(clock.format, start + m.index * 60000, timeMarkTemplate(m.weight, false)))
    expect(labels).toEqual(['11:00', '11:15', '11:30', '11:45', '12:00'])
  })

  it('labels months and years on a daily series', () => {
    const clock = new LocalClock(format('UTC'))
    const start = Date.parse('2025-10-01T00:00Z')
    const day = 86400000
    const weights = weightsFor(clock, start, day, 200)
    const marks = selectTimeTickMarks(weights, 25)
    const labels = marks.map(m => formatTimestampByTemplate(clock.format, start + m.index * day, timeMarkTemplate(m.weight, false)))
    expect(labels).toEqual(['Oct', 'Nov', 'Dec', '2026', 'Feb', 'Mar', 'Apr'])
    expect(marks.filter(m => m.weight >= boldWeightThreshold(marks)).map(m => m.weight)).toEqual([TimeMarkWeight.Year])
  })

  it('bolds the heaviest labels only among lighter ones', () => {
    const days = [{ index: 0, weight: TimeMarkWeight.Day }, { index: 24, weight: TimeMarkWeight.Day }]
    expect(boldWeightThreshold(days)).toBe(Infinity)
    expect(boldWeightThreshold([...days, { index: 12, weight: TimeMarkWeight.Hour12 }])).toBe(TimeMarkWeight.Day)
    // 12:00 and 18:00 are both hour labels: neither is bold over the other.
    expect(boldWeightThreshold([{ index: 0, weight: TimeMarkWeight.Hour12 }, { index: 6, weight: TimeMarkWeight.Hour6 }])).toBe(Infinity)
  })

  it('is independent of where the series is cut', () => {
    const clock = new LocalClock(format('UTC'))
    const start = Date.parse('2026-10-08T00:00Z')
    const weights = weightsFor(clock, start, 300000, 600)
    const a = selectTimeTickMarks(weights, 7).map(m => m.index)
    const b = selectTimeTickMarks(weights.slice(0, 500), 7).map(m => m.index)
    expect(b.slice(0, -2)).toEqual(a.slice(0, b.length - 2))
  })
})

describe('date template tokens', () => {
  it('formats the crosshair label the TradingView way', () => {
    const f = format('UTC')
    expect(formatTimestampByTemplate(f, Date.parse('2026-10-08T14:05Z'), "DD MMM 'YY  HH:mm")).toBe("08 Oct '26  14:05")
    expect(formatTimestampByTemplate(f, Date.parse('2026-10-08T14:05Z'), 'ddd')).toBe('Thu')
    expect(formatTimestampByTemplate(f, Date.parse('2026-10-08T14:05Z'), 'YYYY-MM-DD D')).toBe('2026-10-08 8')
  })
})
