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
// Line-height multiplier used for row growth math. The canvas
// `text` figure draws lines at exactly `fontSize` apart (no
// leading), so a tight row would visually clip multi-line text.
// We add 40% leading so each extra `\n` forces the row taller
// than the default single-line height, and the canvas text
// stays comfortably within the row.
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
    // tallest cell's text needs, but never shrinks below the user's
    // border-drag height. This matches TV — typing a multi-line
    // entry auto-expands its row; dragging the border down sets a
    // taller floor.
    const lineCounts: number[][] = []
    const effectiveRowHeights: number[] = []
    for (let r = 0; r < data.rows; r++) {
      const counts: number[] = []
      let maxLines = 1
      for (let c = 0; c < data.cols; c++) {
        const txt = data.cells[r]?.[c] ?? ''
        const lc = txt.length === 0 ? 1 : txt.split('\n').length
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

    // 1. Outer rect — fills the whole table area.
    figures.push({
      type: 'rect',
      attrs: { x: anchor.x, y: anchor.y, width: totalWidth, height: totalHeight },
      styles: {
        style: 'stroke_fill',
        color: bg,
        borderColor,
        borderSize: 1
      }
    })

    // 2. Interior column borders — one line between every adjacent
    //    column pair. Each gets a noTranslate-flagged hit-slop rect
    //    on top so the user can grab it.
    for (let c = 1; c < data.cols; c++) {
      const x = colXs[c]
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x, y: anchor.y }, { x, y: anchor.y + totalHeight }] },
        styles: { color: borderColor, size: 1, style: 'solid' },
        ignoreEvent: true
      })
      // Invisible hit-slop rect (4 px to either side of the line)
      // — receives the press, doesn't move any point.
      figures.push({
        key: colBorderKey(c - 1),
        type: 'rect',
        attrs: {
          x: x - BORDER_HIT_SLOP,
          y: anchor.y,
          width: BORDER_HIT_SLOP * 2,
          height: totalHeight
        },
        styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
        noTranslate: true
      })
    }

    // 3. Interior row borders — same pattern as columns.
    for (let r = 1; r < data.rows; r++) {
      const y = rowYs[r]
      figures.push({
        type: 'line',
        attrs: { coordinates: [{ x: anchor.x, y }, { x: anchor.x + totalWidth, y }] },
        styles: { color: borderColor, size: 1, style: 'solid' },
        ignoreEvent: true
      })
      figures.push({
        key: rowBorderKey(r - 1),
        type: 'rect',
        attrs: {
          x: anchor.x,
          y: y - BORDER_HIT_SLOP,
          width: totalWidth,
          height: BORDER_HIT_SLOP * 2
        },
        styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
        noTranslate: true
      })
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
        const textBlockHeight = lineCount * fontSize
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
            placeholder: null
          },
          styles: {
            size: fontSize,
            weight: fontWeight,
            family: fontFamily,
            color: textColor,
            paddingLeft: CELL_PADDING_H,
            paddingRight: CELL_PADDING_H,
            paddingTop: vPad,
            paddingBottom: vPad
          }
        })
      }
    }

    // 5. Corner handles — 4 default-point-style circles at every
    //    corner. Visible ONLY while the overlay is hovered or
    //    selected (matches the engine's default-point-figure
    //    behaviour). Tagged with pointIndex 0 so pressing one
    //    translates the whole table by the anchor delta — same as
    //    pressing the body — instead of independently translating
    //    a corner.
    const chartStore = chart.getChartStore()
    const isActive = chartStore.getHoverOverlayInfo().overlay?.id === overlay.id ||
      chartStore.getClickOverlayInfo().overlay?.id === overlay.id
    if (isActive) {
      const corners = [
        [anchor.x, anchor.y],
        [anchor.x + totalWidth, anchor.y],
        [anchor.x, anchor.y + totalHeight],
        [anchor.x + totalWidth, anchor.y + totalHeight]
      ] as const
      for (const [x, y] of corners) {
        figures.push({
          type: 'circle',
          attrs: { x, y, r: 4 },
          styles: {
            style: 'stroke_fill',
            color: '#FFFFFF',
            borderColor: '#2196f3',
            borderSize: 1.5
          },
          pointIndex: 0
        })
      }
    }

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

  // Border-drag handler. When a press lands on a column / row
  // border, we update the relevant cell-size entry in extendData
  // instead of translating the table. The engine skips its default
  // point-translation because the figure carries `noTranslate`.
  onPressedMoving: ({ overlay, figure, ...event }) => {
    const key = figure?.key
    if (key === undefined || key === '') return
    const target = parseBorderKey(key)
    if (target === null) return
    const data = parseExtendData(overlay.extendData)
    // Engine's MouseTouchEvent ships per-frame `pageX` / `pageY`.
    // We compare against the start of the press via a stash on
    // the overlay. First frame stashes; subsequent frames read +
    // diff. (Stash lives on the overlay's extendData scratch
    // slot — the cleanest spot we have without engine plumbing.)
    const ev = event as { pageX?: number, pageY?: number }
    const stash = (overlay as unknown as { _tableDragStash?: { px: number, py: number, baseW: number[], baseH: number[] } })._tableDragStash
    if (stash === undefined) {
      ;(overlay as unknown as { _tableDragStash?: { px: number, py: number, baseW: number[], baseH: number[] } })._tableDragStash = {
        px: ev.pageX ?? 0,
        py: ev.pageY ?? 0,
        baseW: data.colWidths.slice(),
        baseH: data.rowHeights.slice()
      }
      return
    }
    const dx = (ev.pageX ?? 0) - stash.px
    const dy = (ev.pageY ?? 0) - stash.py
    if (target.kind === 'col') {
      // Grow the column LEFT of the border; shrink isn't expressed
      // here because TV's table only resizes the leading column —
      // moving the divider right widens col-N, leaves col-(N+1)
      // alone. (User can drag the next divider to balance.)
      const nextWidths = stash.baseW.slice()
      nextWidths[target.index] = Math.max(MIN_COL_WIDTH, stash.baseW[target.index] + dx)
      overlay.extendData = { ...data, colWidths: nextWidths }
    } else {
      const nextHeights = stash.baseH.slice()
      nextHeights[target.index] = Math.max(MIN_ROW_HEIGHT, stash.baseH[target.index] + dy)
      overlay.extendData = { ...data, rowHeights: nextHeights }
    }
  },

  // Clear the drag stash when the press ends so the next drag
  // starts fresh.
  onPressedMoveEnd: ({ overlay }) => {
    delete (overlay as unknown as { _tableDragStash?: unknown })._tableDragStash
  }
}

export type { TableOverlayData }

export default table
