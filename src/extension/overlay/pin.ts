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
 * Pin overlay — TradingView-style map-pin bar marker.
 *
 * Pass 1: one-click pin with a tear-drop body + circle hole. The
 * shape is the drawing-bar's own pin glyph, drawn with
 * `fill-rule: evenodd` so both outlines render as visible rings
 * while the centres stay genuinely transparent.
 *
 * Pass 2 (this iteration): on hover OR while selected, a wide
 * tooltip floats above the pin with a downward V-pointer whose tip
 * lands on the pin's head centre. The tooltip text is inline-
 * editable via the same auto-mount-after-draw + textarea pipeline
 * as Note / Callout.
 *
 * Pass 3 will add the schema fields for the tooltip's Text-tab
 * controls (bold / italic / colour / bg / border), the
 * anchor-drawing floating toggle, and engine italic support.
 */

import type { OverlayTemplate, OverlayFigure } from '../../component/Overlay'
import type ChartImp from '../../Chart'
import { calcTextWidth } from '../../common/utils/canvas'
import { isNumber } from '../../common/utils/typeChecks'

interface PinOverlayData {
  /** User-set fill colour for the pin (drives both outlines). */
  backgroundColor?: string
  /** Inline-editable annotation rendered in the hover/select tooltip. */
  text?: string
  /**
   * Floating-panel toggle — when true, render an always-on x-axis
   * label under the pin showing the snapped bar's date (same look
   * Signpost uses). Defaults to off.
   */
  anchorDrawing?: boolean
  /** The settings dialog's flag for the tooltip border (off unless a colour was set). */
  borderVisible?: boolean
}

interface OverlayStyleSlice {
  polygon?: { color?: string }
  // Tooltip rect's border is sourced from `rect.borderColor` (set
  // by the host's `borderColor` schema field via the standard
  // bridge — same property other overlays use for their shapes'
  // borders; Pin's PATH figure ignores polygon/rect styling, so
  // there's no clash with the pin colour).
  rect?: { borderColor?: string, borderSize?: number }
  text?: {
    color?: string
    size?: number
    family?: string
    weight?: number | string
    fontStyle?: string
    backgroundColor?: string
  }
}

const DEFAULT_PIN_COLOR = '#2196f3'
// Tooltip defaults — dark bubble + light text. Pass 3 will route
// these through the Text tab so the user can override per-pin.
const DEFAULT_TOOLTIP_BORDER = '#787b86'
const DEFAULT_TOOLTIP_BG = 'rgba(30, 33, 41, 0.95)'
const DEFAULT_TOOLTIP_TEXT_COLOR = '#ffffff'
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = 'Helvetica Neue'

// Pin path — Superchart's own pin glyph (`drawing/text-and-notes/pin` in
// the design-system `chartIcons`), scaled from its 32 grid to this 28×28
// box: tip at (14, 24.75), head circle centred at (14, 11). Four contours
// combine under fillRule='evenodd' so the body and the ring around the head
// render as outlines with a transparent centre.
const PIN_PATH = 'M20.25 11C20.25 9.34 19.59 7.75 18.42 6.58C17.25 5.41 15.66 4.75 14 4.75C12.34 4.75 10.75 5.41 9.58 6.58C8.41 7.75 7.75 9.34 7.75 11C7.75 12.56 8.31 14.18 9.46 16.19C10.52 18.02 12.04 20.12 14 22.74C15.96 20.12 17.48 18.02 18.54 16.19C19.69 14.18 20.25 12.56 20.25 11ZM21.75 11C21.75 12.94 21.06 14.82 19.84 16.94C18.62 19.05 16.84 21.46 14.6 24.45C14.46 24.64 14.24 24.75 14 24.75C13.76 24.75 13.54 24.64 13.4 24.45C11.16 21.46 9.38 19.05 8.16 16.94C6.94 14.82 6.25 12.94 6.25 11C6.25 8.94 7.07 6.97 8.52 5.52C9.97 4.07 11.94 3.25 14 3.25C16.06 3.25 18.03 4.07 19.48 5.52C20.93 6.97 21.75 8.94 21.75 11ZM16.25 11C16.25 9.76 15.24 8.75 14 8.75C12.76 8.75 11.75 9.76 11.75 11C11.75 12.24 12.76 13.25 14 13.25C15.24 13.25 16.25 12.24 16.25 11ZM17.75 11C17.75 13.07 16.07 14.75 14 14.75C11.93 14.75 10.25 13.07 10.25 11C10.25 8.93 11.93 7.25 14 7.25C16.07 7.25 17.75 8.93 17.75 11Z'

