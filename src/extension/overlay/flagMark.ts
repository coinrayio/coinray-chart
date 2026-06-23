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

/**
 * Flag Mark overlay — TradingView-style compact bar marker.
 *
 * One click drops a small flag at the click point — x snaps to the
 * nearest bar, y is free. The flag is a vertical pole with a small
 * rect attached at the top-right; the rect's right edge has a V
 * notch (chevron pointing left into the flag body). Pole height is
 * twice the rect height; there's a 2-px gap between the pole and
 * the rect so they read as separate shapes.
 *
 * Single-colour control: only the flag rect is user-pickable
 * (`backgroundColor` → `polygon.color`); the pole stays a neutral
 * greyish colour to match Note's leader line.
 *
 * No text — just the glyph. Single-point overlay, so dragging
 * anywhere on the flag translates the one point and re-snaps to
 * the nearest bar on drop.
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'

interface FlagMarkOverlayData {
  /** User-set fill colour for the flag rect. */
  backgroundColor?: string
}

interface OverlayStyleSlice {
  polygon?: { color?: string }
}

// Pole stays a fixed neutral grey regardless of overlay styling —
// matches Note's leader line so the two marker types read
// consistently in a chart with both present.
const POLE_COLOR = '#787b86'
const DEFAULT_FLAG_COLOR = '#ef5350'

// Pole / flag dimensions. Pole height = 2 × rect height per TV's
// proportion. Width tuned so the flag reads at chart density without
// crowding adjacent bars.
const POLE_HEIGHT = 22
const POLE_WIDTH = 1
const RECT_HEIGHT = 11
const RECT_WIDTH = 18
const POLE_RECT_GAP = 2
const V_DEPTH = 4

function parseExtendData (extendData: unknown): FlagMarkOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as FlagMarkOverlayData
  }
  return {}
}

const flagMark: OverlayTemplate = {
  name: 'flagMark',
  // Single-click overlay; engine convention is clicks + 1.
  totalStep: 2,
  needDefaultPointFigure: false,
  // Surface the snapped bar on the x-axis with our own always-on
  // figure (same pattern Signpost uses) so the bar's time is
  // visible without selecting the flag.
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 1) return []

    const data = parseExtendData(overlay.extendData)
    const styles = (overlay.styles ?? {}) as OverlayStyleSlice

    const flagColor = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_FLAG_COLOR

    // Anchor = bottom of the pole. The flag rises up-and-right from
    // the click point so the click target reads as "this is the bar
    // I'm marking".
    const anchor = coordinates[0]
    const poleTop = { x: anchor.x, y: anchor.y - POLE_HEIGHT }

    const rectLeft = anchor.x + POLE_RECT_GAP
    const rectRight = rectLeft + RECT_WIDTH
    const rectTop = poleTop.y
    const rectBottom = rectTop + RECT_HEIGHT
    const rectMidY = rectTop + RECT_HEIGHT / 2

    // Flag polygon — clockwise from top-left, with a V notch on the
    // right edge (the chevron points inward, toward the pole).
    const flagVertices = [
      { x: rectLeft, y: rectTop },
      { x: rectRight, y: rectTop },
      { x: rectRight - V_DEPTH, y: rectMidY },
      { x: rectRight, y: rectBottom },
      { x: rectLeft, y: rectBottom }
    ]

    const poleStyle: Record<string, unknown> = {
      color: POLE_COLOR,
      size: POLE_WIDTH,
      style: 'solid'
    }

    const flagStyle: Record<string, unknown> = {
      style: 'fill',
      color: flagColor,
      borderSize: 0
    }

    const figures: OverlayFigure[] = [
      {
        type: 'line',
        attrs: { coordinates: [anchor, poleTop] },
        styles: poleStyle
      },
      {
        type: 'polygon',
        attrs: { coordinates: flagVertices },
        styles: flagStyle
      }
    ]

    return figures
  }
}

export type { FlagMarkOverlayData }

export default flagMark
