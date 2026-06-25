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
 * Table overlay — TradingView-style multi-cell grid (Pass A).
 *
 * One click drops a 3 × 3 table with the click point at the top-left
 * corner. Each cell is inline-editable via the existing editableText
 * pipeline; the keyed `onTextChange` callback routes the new value
 * into `extendData.cells[row][col]`.
 *
 * Interior cell borders are draggable resize handles:
 *   * vertical borders adjust column widths (between cols j and j+1)
 *   * horizontal borders adjust row heights (between rows i and i+1)
 *
 * Borders carry `noTranslate: true` (new engine flag) so pressing
 * them doesn't trigger the engine's default "translate every point"
 * drag — instead `onPressedMoving` updates `extendData.colWidths[j]`
 * / `rowHeights[i]` directly. Sizes have minimums so a column /
 * row can't be dragged into oblivion.
 *
 * Pass B adds the floating-panel + right-click "Add column right" /
 * "Add row bottom" controls; Pass C adds the 4 corner-handle
 * default-point-figure look + visual border-hover glow.
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import type ChartImp from '../../Chart'
import { wrapText } from '../figure/text'

interface TableOverlayData {
  rows: number
  cols: number
  /** Row-major cell contents — `cells[row][col]`. */
  cells: string[][]
  /** Per-column pixel width. Length === cols. */
  colWidths: number[]
  /** Per-row pixel height. Length === rows. */
  rowHeights: number[]
  /** Cell-level horizontal alignment. */
  textAlign?: 'left' | 'center' | 'right'
}

interface OverlayStyleSlice {
  polygon?: { color?: string, borderColor?: string }
  rect?: { color?: string, borderColor?: string }
  text?: { color?: string, size?: number, family?: string, weight?: number | string }
}

const DEFAULT_COLS = 3
const DEFAULT_ROWS = 3
const DEFAULT_COL_WIDTH = 144
const DEFAULT_ROW_HEIGHT = 31
const MIN_COL_WIDTH = 24
const MIN_ROW_HEIGHT = 16
const DEFAULT_BG = 'rgba(30, 33, 41, 0.95)'
const DEFAULT_BORDER = '#787b86'
const DEFAULT_TEXT_COLOR = '#ffffff'
const DEFAULT_FONT_SIZE = 12
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'
const BORDER_HIT_SLOP = 4
// Cell padding inside the editable-text figure.
const CELL_PADDING_H = 4
const CELL_PADDING_V = 3
// Line-height multiplier — vertical step between lines becomes
// `fontSize * LINE_HEIGHT_FACTOR`. The same value is fed to
// canvas (`styles.lineHeight`) AND the textarea (CSS line-height),
// so multi-line edits sit on identical baselines mid-edit and
// post-commit. 40% leading gives a visible gap between rows
// without losing the "tight grid" feel.
const LINE_HEIGHT_FACTOR = 1.4

function parseExtendData (extendData: unknown): TableOverlayData {
  const fallback: TableOverlayData = {
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    cells: Array.from({ length: DEFAULT_ROWS }, () => Array.from({ length: DEFAULT_COLS }, () => '')),
    colWidths: Array.from({ length: DEFAULT_COLS }, () => DEFAULT_COL_WIDTH),
    rowHeights: Array.from({ length: DEFAULT_ROWS }, () => DEFAULT_ROW_HEIGHT),
    textAlign: 'center'
  }
  if (extendData === null || typeof extendData !== 'object') return fallback
  const ed = extendData as Partial<TableOverlayData>
  const rows = ed.rows ?? fallback.rows
  const cols = ed.cols ?? fallback.cols
  const cells = ed.cells ?? fallback.cells
  const colWidths = ed.colWidths ?? fallback.colWidths
  const rowHeights = ed.rowHeights ?? fallback.rowHeights
  return {
    rows,
    cols,
    cells,
    colWidths,
    rowHeights,
    textAlign: ed.textAlign ?? fallback.textAlign
  }
}

/**
 * Key encoding for cell + border figures so `onTextChange` /
 * `onPressedMoving` can identify which target an event refers to.
 */