const PATH_TIP_X = 14
const PATH_TIP_Y = 24.75
// Head centre at icon coords (14, 11) → relative to the anchor (tip):
// (0, -13.75). Tooltip's V-pointer tip aligns here.
const HEAD_CENTRE_OFFSET_Y = 13.75
const BOUNDING_W = 28
const BOUNDING_H = 28

// Tooltip geometry.
const TOOLTIP_PADDING_H = 18
const TOOLTIP_PADDING_V = 12
const TOOLTIP_BORDER_RADIUS = 4
// Distance from the rect's bottom edge to the V-pointer's tip — the
// V protrudes downward this much, touching the pin's head centre.
const V_HEIGHT = 8
const V_BASE = 12
// Gap above the head centre so the V-pointer's tip clears the head
// ring without crashing into it.
const V_TO_HEAD_GAP = 14
// Rounding radius at the V's tip — drawn as a quadratic-bezier
// detour so the tip reads as a softened curve rather than a sharp
// point (matches TV's pin tooltip).
const V_TIP_RADIUS = 1.5
// Minimum tooltip width — matches the engine's textarea minimum so
// the editor doesn't stick out past the bubble for short / empty
// placeholder content on initial draw.
const MIN_TOOLTIP_WIDTH = 220
// Drop-shadow: a duplicate of the tooltip shape, drawn first with a
// downward offset + low alpha so the bubble reads as resting on
// the chart rather than floating flatly. TV's pin tooltip has a
// subtle bottom shadow with this same look.
const SHADOW_OFFSET_Y = 2
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.28)'

function parseExtendData (extendData: unknown): PinOverlayData {
  if (extendData !== null && typeof extendData === 'object') {
    return extendData as PinOverlayData
  }
  return {}
}

