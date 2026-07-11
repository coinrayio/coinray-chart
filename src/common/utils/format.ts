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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- ignore
  return template.replace(/YYYY|MM|DD|HH|mm|ss/g, key => date[key])
}

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

/** ALTD-1896 — compact form for small decimals with `threshold`+
 *  leading zeros between the decimal point and the first
 *  non-zero digit. Two behaviours worth calling out:
 *
 *  1. Notation absorbs the literal `0` into the count. Value
 *     `0.0001200` renders as `0.{4}12`, not `0.0{3}1200`. The
 *     old form put a literal `0` before the `{n}` and was read
 *     as "0.0 plus annotation" — visually ambiguous by an
 *     off-by-one. `0.{n}significand` reads as "0. followed by
 *     n zeros, then the significand" with one unambiguous
 *     subscript.
 *
 *  2. Trailing zeros in the significand are trimmed. A price
 *     of 0.00012 coming through `.toFixed(pricePrecision)` at
 *     precision 7 arrives here as `"0.0001200"`; users saw the
 *     three trailing zeros as if they were meaningful digits.
 *     After the trim it renders `0.{4}12`.
 *
 *  `threshold` still counts the minimum leading zeros in the
 *  fractional part required to trigger the fold. Values below
 *  the threshold pass through unchanged with their `.toFixed`
 *  padding intact — same as the old behaviour there. */
export function formatFoldDecimal (value: string | number, threshold: number): string {
  const vl = `${value}`
  const reg = new RegExp('\\.0{' + threshold + ',}[1-9][0-9]*$')
  if (reg.test(vl)) {
    const [integer, fraction] = vl.split('.')
    const match = /^0*/.exec(fraction)
    if (isValid(match)) {
      const zeroCount = match[0].length
      // Trim trailing zeros — they're `.toFixed()` padding, not
      // meaningful digits. The regex above guarantees the
      // significand starts with a non-zero digit, so an empty
      // string can't come out of this.
      const significand = fraction.slice(zeroCount).replace(/0+$/, '')
      return `${integer}.{${zeroCount}}${significand}`
    }
  }
  return vl
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