const cellKey = (row: number, col: number): string => `cell-${row}-${col}`
const colBorderKey = (col: number): string => `col-border-${col}` // border between col j and j+1
const rowBorderKey = (row: number): string => `row-border-${row}` // border between row i and i+1
// Outer edges — only right + bottom carry hit-areas (their drag
// grows the trailing column / row, matching how the floating
// panel's Add column / row buttons extend the table).
const RIGHT_EDGE_KEY = 'right-edge'
const BOTTOM_EDGE_KEY = 'bottom-edge'
// Corner keys — all four resize / reproportion the table; the
// sign vectors below describe which direction each corner pulls.
const CORNER_TL_KEY = 'corner-tl'
const CORNER_TR_KEY = 'corner-tr'
const CORNER_BL_KEY = 'corner-bl'
const CORNER_BR_KEY = 'corner-br'

interface CornerSign {
  // 1 → anchor follows the cursor on that axis; 0 → anchor pinned.
  ax: 0 | 1
  ay: 0 | 1
  // +1 → the dimension grows with the cursor; -1 → it shrinks.
  sx: -1 | 1
  sy: -1 | 1
}
const CORNER_SIGNS: Record<string, CornerSign> = {
  [CORNER_TL_KEY]: { ax: 1, ay: 1, sx: -1, sy: -1 },
  [CORNER_TR_KEY]: { ax: 0, ay: 1, sx: 1, sy: -1 },
  [CORNER_BL_KEY]: { ax: 1, ay: 0, sx: -1, sy: 1 },
  [CORNER_BR_KEY]: { ax: 0, ay: 0, sx: 1, sy: 1 }
}
// Inner-border intersections — drag both borders together. Key
// encodes the (row-border-index, col-border-index) the cell touches.
const intersectionKey = (rowBorder: number, colBorder: number): string => `corner-${rowBorder}-${colBorder}`
function parseIntersectionKey (key: string): { rowBorder: number, colBorder: number } | null {
  const m = /^corner-(\d+)-(\d+)$/.exec(key)
  if (m === null) return null
  return { rowBorder: parseInt(m[1], 10), colBorder: parseInt(m[2], 10) }
}

function parseCellKey (key: string): { row: number, col: number } | null {
  const m = /^cell-(\d+)-(\d+)$/.exec(key)
  if (m === null) return null
  return { row: parseInt(m[1], 10), col: parseInt(m[2], 10) }
}
function parseBorderKey (key: string): { kind: 'col' | 'row', index: number } | null {
  const colM = /^col-border-(\d+)$/.exec(key)
  if (colM !== null) return { kind: 'col', index: parseInt(colM[1], 10) }
  const rowM = /^row-border-(\d+)$/.exec(key)
  if (rowM !== null) return { kind: 'row', index: parseInt(rowM[1], 10) }
  return null
}

