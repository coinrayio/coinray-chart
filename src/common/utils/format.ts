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

import { isNumber, isValid } from './typeChecks'

export interface DateTime {
  YYYY: string
  MM: string
  DD: string
  HH: string
  mm: string
  ss: string
}

const reEscapeChar = /\\(\\)?/g
const rePropName = RegExp(
  '[^.[\\]]+' + '|' +
  '\\[(?:' +
    '([^"\'][^[]*)' + '|' +
    '(["\'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2' +
  ')\\]' + '|' +
  '(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))'
  , 'g')

export function formatValue (data: unknown, key: string, defaultValue?: unknown): unknown {
  if (isValid(data)) {
    const path: string[] = []
    key.replace(rePropName, (subString: string, ...args: unknown[]) => {
      let k = subString
      if (isValid(args[1])) {
        k = (args[2] as string).replace(reEscapeChar, '$1')
      } else if (isValid(args[0])) {
        k = (args[0] as string).trim()
      }
      path.push(k)
      return ''
    })
    let value = data
    let index = 0
    const length = path.length
    while (isValid(value) && index < length) {
      value = value?.[path[index++]]
    }
    return isValid(value) ? value : (defaultValue ?? '--')
  }
  return defaultValue ?? '--'
}

export function formatTimestampToDateTime (dateTimeFormat: Intl.DateTimeFormat, timestamp: number): DateTime {
  const date: Record<string, string> = {}
  dateTimeFormat.formatToParts(new Date(timestamp)).forEach(({ type, value }) => {
    switch (type) {
      case 'year': {
        date.YYYY = value
        break
      }
      case 'month': {
        date.MM = value
        break
      }
      case 'day': {
        date.DD = value
        break
      }
      case 'hour': {
        date.HH = value === '24' ? '00' : value
        break
      }
      case 'minute': {
        date.mm = value
        break
      }
      case 'second': {
        date.ss = value
        break
      }
      default: { break }
    }
  })
  return date as unknown as DateTime
}