const pin: OverlayTemplate = {
  name: 'pin',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: (params) => {
    // Narrow `chart` to the impl class — getChartStore (and the
    // hover/click info it exposes) live on ChartImp, not the public
    // Chart interface. Same pattern Signpost uses for its
    // createXAxisFigures.
    const { chart, overlay, coordinates } = params as typeof params & { chart: ChartImp }
    if (coordinates.length < 1) return []

    const data = parseExtendData(overlay.extendData)
    const styles = (overlay.styles ?? {}) as OverlayStyleSlice

    const pinFill = styles.polygon?.color ?? data.backgroundColor ?? DEFAULT_PIN_COLOR

    const anchor = coordinates[0]
    const figures: OverlayFigure[] = [
      {
        type: 'path',
        attrs: {
          x: anchor.x - PATH_TIP_X,
          y: anchor.y - PATH_TIP_Y,
          width: BOUNDING_W,
          height: BOUNDING_H,
          path: PIN_PATH
        },
        styles: {
          style: 'fill',
          color: pinFill,
          fillRule: 'evenodd'
        }
      }
    ]

    // Tooltip — visible only while the overlay is hovered OR
    // selected (clicked). Reads hover/click state from the chart
    // store so the tooltip redraws on hover-state changes without
    // any extra plumbing.
    const chartStore = chart.getChartStore()
    const hoverOverlayId = chartStore.getHoverOverlayInfo().overlay?.id
    const clickOverlayId = chartStore.getClickOverlayInfo().overlay?.id
    const isActive = hoverOverlayId === overlay.id || clickOverlayId === overlay.id

    if (isActive) {
      const textValue = data.text ?? ''
      const fontSize = styles.text?.size ?? DEFAULT_FONT_SIZE
      const fontWeight = styles.text?.weight ?? 'normal'
      const fontStyle = styles.text?.fontStyle ?? 'normal'
      const fontFamily = styles.text?.family ?? DEFAULT_FONT_FAMILY
      const textColor = styles.text?.color ?? DEFAULT_TOOLTIP_TEXT_COLOR
      const tooltipBg = styles.text?.backgroundColor ?? DEFAULT_TOOLTIP_BG
      const tooltipBorderColor = styles.rect?.borderColor ?? DEFAULT_TOOLTIP_BORDER
      const tooltipBorderSize = (data.borderVisible ?? (styles.rect?.borderColor !== undefined && styles.rect.borderColor !== 'transparent'))
        ? (styles.rect?.borderSize ?? 1)
        : 0

      // Auto-grow around the typed text; floor at MIN_TOOLTIP_WIDTH
      // so the textarea minimum doesn't stick out past the bubble
      // for placeholder content on initial draw.
      const sizingText = textValue.length > 0 ? textValue : '+ Add text'
      const lines = sizingText.split('\n')
      const maxLineWidth = lines.length === 1
        ? calcTextWidth(sizingText, fontSize, fontWeight, fontFamily)
        : Math.max(...lines.map(l => calcTextWidth(l, fontSize, fontWeight, fontFamily)))
      const tooltipWidth = Math.max(maxLineWidth + TOOLTIP_PADDING_H * 2, MIN_TOOLTIP_WIDTH)
      const tooltipHeight = lines.length * fontSize + TOOLTIP_PADDING_V * 2

      // V-pointer tip = pin's head centre. Rect sits above with the
      // V protruding from its bottom edge.
      const vTipY = anchor.y - HEAD_CENTRE_OFFSET_Y - V_TO_HEAD_GAP
      const rectBottom = vTipY - V_HEIGHT
      const rectTop = rectBottom - tooltipHeight
      const rectCentreX = anchor.x
      const rectLeft = rectCentreX - tooltipWidth / 2

      // V-pointer as an SVG path with a rounded tip. The two legs
      // approach the tip from base1 / base2; instead of meeting at
      // a sharp point we run them up to V_TIP_RADIUS short of the
      // tip and connect the gap with a quadratic-bezier whose
      // control point IS the tip. The result reads as a softly
      // rounded V.
      //
      // Approach offsets along each leg = unit(leg) * V_TIP_RADIUS.
      // Both legs share the same vertical drop (V_HEIGHT) and equal
      // horizontal halves (V_BASE / 2), so the unit-leg math
      // simplifies to (V_BASE / (2 * legLen), V_HEIGHT / legLen).
      const legHalfBase = V_BASE / 2
      const legLen = Math.sqrt(legHalfBase * legHalfBase + V_HEIGHT * V_HEIGHT)
      const approachDx = (legHalfBase / legLen) * V_TIP_RADIUS
      const approachDy = (V_HEIGHT / legLen) * V_TIP_RADIUS
      const baseLeftX = rectCentreX - legHalfBase
      const baseRightX = rectCentreX + legHalfBase
      const approachLeftX = rectCentreX - approachDx
      const approachLeftY = vTipY - approachDy
      const approachRightX = rectCentreX + approachDx
      const approachRightY = vTipY - approachDy
      const vPath = [
        `M ${baseLeftX} ${rectBottom}`,
        `L ${approachLeftX.toFixed(3)} ${approachLeftY.toFixed(3)}`,
        `Q ${rectCentreX} ${vTipY} ${approachRightX.toFixed(3)} ${approachRightY.toFixed(3)}`,
        `L ${baseRightX} ${rectBottom}`,
        'Z'
      ].join(' ')

      // Soft drop-shadow under the whole tooltip — duplicate of the
      // rect + V path, offset down a few pixels and drawn FIRST so
      // it sits behind everything. Low-alpha black gives the bubble
      // a subtle resting-on-the-chart feel.
      figures.push({
        type: 'rect',
        attrs: {
          x: rectLeft,
          y: rectTop + SHADOW_OFFSET_Y,
          width: tooltipWidth,
          height: tooltipHeight
        },
        styles: {
          style: 'fill',
          color: SHADOW_COLOR,
          borderRadius: TOOLTIP_BORDER_RADIUS,
          borderSize: 0
        }
      })
      figures.push({
        type: 'path',
        attrs: {
          x: 0,
          y: SHADOW_OFFSET_Y,
          width: tooltipWidth,
          height: V_HEIGHT,
          path: vPath
        },
        styles: {
          style: 'fill',
          color: SHADOW_COLOR
        }
      })

      // Rounded rect — the tooltip body. Border applied only when
      // the user picks a colour (defaults to none so the bubble
      // reads as a flat fill).
      figures.push({
        type: 'rect',
        attrs: {
          x: rectLeft,
          y: rectTop,
          width: tooltipWidth,
          height: tooltipHeight
        },
        styles: tooltipBorderSize > 0
          ? {
              style: 'stroke_fill',
              color: tooltipBg,
              borderColor: tooltipBorderColor,
              borderSize: tooltipBorderSize,
              borderRadius: TOOLTIP_BORDER_RADIUS
            }
          : {
              style: 'fill',
              color: tooltipBg,
              borderRadius: TOOLTIP_BORDER_RADIUS,
              borderSize: 0
            }
      })

      // V-pointer body — same path as the shadow, drawn at the real
      // position with the tooltip's fill colour.
      figures.push({
        type: 'path',
        attrs: {
          x: 0,
          y: 0,
          width: tooltipWidth,
          height: V_HEIGHT,
          path: vPath
        },
        styles: {
          style: 'fill',
          color: tooltipBg
        }
      })

      // Inline-editable text. Width pinned to the tooltip's actual
      // width so the textarea matches the bubble exactly (same
      // pattern Callout uses). Auto-opens after the first draw via
      // the engine's auto-mount-after-draw flow.
      const editableTextStyle: Record<string, unknown> = {
        size: fontSize,
        weight: fontWeight,
        fontStyle,
        family: fontFamily,
        backgroundColor: tooltipBg,
        borderRadius: TOOLTIP_BORDER_RADIUS,
        paddingLeft: TOOLTIP_PADDING_H,
        paddingRight: TOOLTIP_PADDING_H,
        paddingTop: TOOLTIP_PADDING_V,
        paddingBottom: TOOLTIP_PADDING_V,
        color: textColor
      }
      figures.push({
        type: 'editableText',
        attrs: {
          x: rectCentreX,
          y: rectTop + tooltipHeight / 2,
          width: tooltipWidth,
          height: tooltipHeight,
          text: textValue,
          align: 'center',
          baseline: 'middle'
        },
        styles: editableTextStyle
      })
    }

    return figures
  },

  // Anchor-drawing — when `extendData.anchorDrawing === true`, surface
  // the snapped bar's date on the x-axis under the pin. Always-on
  // (independent of selection) so the user can read the bar even
  // without hovering / clicking the pin. Same approach Signpost uses.
  createXAxisFigures: (params) => {
    const { chart, overlay, coordinates } = params as typeof params & { chart: ChartImp }
    if (coordinates.length < 1) return []
    const data = parseExtendData(overlay.extendData)
    if (data.anchorDrawing !== true) return []
    const point = overlay.points[0]
    if (!isNumber(point.timestamp)) return []
    const text = chart.getChartStore().getInnerFormatter()
      .formatDate(point.timestamp, 'YYYY-MM-DD HH:mm', 'crosshair')
    return [{
      type: 'text',
      attrs: { x: coordinates[0].x, y: 0, text, align: 'center' },
      ignoreEvent: true
    }]
  },

  onTextChange: ({ overlay, text: newText }) => {
    const current = parseExtendData(overlay.extendData)
    overlay.extendData = { ...current, text: newText }
  }
}

export type { PinOverlayData }

export default pin
