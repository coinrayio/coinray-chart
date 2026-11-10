import { describe, expect, it } from 'vitest'
import { buildProfile, profileBoxes, VOLUME_PROFILE_COLORS, type ProfileLayout } from '../extension/overlay/tv/forecastData/volumeProfile'

const bar = (open: number, close: number, high: number, low: number, volume: number) => ({ timestamp: 0, open, close, high, low, volume })
// Two rows, 0..1 and 1..2: the low row all up volume, the high row 30 up and 10 down.
const profile = buildProfile([bar(0, 1, 1, 0, 60), bar(1, 2, 2, 1, 30), bar(2, 1, 2, 1, 10)], 0, 2, 2, 100)!
const layout: ProfileLayout = {
  x0: 0, x1: 100, fromRight: false, widthPercent: 50, mode: 'upDown',
  upColor: 'rgba(0, 0, 255, 1)', downColor: 'rgba(255, 0, 0, 1)', vaUpColor: 'rgba(0, 0, 255, 1)', vaDownColor: 'rgba(255, 0, 0, 1)',
}
const toY = (price: number) => 100 - price * 10

describe('profileBoxes', () => {
  it('scales the busiest row to the width share, split up then down', () => {
    const { boxes, pocY } = profileBoxes(profile, layout, toY)
    expect(boxes.map((b) => [b.key, b.x, b.width])).toEqual([['up_0', 0, 50], ['up_1', 0, 25], ['down_1', 25, 25 / 3]])
    // Both rows hold 60; TV takes the one nearer the middle, the earlier on a tie.
    expect(pocY).toBe(95)
  })

  it('grows from the right edge leftward', () => {
    const { boxes } = profileBoxes(profile, { ...layout, fromRight: true }, toY)
    expect(boxes[0]).toMatchObject({ key: 'up_0', x: 50, width: 50 })
  })

  it('draws a delta as the net run then the matched volume twice, fading', () => {
    const { boxes } = profileBoxes(profile, { ...layout, mode: 'delta' }, toY)
    expect(boxes.filter((b) => b.key.startsWith('delta_1')).map((b) => [b.width, b.color])).toEqual([
      [50 * 20 / 60, 'rgba(0, 0, 255, 1)'],
      [50 * 10 / 60, 'rgba(0, 0, 255, 0.5)'],
      [50 * 10 / 60, 'rgba(0, 0, 255, 0.25)'],
    ])
  })

  it('exposes TV\'s colours', () => {
    expect(VOLUME_PROFILE_COLORS.poc).toBe('#ff0000')
  })
})
