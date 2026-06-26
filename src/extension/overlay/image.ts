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
 * Image overlay — drops an image at a click point.
 *
 *   * Single-click drop. The parent shows a "click or drop file to
 *     upload" modal immediately after the click; until the user
 *     picks a file the overlay renders a translucent placeholder
 *     (gray rect + cloud-arrow glyph) so the click point isn't
 *     invisible.
 *   * Source is always a data URI (parent enforces a 1.5 MB cap
 *     before encoding) so the persisted layout is self-contained.
 *   * Resize via 4 corner handles, aspect-locked: cursor delta is
 *     projected onto the image's diagonal so the ratio is
 *     preserved regardless of how the drag tracks. The opposite
 *     corner stays pinned in screen space — same family as the
 *     Table corner handler.
 *   * Opacity comes from extendData (`opacity`, 0–1).
 *
 * Image loading happens at this layer: a module-level
 * `Map<string, HTMLImageElement>` caches one image per src so we
 * don't reload on every redraw, and `onload` triggers a chart
 * update so the figure picks up the loaded bitmap on its next pass.
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import type ChartImp from '../../Chart'
import { UpdateLevel } from '../../common/Updater'

interface ImageOverlayData {
  /** Data URI (`data:image/...;base64,...`). Empty until upload completes. */
  src: string
  /** 0–1. */
  opacity: number
  /** Initial display width / height in pixels. Resize handlers update these. */
  width: number
  height: number
}

const DEFAULT_WIDTH = 200
const DEFAULT_HEIGHT = 200
const MIN_DIM = 24
const PLACEHOLDER_FILL = 'rgba(60, 64, 78, 0.65)'
const PLACEHOLDER_BORDER = '#787b86'
const PLACEHOLDER_GLYPH = '#aab0bd'

const CORNER_TL_KEY = 'corner-tl'
const CORNER_TR_KEY = 'corner-tr'
const CORNER_BL_KEY = 'corner-bl'
const CORNER_BR_KEY = 'corner-br'

interface CornerDirection {
  // 1 → anchor follows on that axis; 0 → pinned.
  ax: 0 | 1
  ay: 0 | 1
  // +1 → dimension grows with the drag (along positive page axis);
  // -1 → it shrinks.
  sx: -1 | 1
  sy: -1 | 1
  cursor: string
}
const CORNER_DIRS: Record<string, CornerDirection> = {
  [CORNER_TL_KEY]: { ax: 1, ay: 1, sx: -1, sy: -1, cursor: 'nwse-resize' },
  [CORNER_TR_KEY]: { ax: 0, ay: 1, sx: 1, sy: -1, cursor: 'nesw-resize' },
  [CORNER_BL_KEY]: { ax: 1, ay: 0, sx: -1, sy: 1, cursor: 'nesw-resize' },
  [CORNER_BR_KEY]: { ax: 0, ay: 0, sx: 1, sy: 1, cursor: 'nwse-resize' }
}

// Module-level image cache. Keyed by src (data URI). Subsequent
// overlays / redraws that point at the same src reuse the same
// HTMLImageElement so we never decode a base64 twice. Bounded
// only by how many distinct images the user adds — fine in
// practice for a hand-curated chart.
const imageCache = new Map<string, HTMLImageElement>()

function getOrLoadImage (src: string, chart: ChartImp): HTMLImageElement | null {
  if (src === '') return null
  const cached = imageCache.get(src)
  if (cached !== undefined) return cached
  // `document.createElement('img')` instead of `new Image()` —
  // identical result, but the eslint config flags the latter
  // global as undefined.
  const img = document.createElement('img')
  imageCache.set(src, img)
  img.onload = () => {
    // `updatePane` at UpdateLevel.Overlay schedules a redraw of
    // the overlay layer so the figure picks up the now-loaded
    // bitmap on the very next frame. Without this the figure
    // would keep drawing nothing until some other event
    // (zoom / pan / hover) triggered a redraw.
    chart.updatePane(UpdateLevel.Overlay)
  }
  img.onerror = () => {
    imageCache.delete(src)
  }
  img.src = src
  return img
}