const table: OverlayTemplate = {
  name: 'table',
  // Single-click overlay; engine convention is clicks + 1.
  totalStep: 2,
  // Pass C will swap to a per-corner default-figure look. For now
  // we suppress the engine's default point handle entirely (it'd
  // sit at the top-left corner, which the rect outline already
  // marks).
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: (params) => {
    // Narrow `chart` to the impl class — getChartStore lives on
    // ChartImp, not the public Chart interface (same pattern Pin
    // and Signpost use).
    const { chart, overlay, coordinates } = params as typeof params & { chart: ChartImp }
    if (coordinates.length < 1) return []

    const data = parseExtendData(overlay.extendData)
    const styles = (overlay.styles ?? {}) as OverlayStyleSlice

    const bg = styles.rect?.color ?? styles.polygon?.color ?? DEFAULT_BG
    const borderColor = styles.rect?.borderColor ?? styles.polygon?.borderColor ?? DEFAULT_BORDER
    const textColor = styles.text?.color ?? DEFAULT_TEXT_COLOR
    const fontSize = styles.text?.size ?? DEFAULT_FONT_SIZE
    const fontWeight = styles.text?.weight ?? 'normal'
    const fontFamily = styles.text?.family ?? DEFAULT_FONT_FAMILY
    const textAlign = data.textAlign ?? 'center'

    // Anchor at the click point — the table's top-left corner.
    const anchor = coordinates[0]

    // Resolve per-column starting X from the (possibly user-resized)
    // widths. A trailing entry stores the table's right edge.
    const colXs: number[] = [anchor.x]
    for (let c = 0; c < data.cols; c++) {
      colXs.push(colXs[c] + (data.colWidths[c] ?? DEFAULT_COL_WIDTH))
    }

    // Row heights are content-aware: each row grows as tall as its
    // tallest cell's text needs (counting BOTH `\n` newlines and
    // soft-wrap at the cell width), but never shrinks below the
    // user's border-drag height. Matches TV — typing past the cell
    // width or hitting Enter auto-expands the row; dragging the
    // border down sets a taller floor.
    const lineCounts: number[][] = []
    const effectiveRowHeights: number[] = []
    for (let r = 0; r < data.rows; r++) {
      const counts: number[] = []
      let maxLines = 1
      for (let c = 0; c < data.cols; c++) {
        const txt = data.cells[r]?.[c] ?? ''
        const colW = data.colWidths[c] ?? DEFAULT_COL_WIDTH
        // Same wrap call the renderer will make — keeps row-height
        // math byte-for-byte aligned with what `text` draws.
        const wrapWidth = Math.max(0, colW - CELL_PADDING_H * 2)
        const wrapped = wrapText(txt, wrapWidth, fontSize, fontWeight as number | string | undefined, fontFamily)
        const lc = Math.max(1, wrapped.length)
        counts.push(lc)
        if (lc > maxLines) maxLines = lc
      }
      lineCounts.push(counts)
      // Use the leading-aware factor so a single `\n` (2 lines) is
      // already taller than the default 1-line row height — that
      // makes the row visibly grow on the first newline rather
      // than only kicking in at 3+ lines.
      const contentHeight = Math.ceil(maxLines * fontSize * LINE_HEIGHT_FACTOR) + CELL_PADDING_V * 2
      const userHeight = data.rowHeights[r] ?? DEFAULT_ROW_HEIGHT
      effectiveRowHeights.push(Math.max(userHeight, contentHeight))
    }

    const rowYs: number[] = [anchor.y]
    for (let r = 0; r < data.rows; r++) {
      rowYs.push(rowYs[r] + effectiveRowHeights[r])
    }
    const totalWidth = colXs[data.cols] - anchor.x
    const totalHeight = rowYs[data.rows] - anchor.y

    const figures: OverlayFigure[] = []
    // Hit-slops are kept in a SEPARATE array and appended at the
    // very end so they're dispatched FIRST in reverse-order event
    // dispatch — otherwise cells (last among the visible figures)
    // would consume border / corner events before they reach the
    // slop.
    const slops: OverlayFigure[] = []

    // 1. Outer rect — fill only. The four outer borders draw as
    //    separate line figures so the right + bottom edges can
    //    carry their own hit-slop / hover-glow / drag handler
    //    (mirrors the interior border treatment).
    figures.push({
      type: 'rect',
      attrs: { x: anchor.x, y: anchor.y, width: totalWidth, height: totalHeight },
      styles: { style: 'fill', color: bg, borderSize: 0 },
      ignoreEvent: true
    })

    // Hovered figure key — used to draw the border resize glow
    // beneath the matching border before the line itself draws.
    // For an intersection hit-target both adjacent borders should
    // glow, so we expand the single key into a set of glow keys.
    const hoveredFigureKey = chart.getChartStore().getHoverOverlayInfo().figure?.key
    const hoveredGlowKeys = new Set<string>()
    if (hoveredFigureKey !== undefined) {
      const inter = parseIntersectionKey(hoveredFigureKey)
      if (inter !== null) {
        hoveredGlowKeys.add(rowBorderKey(inter.rowBorder))
        hoveredGlowKeys.add(colBorderKey(inter.colBorder))
      } else {
        hoveredGlowKeys.add(hoveredFigureKey)
      }
    }
    const BORDER_GLOW_HALF = 3

    // 1b. Four outer borders — top + left are decorative only
    //     (no drag); right + bottom get hit-slop rects so dragging
    //     grows the trailing column / row, the same way the
    //     floating-panel "Add column right" / "Add row bottom"
    //     extend the table.
    const drawOuterLine = (x1: number, y1: number, x2: number, y2: number): void => {
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: x1, y: y1 }, { x: x2, y: y2 }] },
        styles: { color: borderColor, size: 1, style: 'solid' },
        ignoreEvent: true
      })
    }
    const rightX = anchor.x + totalWidth
    const bottomY = anchor.y + totalHeight
    // Top + left — purely decorative.
    drawOuterLine(anchor.x, anchor.y, rightX, anchor.y)
    drawOuterLine(anchor.x, anchor.y, anchor.x, bottomY)
    // Right edge — hover glow + line + hit-slop.
    if (hoveredGlowKeys.has(RIGHT_EDGE_KEY)) {
      figures.push({
        type: 'rect',
        attrs: { x: rightX - BORDER_GLOW_HALF, y: anchor.y, width: BORDER_GLOW_HALF * 2, height: totalHeight },
        styles: { style: 'fill', color: 'rgba(33, 150, 243, 0.25)', borderSize: 0 },
        ignoreEvent: true
      })
    }
    drawOuterLine(rightX, anchor.y, rightX, bottomY)
    slops.push({
      key: RIGHT_EDGE_KEY,
      type: 'rect',
      attrs: { x: rightX - BORDER_HIT_SLOP, y: anchor.y, width: BORDER_HIT_SLOP * 2, height: totalHeight },
      styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
      noTranslate: true,
      cursor: 'col-resize'
    })
    // Bottom edge — same pattern.
    if (hoveredGlowKeys.has(BOTTOM_EDGE_KEY)) {
      figures.push({
        type: 'rect',
        attrs: { x: anchor.x, y: bottomY - BORDER_GLOW_HALF, width: totalWidth, height: BORDER_GLOW_HALF * 2 },
        styles: { style: 'fill', color: 'rgba(33, 150, 243, 0.25)', borderSize: 0 },
        ignoreEvent: true
      })
    }
    drawOuterLine(anchor.x, bottomY, rightX, bottomY)
    slops.push({
      key: BOTTOM_EDGE_KEY,
      type: 'rect',
      attrs: { x: anchor.x, y: bottomY - BORDER_HIT_SLOP, width: totalWidth, height: BORDER_HIT_SLOP * 2 },
      styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
      noTranslate: true,
      cursor: 'row-resize'
    })

    // 2. Interior column borders — one line between every adjacent
    //    column pair. Each gets a noTranslate-flagged hit-slop rect
    //    on top so the user can grab it. When the same border is
    //    hovered, a translucent blue rect renders behind it as a
    //    "grabbable" affordance (matches TV).
    for (let c = 1; c < data.cols; c++) {
      const x = colXs[c]
      const key = colBorderKey(c - 1)
      if (hoveredGlowKeys.has(key)) {
        figures.push({
          type: 'rect',
          attrs: {
            x: x - BORDER_GLOW_HALF,
            y: anchor.y,
            width: BORDER_GLOW_HALF * 2,
            height: totalHeight
          },
          styles: { style: 'fill', color: 'rgba(33, 150, 243, 0.25)', borderSize: 0 },
          ignoreEvent: true
        })
      }
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x, y: anchor.y }, { x, y: anchor.y + totalHeight }] },
        styles: { color: borderColor, size: 1, style: 'solid' },
        ignoreEvent: true
      })
      // Invisible hit-slop rect (4 px to either side of the line)
      // — receives the press, doesn't move any point. Lives in
      // the `slops` array so it's pushed AFTER cells.
      slops.push({
        key,
        type: 'rect',
        attrs: {
          x: x - BORDER_HIT_SLOP,
          y: anchor.y,
          width: BORDER_HIT_SLOP * 2,
          height: totalHeight
        },
        styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
        noTranslate: true,
        cursor: 'col-resize'
      })
    }

    // 3. Interior row borders — same pattern as columns.
    for (let r = 1; r < data.rows; r++) {
      const y = rowYs[r]
      const key = rowBorderKey(r - 1)
      if (hoveredGlowKeys.has(key)) {
        figures.push({
          type: 'rect',
          attrs: {
            x: anchor.x,
            y: y - BORDER_GLOW_HALF,
            width: totalWidth,
            height: BORDER_GLOW_HALF * 2
          },
          styles: { style: 'fill', color: 'rgba(33, 150, 243, 0.25)', borderSize: 0 },
          ignoreEvent: true
        })
      }
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: anchor.x, y }, { x: anchor.x + totalWidth, y }] },
        styles: { color: borderColor, size: 1, style: 'solid' },
        ignoreEvent: true
      })
      slops.push({
        key,
        type: 'rect',
        attrs: {
          x: anchor.x,
          y: y - BORDER_HIT_SLOP,
          width: totalWidth,
          height: BORDER_HIT_SLOP * 2
        },
        styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
        noTranslate: true,
        cursor: 'row-resize'
      })
    }

    // 3b. Interior border intersections — a small square slop at
    //     every spot where a column border crosses a row border.
    //     Drag updates BOTH colWidths[colBorder] and
    //     rowHeights[rowBorder] simultaneously. Hover highlights
    //     both crossing borders (via the `hoveredGlowKeys` set
    //     populated above). Cursor stays as the default 'pointer'
    //     — direction is read from the drag motion itself, not
    //     from the cursor glyph.
    for (let r = 1; r < data.rows; r++) {
      for (let c = 1; c < data.cols; c++) {
        slops.push({
          key: intersectionKey(r - 1, c - 1),
          type: 'rect',
          attrs: {
            x: colXs[c] - BORDER_HIT_SLOP,
            y: rowYs[r] - BORDER_HIT_SLOP,
            width: BORDER_HIT_SLOP * 2,
            height: BORDER_HIT_SLOP * 2
          },
          styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
          noTranslate: true
        })
      }
    }

    // 4. Cell editable text figures. Each cell pins its width /
    //    height to the cell rect so the textarea matches on edit.
    //    Padding is computed per-cell to vertically centre the
    //    text block within the (content-grown) row.
    for (let r = 0; r < data.rows; r++) {
      for (let c = 0; c < data.cols; c++) {
        const cellX = colXs[c]
        const cellY = rowYs[r]
        const cellW = colXs[c + 1] - cellX
        const cellH = rowYs[r + 1] - cellY
        const cellText = data.cells[r]?.[c] ?? ''
        const lineCount = lineCounts[r][c]
        // `textBlockHeight` mirrors the engine's `size * lineHeight`
        // line step so the wrapped block's measured height matches
        // exactly what the canvas (and textarea) draw.
        const textBlockHeight = lineCount * fontSize * LINE_HEIGHT_FACTOR
        // Symmetric vertical padding so the text block sits at the
        // row's vertical centre. Floor at CELL_PADDING_V so a row
        // dragged shorter than its content still has minimum
        // breathing room before the text overflows.
        const vPad = Math.max(CELL_PADDING_V, (cellH - textBlockHeight) / 2)
        // `text` figure positions its rect relative to `attrs.x`
        // based on `align`: left → rect.x = x, center → x - w/2,
        // right → x - w. We want the rect to always span the full
        // cell, so we move x to the cell-edge that matches the
        // alignment instead of leaving x at the centre.
        const cellAnchorX = textAlign === 'left'
          ? cellX
          : textAlign === 'right'
            ? cellX + cellW
            : cellX + cellW / 2
        figures.push({
          key: cellKey(r, c),
          type: 'editableText',
          attrs: {
            x: cellAnchorX,
            // With baseline='top' + an explicit `height`, the text
            // sits at `y + paddingTop`. We want the rect to span the
            // full cell (so the hit area + textarea position match
            // the cell rect), so `y` is the top of the cell and
            // vertical centring is delegated to the dynamic vPad.
            y: cellY,
            width: cellW,
            height: cellH,
            text: cellText,
            align: textAlign,
            baseline: 'top',
            // Cells already have a real-size hit area via
            // width/height; the engine's default '+ Add text'
            // placeholder would tile every empty cell with noise.
            placeholder: null,
            // Soft-wrap long un-broken text at the cell width so
            // it spills onto multiple lines instead of overflowing
            // horizontally. Same call used above to compute row
            // height, so canvas + row math stay aligned.
            wrap: true
          },
          styles: {
            size: fontSize,
            weight: fontWeight,
            family: fontFamily,
            color: textColor,
            paddingLeft: CELL_PADDING_H,
            paddingRight: CELL_PADDING_H,
            paddingTop: vPad,
            paddingBottom: vPad,
            // Canvas + textarea both step at `size * lineHeight`.
            lineHeight: LINE_HEIGHT_FACTOR
          }
        })
      }
    }

    // 5. Corner handles — visible only while the overlay is
    //    hovered or selected. The bottom-right corner is special:
    //    dragging it scales every column / row proportionally so
    //    the table grows or shrinks as a whole (anchor stays put).
    //    The other three corners keep the existing
    //    pointIndex-0 behaviour (drag = translate the table) —
    //    making them true resize handles would require remapping
    //    the anchor through chart coordinates, which we defer.
    const chartStore = chart.getChartStore()
    const isActive = chartStore.getHoverOverlayInfo().overlay?.id === overlay.id ||
      chartStore.getClickOverlayInfo().overlay?.id === overlay.id
    if (isActive) {
      const corners: Array<{ x: number, y: number, cursor: string, key: string }> = [
        { x: anchor.x, y: anchor.y, cursor: 'nwse-resize', key: CORNER_TL_KEY },
        { x: anchor.x + totalWidth, y: anchor.y, cursor: 'nesw-resize', key: CORNER_TR_KEY },
        { x: anchor.x, y: anchor.y + totalHeight, cursor: 'nesw-resize', key: CORNER_BL_KEY },
        { x: anchor.x + totalWidth, y: anchor.y + totalHeight, cursor: 'nwse-resize', key: CORNER_BR_KEY }
      ]
      for (const corner of corners) {
        // Visible ring — events are forwarded by the slop below;
        // this figure exists only for the blue circle rendering.
        figures.push({
          type: 'circle',
          attrs: { x: corner.x, y: corner.y, r: 4 },
          styles: {
            style: 'stroke',
            borderColor: '#2196f3',
            borderSize: 1.5
          },
          ignoreEvent: true
        })
        // Larger transparent hit-target on top — captures press +
        // hover for the diagonal-resize cursor. All four corners
        // opt out of the engine's default translation: drag
        // semantics are owned by `onPressedMoving`, which scales
        // every column / row proportionally and (for non-BR
        // corners) also shifts the anchor in chart coordinates so
        // the opposite corner stays pinned.
        slops.push({
          key: corner.key,
          type: 'circle',
          attrs: { x: corner.x, y: corner.y, r: 8 },
          styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
          cursor: corner.cursor,
          noTranslate: true
        })
      }
    }

    // Append all hit-slops LAST so they're at the highest index
    // in the View's child list, which means reverse-order event
    // dispatch checks them BEFORE cells / corners and any other
    // visible figure. Without this, cells (the last visible
    // figures in the array) would consume mouse events anywhere
    // inside the table — including over border slops.
    figures.push(...slops)

    return figures
  },

  // Cell-keyed text routing. `onTextChange` always fires with the
  // figureKey we stamped, so we map back to (row, col) and splice
  // the new value into the cells matrix.
  onTextChange: ({ overlay, figureKey, text: newText }) => {
    const data = parseExtendData(overlay.extendData)
    const target = figureKey !== undefined ? parseCellKey(figureKey) : null
    if (target === null) return
    const nextCells = data.cells.map(row => row.slice())
    nextCells[target.row] ??= []
    nextCells[target.row][target.col] = newText
    overlay.extendData = { ...data, cells: nextCells }
  },

  // Press-start hook — stashes the press coordinates AT MOUSEDOWN
  // so the very first mousemove (`onPressedMoving`) has a stable
  // baseline. Previously the stash captured the first
  // mousemove's pageX/pageY, which is already offset from the
  // actual press position (the cursor moves a few px between
  // mousedown and the first mousemove). That offset shows up as a
  // visible "jump" on the first drag tick.
  onPressedMoveStart: (params) => {
    const { chart, overlay, figure, ...event } = params as typeof params & { chart: ChartImp }
    const key = figure?.key
    if (key === undefined || key === '') return
    const data = parseExtendData(overlay.extendData)
    const ev = event as { pageX?: number, pageY?: number }
    const baseW = data.colWidths.slice()
    const baseH = data.rowHeights.slice()
    if (key in CORNER_SIGNS) {
      // Snapshot the anchor's pixel position so the resize handler
      // can compute a new chart-coord anchor at every frame —
      // needed for TL / TR / BL where the anchor moves to keep
      // the opposite corner pinned. BR doesn't shift the anchor
      // but uses the same stash shape so the resize branch can
      // treat all four corners uniformly.
      const xAxis = chart.getXAxisPane().getAxisComponent()
      const pane = chart.getDrawPaneById(overlay.paneId)
      const yAxis = pane?.getAxisComponent()
      const point = overlay.points[0]
      const baseAnchorPxX = typeof point.dataIndex === 'number' ? xAxis.convertToPixel(point.dataIndex) : 0
      const baseAnchorPxY = yAxis !== undefined && typeof point.value === 'number' ? yAxis.convertToPixel(point.value) : 0
      interface CornerStash {
        px: number, py: number
        baseW: number[], baseH: number[]
        baseTotalW: number, baseTotalH: number
        baseAnchorPxX: number, baseAnchorPxY: number
      }
      ;(overlay as unknown as { _tableCornerStash?: CornerStash })._tableCornerStash = {
        px: ev.pageX ?? 0,
        py: ev.pageY ?? 0,
        baseW,
        baseH,
        baseTotalW: baseW.reduce((a, b) => a + b, 0),
        baseTotalH: baseH.reduce((a, b) => a + b, 0),
        baseAnchorPxX,
        baseAnchorPxY
      }
      return
    }
    if (
      parseBorderKey(key) !== null ||
      parseIntersectionKey(key) !== null ||
      key === RIGHT_EDGE_KEY ||
      key === BOTTOM_EDGE_KEY
    ) {
      ;(overlay as unknown as { _tableDragStash?: { px: number, py: number, baseW: number[], baseH: number[] } })._tableDragStash = {
        px: ev.pageX ?? 0,
        py: ev.pageY ?? 0,
        baseW,
        baseH
      }
    }
  },

  // Border-drag handler. When a press lands on a column / row
  // border (or outer right / bottom edge, or BR corner), we update
  // extendData instead of translating the table. The stash is
  // populated by `onPressedMoveStart` above; this callback only
  // reads from it.
  onPressedMoving: (params) => {
    const { chart, overlay, figure, ...event } = params as typeof params & { chart: ChartImp }
    const key = figure?.key
    if (key === undefined || key === '') return
    const data = parseExtendData(overlay.extendData)
    const ev = event as { pageX?: number, pageY?: number }

    // Corner resize — applies to all 4 corners. Each corner's
    // sign vector tells us (a) which axes the anchor moves on and
    // (b) whether the dimension grows or shrinks with the drag.
    // The opposite corner stays pinned in screen space.
    const sign = key in CORNER_SIGNS ? CORNER_SIGNS[key] : null
    if (sign !== null) {
      interface CornerStash {
        px: number, py: number
        baseW: number[], baseH: number[]
        baseTotalW: number, baseTotalH: number
        baseAnchorPxX: number, baseAnchorPxY: number
      }
      const cornerStash = (overlay as unknown as { _tableCornerStash?: CornerStash })._tableCornerStash
      if (cornerStash === undefined) return
      const dx = (ev.pageX ?? 0) - cornerStash.px
      const dy = (ev.pageY ?? 0) - cornerStash.py
      // Effective signed delta on each dimension: dx flipped for
      // left-grabbing corners, dy flipped for top-grabbing.
      const dxSigned = sign.sx * dx
      const dySigned = sign.sy * dy
      // Min scale prevents any column / row from shrinking past
      // its lower bound; max safe scale derived from the smallest
      // baseline width / height.
      const minScaleX = MIN_COL_WIDTH / Math.max(...cornerStash.baseW)
      const minScaleY = MIN_ROW_HEIGHT / Math.max(...cornerStash.baseH)
      const sx = Math.max(minScaleX, (cornerStash.baseTotalW + dxSigned) / cornerStash.baseTotalW)
      const sy = Math.max(minScaleY, (cornerStash.baseTotalH + dySigned) / cornerStash.baseTotalH)
      const nextWidths = cornerStash.baseW.map(w => Math.max(MIN_COL_WIDTH, w * sx))
      const nextHeights = cornerStash.baseH.map(h => Math.max(MIN_ROW_HEIGHT, h * sy))
      const nextExtendData = { ...data, colWidths: nextWidths, rowHeights: nextHeights }
      // Anchor follows the cursor on axes where the corner is
      // grabbing the leading edge. We convert the new anchor's
      // pixel position back into chart coordinates so the engine's
      // hit-tests and the persistence layer both see a real
      // (timestamp, value) point.
      if (sign.ax === 1 || sign.ay === 1) {
        const xAxis = chart.getXAxisPane().getAxisComponent()
        const pane = chart.getDrawPaneById(overlay.paneId)
        const yAxis = pane?.getAxisComponent()
        const newAnchorPxX = cornerStash.baseAnchorPxX + sign.ax * dx
        const newAnchorPxY = cornerStash.baseAnchorPxY + sign.ay * dy
        const chartStore = chart.getChartStore()
        const newDataIndex = xAxis.convertFromPixel(newAnchorPxX)
        const newTimestamp = chartStore.dataIndexToTimestamp(newDataIndex) ?? undefined
        const newValue = yAxis !== undefined ? yAxis.convertFromPixel(newAnchorPxY) : overlay.points[0]?.value
        overlay.points[0] = { ...overlay.points[0], dataIndex: newDataIndex, timestamp: newTimestamp, value: newValue }
      }
      overlay.extendData = nextExtendData
      return
    }

    // Inner border intersection — drag updates BOTH the row
    // border and the column border at once. Same per-axis math
    // as a single-border drag, applied in parallel.
    const inter = parseIntersectionKey(key)
    if (inter !== null) {
      const stash = (overlay as unknown as { _tableDragStash?: { px: number, py: number, baseW: number[], baseH: number[] } })._tableDragStash
      if (stash === undefined) return
      const dx = (ev.pageX ?? 0) - stash.px
      const dy = (ev.pageY ?? 0) - stash.py
      const nextWidths = stash.baseW.slice()
      const nextHeights = stash.baseH.slice()
      nextWidths[inter.colBorder] = Math.max(MIN_COL_WIDTH, stash.baseW[inter.colBorder] + dx)
      nextHeights[inter.rowBorder] = Math.max(MIN_ROW_HEIGHT, stash.baseH[inter.rowBorder] + dy)
      overlay.extendData = { ...data, colWidths: nextWidths, rowHeights: nextHeights }
      return
    }

    // Interior border? Parse the (kind, index). Otherwise check if
    // it's the right / bottom outer edge, which resizes the
    // trailing column / row.
    let target = parseBorderKey(key)
    if (target === null) {
      if (key === RIGHT_EDGE_KEY) target = { kind: 'col', index: -1 }
      else if (key === BOTTOM_EDGE_KEY) target = { kind: 'row', index: -1 }
      else return
    }
    // Resolve sentinel -1 → trailing column / row.
    const idx = target.index === -1
      ? (target.kind === 'col' ? data.cols - 1 : data.rows - 1)
      : target.index
    const resolved = { kind: target.kind, index: idx }
    const stash = (overlay as unknown as { _tableDragStash?: { px: number, py: number, baseW: number[], baseH: number[] } })._tableDragStash
    if (stash === undefined) return
    const dx = (ev.pageX ?? 0) - stash.px
    const dy = (ev.pageY ?? 0) - stash.py
    if (resolved.kind === 'col') {
      // Grow the column LEFT of the border; shrink isn't expressed
      // here because TV's table only resizes the leading column —
      // moving the divider right widens col-N, leaves col-(N+1)
      // alone. (User can drag the next divider to balance.) For
      // the outer right edge the resolved index is the trailing
      // column, so this same code path grows the table's right
      // side.
      const nextWidths = stash.baseW.slice()
      nextWidths[resolved.index] = Math.max(MIN_COL_WIDTH, stash.baseW[resolved.index] + dx)
      overlay.extendData = { ...data, colWidths: nextWidths }
    } else {
      const nextHeights = stash.baseH.slice()
      nextHeights[resolved.index] = Math.max(MIN_ROW_HEIGHT, stash.baseH[resolved.index] + dy)
      overlay.extendData = { ...data, rowHeights: nextHeights }
    }
  },

  // Clear the drag stash when the press ends so the next drag
  // starts fresh.
  onPressedMoveEnd: ({ overlay }) => {
    delete (overlay as unknown as { _tableDragStash?: unknown })._tableDragStash
    delete (overlay as unknown as { _tableCornerStash?: unknown })._tableCornerStash
  }
}

export type { TableOverlayData }

export default table