export function formatTimestampByTemplate (dateTimeFormat: Intl.DateTimeFormat, timestamp: number, template: string): string {
  const date = formatTimestampToDateTime(dateTimeFormat, timestamp)
  return template.replace(/YYYY|YY|MMM|MM|DD|D|ddd|HH|mm|ss/g, key => {
    switch (key) {
      // Two-digit year, as TradingView writes it in the crosshair label (`'26`).
      case 'YY': return date.YYYY.slice(-2)
      case 'MMM': return MONTH_NAMES[+date.MM - 1] ?? date.MM
      // Day of month without the leading zero: the time axis labels a day as `8`.
      case 'D': return `${+date.DD}`
      case 'ddd': return WEEKDAY_NAMES[new Date(Date.UTC(+date.YYYY, +date.MM - 1, +date.DD)).getUTCDay()]
      default: return date[key as keyof DateTime]
    }
  })
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatPrecision (value: string | number, precision?: number): string {
  const v = +value
  if (isNumber(v)) {
    return v.toFixed(precision ?? 2)
  }
  return `${value}`
}

export function formatBigNumber (value: string | number): string {
  const v = +value
  if (isNumber(v)) {
    if (v > 1000000000) {
      return `${+((v / 1000000000).toFixed(3))}B`
    }
    if (v > 1000000) {
      return `${+((v / 1000000).toFixed(3))}M`
    }
    if (v > 1000) {
      return `${+((v / 1000).toFixed(3))}K`
    }
  }
  return `${value}`
}

export function formatThousands (value: string | number, sign: string): string {
  const vl = `${value}`
  if (sign.length === 0) {
    return vl
  }
  if (vl.includes('.')) {
    const arr = vl.split('.')
    return `${arr[0].replace(/(\d)(?=(\d{3})+$)/g, $1 => `${$1}${sign}`)}.${arr[1]}`
  }
  return vl.replace(/(\d)(?=(\d{3})+$)/g, $1 => `${$1}${sign}`)
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

function toSubscript (n: number): string {
  return `${n}`.replace(/\d/g, d => SUBSCRIPT_DIGITS[+d])
}

// `0.000000024` -> sign, integer, separator, fraction. Only values below 1
// fold, so the integer part is a bare zero. The separator may be `,` when the
// host formats with a European decimal comma.
const FOLDABLE = /^(-?)0([.,])(\d+)$/

/**
 * ALT-34: compact form for small decimals, TradingView's subscript notation.
 * `0.000000024` renders `0.0₈24`: the subscript counts every zero between the
 * separator and the first significant digit.
 *
 * The values are folded as a set, the way the price axis needs them:
 *
 *  1. One zero count for all of them, the smallest among them, so labels up
 *     an axis never switch from `₉` to `₈` partway. A value with more zeros
 *     keeps the extra ones as digits (`0.0₈09`).
 *  2. Trailing zeros are `.toFixed()` padding, not meaningful digits. They are
 *     trimmed, but only as far as every value in the set allows, so the
 *     labels keep a common length.
 *
 * Nothing folds unless that shared count reaches `threshold`: a set holding
 * `0.0009` (three zeros) prints in full. Values that are not decimals below 1
 * pass through unchanged and, since they have no leading zeros to share,
 * stop the set folding at all.
 */
export function formatFoldDecimals (values: Array<string | number>, threshold: number): string[] {
  const texts = values.map(value => `${value}`)
  const parts = texts.map(text => FOLDABLE.exec(text))
  let zeroCount = Number.MAX_SAFE_INTEGER
  for (let i = 0; i < texts.length; i++) {
    const match = parts[i]
    if (match === null) {
      // `-`, `NaN` and friends carry no digits to fold; anything else is >= 1.
      if (/[1-9]/.test(texts[i])) return texts
      continue
    }
    const fraction = match[3]
    const leading = /^0*/.exec(fraction)![0].length
    if (leading < fraction.length) {
      zeroCount = Math.min(zeroCount, leading)
    }
  }
  if (zeroCount === Number.MAX_SAFE_INTEGER) {
    // All zero. Padding long enough to fold (`0.000000000` at precision 9)
    // says nothing, so it prints as `0`; short padding (`0.00`) stays.
    return texts.map((text, i) => {
      const match = parts[i]
      return match !== null && match[3].length >= threshold ? '0' : text
    })
  }
  if (zeroCount < threshold) {
    return texts
  }
  let length = 1
  parts.forEach(match => {
    if (match !== null) {
      length = Math.max(length, match[3].slice(zeroCount).replace(/0+$/, '').length)
    }
  })
  return texts.map((text, i) => {
    const match = parts[i]
    if (match === null) return text
    const [, sign, separator, fraction] = match
    const significand = fraction.slice(zeroCount, zeroCount + length).padEnd(length, '0')
    if (!/[1-9]/.test(significand)) return '0'
    return `${sign}0${separator}0${toSubscript(zeroCount)}${significand}`
  })
}

/** One value on its own: see `formatFoldDecimals`. */
export function formatFoldDecimal (value: string | number, threshold: number): string {
  return formatFoldDecimals([value], threshold)[0]
}

/**
 * The zero count `formatFoldDecimals` would give this set, or null when the
 * set does not fold. The price axis records it so every other price label on
 * that axis can fold to the same count (see `formatFoldDecimalsAt`).
 */
export function foldZeroCount (values: Array<string | number>, threshold: number): number | null {
  let zeroCount = Number.MAX_SAFE_INTEGER
  for (const value of values) {
    const text = `${value}`
    const match = FOLDABLE.exec(text)
    if (match === null) {
      if (/[1-9]/.test(text)) return null
      continue
    }
    const fraction = match[3]
    const leading = /^0*/.exec(fraction)![0].length
    if (leading < fraction.length) zeroCount = Math.min(zeroCount, leading)
  }
  return zeroCount === Number.MAX_SAFE_INTEGER || zeroCount < threshold ? null : zeroCount
}

/**
 * Folds `values` to a given zero count, the price axis's, so a label beside
 * the axis reads in its terms: on an axis of `0.0₈16`…`0.0₈48`, the current
 * price 0.00000000076 is `0.0₈076`, not `0.0₉76`. A value with fewer zeros
 * than that (above the axis's scale) cannot be written at it without losing
 * digits and folds on its own, as does everything when `zeroCount` is null.
 * Trailing padding is trimmed as far as every folded value allows, as in
 * `formatFoldDecimals`.
 */
export function formatFoldDecimalsAt (values: Array<string | number>, zeroCount: number | null, threshold: number): string[] {
  if (zeroCount === null) return formatFoldDecimals(values, threshold)
  const texts = values.map(value => `${value}`)
  const parts = texts.map(text => {
    const match = FOLDABLE.exec(text)
    if (match === null) return null
    const fraction = match[3]
    const leading = /^0*/.exec(fraction)![0].length
    return leading >= zeroCount && leading < fraction.length ? match : null
  })
  let length = 1
  parts.forEach(match => {
    if (match !== null) {
      length = Math.max(length, match[3].slice(zeroCount).replace(/0+$/, '').length)
    }
  })
  return texts.map((text, i) => {
    const match = parts[i]
    if (match === null) return formatFoldDecimal(text, threshold)
    const [, sign, separator, fraction] = match
    return `${sign}0${separator}0${toSubscript(zeroCount)}${fraction.slice(zeroCount, zeroCount + length).padEnd(length, '0')}`
  })
}

export function formatTemplateString (template: string, params: Record<string, unknown>): string {
  // Supports fallback syntax: {keyA||keyB||keyC} resolves to the first key
  // whose value is valid. Useful for optional display fields — e.g.
  // `{shortName||ticker}` shows shortName when set, otherwise ticker.
  return template.replace(/\{([\w|]+)\}/g, (_, expr) => {
    const keys = (expr as string).split('||')
    for (const key of keys) {
      const value = params[key]
      if (isValid(value)) {
        return value as string
      }
    }
    return `{${keys[0]}}`
  })
}