function parseExtendData (extendData: unknown): ImageOverlayData {
  const fallback: ImageOverlayData = {
    src: '',
    opacity: 1,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT
  }
  if (extendData === null || typeof extendData !== 'object') return fallback
  const ed = extendData as Partial<ImageOverlayData>
  return {
    src: ed.src ?? fallback.src,
    opacity: typeof ed.opacity === 'number' ? Math.max(0, Math.min(1, ed.opacity)) : fallback.opacity,
    width: typeof ed.width === 'number' ? Math.max(MIN_DIM, ed.width) : fallback.width,
    height: typeof ed.height === 'number' ? Math.max(MIN_DIM, ed.height) : fallback.height
  }
}

const image: OverlayTemplate = {
  name: 'image',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: (params) => {
    const { chart, overlay, coordinates } = params as typeof params & { chart: ChartImp }
    if (coordinates.length < 1) return []

    const data = parseExtendData(overlay.extendData)

    const anchor = coordinates[0]
    const { width, height } = data
    const rightX = anchor.x + width
    const bottomY = anchor.y + height

    const figures: OverlayFigure[] = []
    const slops: OverlayFigure[] = []

    const loadedImage = getOrLoadImage(data.src, chart)
    const ready = loadedImage !== null && loadedImage.complete && loadedImage.naturalWidth > 0

    if (ready) {
      figures.push({
        type: 'image',
        attrs: { x: anchor.x, y: anchor.y, width, height, image: loadedImage },
        styles: { opacity: data.opacity },
        cursor: 'move'
      })
    } else {
      // Placeholder rect — keeps the click point visible while the
      // user is in the upload modal (or while the data URI is
      // decoding for the first time). A simple centred label is
      // enough; the modal itself carries the upload affordance.
      figures.push({
        type: 'rect',
        attrs: { x: anchor.x, y: anchor.y, width, height },
        styles: { style: 'stroke_fill', color: PLACEHOLDER_FILL, borderColor: PLACEHOLDER_BORDER, borderSize: 1 },
        cursor: 'move'
      })
      figures.push({
        type: 'text',
        attrs: {
          x: anchor.x + width / 2,
          y: anchor.y + height / 2,
          text: 'Click to upload',
          align: 'center',
          baseline: 'middle'
        },
        styles: { color: PLACEHOLDER_GLYPH, size: 12, weight: 'normal' },
        ignoreEvent: true
      })
    }

    // Corner handles — visible blue rings + larger transparent
    // hit-circles. Same split as Table: visible figure has
    // ignoreEvent: true; the slop owns the press / hover events.
    const chartStore = chart.getChartStore()
    const isActive = chartStore.getHoverOverlayInfo().overlay?.id === overlay.id ||
      chartStore.getClickOverlayInfo().overlay?.id === overlay.id
    if (isActive && data.src !== '') {
      const corners = [
        { x: anchor.x, y: anchor.y, key: CORNER_TL_KEY },
        { x: rightX, y: anchor.y, key: CORNER_TR_KEY },
        { x: anchor.x, y: bottomY, key: CORNER_BL_KEY },
        { x: rightX, y: bottomY, key: CORNER_BR_KEY }
      ]
      for (const corner of corners) {
        figures.push({
          type: 'circle',
          attrs: { x: corner.x, y: corner.y, r: 4 },
          styles: { style: 'stroke', borderColor: '#2196f3', borderSize: 1.5 },
          ignoreEvent: true
        })
        slops.push({
          key: corner.key,
          type: 'circle',
          attrs: { x: corner.x, y: corner.y, r: 8 },
          styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
          cursor: CORNER_DIRS[corner.key].cursor,
          noTranslate: true
        })
      }
    }

    figures.push(...slops)
    return figures
  },

  onPressedMoveStart: (params) => {
    const { chart, overlay, figure, ...event } = params as typeof params & { chart: ChartImp }
    const key = figure?.key
    if (key === undefined || !(key in CORNER_DIRS)) return
    const data = parseExtendData(overlay.extendData)
    const ev = event as { pageX?: number, pageY?: number }
    // Stash the anchor's pixel position + base width/height so
    // every drag tick can compute new dims + new anchor relative
    // to the press-start point — not relative to a moving
    // baseline (which would compound errors).
    const xAxis = chart.getXAxisPane().getAxisComponent()
    const pane = chart.getDrawPaneById(overlay.paneId)
    const yAxis = pane?.getAxisComponent()
    const point = overlay.points[0]
    const baseAnchorPxX = typeof point.dataIndex === 'number' ? xAxis.convertToPixel(point.dataIndex) : 0
    const baseAnchorPxY = yAxis !== undefined && typeof point.value === 'number' ? yAxis.convertToPixel(point.value) : 0
    interface CornerStash {
      px: number, py: number
      baseW: number, baseH: number
      baseAnchorPxX: number, baseAnchorPxY: number
    }
    ;(overlay as unknown as { _imgCornerStash?: CornerStash })._imgCornerStash = {
      px: ev.pageX ?? 0,
      py: ev.pageY ?? 0,
      baseW: data.width,
      baseH: data.height,
      baseAnchorPxX,
      baseAnchorPxY
    }
  },

  onPressedMoving: (params) => {
    const { chart, overlay, figure, ...event } = params as typeof params & { chart: ChartImp }
    const key = figure?.key
    if (key === undefined || !(key in CORNER_DIRS)) return
    const dir = CORNER_DIRS[key]
    const data = parseExtendData(overlay.extendData)
    const ev = event as { pageX?: number, pageY?: number }
    interface CornerStash {
      px: number, py: number
      baseW: number, baseH: number
      baseAnchorPxX: number, baseAnchorPxY: number
    }
    const stash = (overlay as unknown as { _imgCornerStash?: CornerStash })._imgCornerStash
    if (stash === undefined) return
    const dx = (ev.pageX ?? 0) - stash.px
    const dy = (ev.pageY ?? 0) - stash.py
    // Project the cursor delta onto the image's diagonal so the
    // aspect ratio stays exactly preserved. The diagonal vector
    // from the pinned corner to the dragged corner is (sx * W,
    // sy * H); we want the scalar `t` such that the drag vector
    // projects onto that diagonal best.
    const W = stash.baseW
    const H = stash.baseH
    const diagX = dir.sx * W
    const diagY = dir.sy * H
    const diagLen2 = diagX * diagX + diagY * diagY
    const t = diagLen2 > 0 ? (dx * diagX + dy * diagY) / diagLen2 : 0
    // `t` is the fraction of the diagonal the cursor has moved.
    // Apply a floor so the image can't shrink past MIN_DIM.
    const minScale = Math.max(MIN_DIM / W, MIN_DIM / H) - 1
    const tClamped = Math.max(minScale, t)
    const newW = W * (1 + tClamped)
    const newH = H * (1 + tClamped)
    const nextExtendData = { ...data, width: newW, height: newH }
    // Anchor shift — for corners that pull the leading edge
    // (`ax`/`ay` = 1), the opposite corner stays pinned in screen
    // space, so the anchor moves by (oldDim − newDim) on that axis.
    // BR (`ax = 0, ay = 0`) leaves the anchor alone.
    if (dir.ax === 1 || dir.ay === 1) {
      const xAxis = chart.getXAxisPane().getAxisComponent()
      const pane = chart.getDrawPaneById(overlay.paneId)
      const yAxis = pane?.getAxisComponent()
      const newAnchorPxX = stash.baseAnchorPxX + (dir.ax === 1 ? (W - newW) : 0)
      const newAnchorPxY = stash.baseAnchorPxY + (dir.ay === 1 ? (H - newH) : 0)
      const chartStore = chart.getChartStore()
      const newDataIndex = xAxis.convertFromPixel(newAnchorPxX)
      const newTimestamp = chartStore.dataIndexToTimestamp(newDataIndex) ?? undefined
      const newValue = yAxis !== undefined ? yAxis.convertFromPixel(newAnchorPxY) : overlay.points[0].value
      overlay.points[0] = { ...overlay.points[0], dataIndex: newDataIndex, timestamp: newTimestamp, value: newValue }
    }
    overlay.extendData = nextExtendData
  },

  onPressedMoveEnd: ({ overlay }) => {
    delete (overlay as unknown as { _imgCornerStash?: unknown })._imgCornerStash
  }
}

export type { ImageOverlayData }
export default image
