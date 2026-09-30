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

import type DeepPartial from '../../common/DeepPartial'
import type { PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'

/** Gap between the box edge and text aligned to it. */
const TEXT_INSET = 8
/** Gap between the box edge and text hung outside it (TV's vertical Top / Bottom). */
const TEXT_GAP = 3

/**
 * Rectangle overlay - rectangle defined by two corner points
 * First point is one corner, second point is the opposite corner
 */
const rect = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()
  // TradingView's Rectangle defaults, held as explicit properties so the settings
  // dialog reads exactly what is drawn.
  const look: Record<string, unknown> = {
    style: 'stroke_fill',
    borderColor: '#9C27B0',
    borderWidth: 2,
    backgroundColor: 'rgba(156, 39, 176, 0.2)',
    textColor: '#9C27B0',
    textFontSize: 14,
    textAlignHorizontal: 'center',
    textAlignVertical: 'middle',
    // TV's Middle line: off, dashed, thinner than the border (`EXT_LINE_ROWS.middleLine` in the bindings).
    showMiddleLine: false,
    middleLineColor: '#9C27B0',
    middleLineWidth: 1,
    middleLineStyle: 'dashed'
  }
  const withLook = (id: string): DeepPartial<OverlayProperties> => Object.assign({}, look, properties.get(id))

  const rectStyle = (id: string): Partial<PolygonStyle> => {
    const props = withLook(id)
    return {
      // An explicitly-set fill colour implies the shape is filled. Without
      // this, picking a fill colour does nothing until the separate 'Fill
      // style' select is also switched off the default 'stroke'.
      style: props.style ?? (props.backgroundColor !== undefined ? 'stroke_fill' : DEFAULT_OVERLAY_PROPERTIES.style),
      color: props.backgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.backgroundColor,
      borderColor: props.borderColor ?? DEFAULT_OVERLAY_PROPERTIES.borderColor,
      borderSize: props.borderWidth ?? DEFAULT_OVERLAY_PROPERTIES.borderWidth,
      borderStyle: props.borderStyle ?? DEFAULT_OVERLAY_PROPERTIES.borderStyle,
      borderDashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
    }
  }

  const textStyle = (id: string): Partial<TextStyle> => {
    const props = withLook(id)
    return {
      color: props.textColor ?? DEFAULT_OVERLAY_PROPERTIES.textColor,
      size: props.textFontSize ?? DEFAULT_OVERLAY_PROPERTIES.textFontSize,
      weight: props.textFontWeight ?? DEFAULT_OVERLAY_PROPERTIES.textFontWeight,
      family: props.textFont ?? DEFAULT_OVERLAY_PROPERTIES.textFont,
      paddingLeft: props.textPaddingLeft ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingLeft,
      paddingRight: props.textPaddingRight ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingRight,
      paddingTop: props.textPaddingTop ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingTop,
      paddingBottom: props.textPaddingBottom ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingBottom,
      backgroundColor: props.textBackgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.textBackgroundColor,
      fontStyle: props.textFontStyle
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const current = properties.get(id) ?? {}
    const newProps = clone(current) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }

  const getProperties = withLook

  return {
    name: 'rect',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) {
        return []
      }

      const id = overlay.id
      // TV's Extend Left / Right: the box runs to the pane edge on that side.
      const ext = overlay.extendData as { extendLeft?: boolean, extendRight?: boolean } | undefined
      const left = ext?.extendLeft === true ? 0 : Math.min(coordinates[0].x, coordinates[1].x)
      const right = ext?.extendRight === true ? bounding.width : Math.max(coordinates[0].x, coordinates[1].x)
      const topLeft = { x: left, y: coordinates[0].y }
      const bottomRight = { x: right, y: coordinates[1].y }

      // Create rectangle as polygon with four corners
      const rectCoordinates = [
        topLeft,
        { x: bottomRight.x, y: topLeft.y },
        bottomRight,
        { x: topLeft.x, y: bottomRight.y }
      ]

      const figures: Array<{ type: string; key?: string; attrs: unknown; styles?: unknown }> = [
        {
          type: 'polygon',
          attrs: { coordinates: rectCoordinates },
          styles: rectStyle(id)
        }
      ]

      const props = withLook(id)
      const top = Math.min(topLeft.y, bottomRight.y)
      const bottom = Math.max(topLeft.y, bottomRight.y)

      // TV's Middle line: a horizontal line across the box.
      const middle = props as Record<string, unknown>
      if (middle.showMiddleLine === true) {
        const y = (top + bottom) / 2
        figures.push({
          type: 'line',
          key: 'middleLine',
          attrs: { coordinates: [{ x: topLeft.x, y }, { x: bottomRight.x, y }] },
          styles: { color: middle.middleLineColor, size: middle.middleLineWidth, style: middle.middleLineStyle, dashedValue: middle.middleLineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue }
        })
      }

      // Text is horizontally inside the box, at the edge or middle the alignment names. TV's
      // vertical Top / Bottom hang it *outside*, opposite: Top puts the text just under the bottom
      // edge, Bottom just above the top edge (measured on TV's own rectangle); Middle is centred.
      const h = props.textAlignHorizontal ?? 'center'
      const v = props.textAlignVertical ?? 'middle'
      figures.push({
        type: 'editableText',
        attrs: {
          x: h === 'left' ? topLeft.x + TEXT_INSET : h === 'right' ? bottomRight.x - TEXT_INSET : (topLeft.x + bottomRight.x) / 2,
          y: v === 'top' ? bottom + TEXT_GAP : v === 'bottom' ? top - TEXT_GAP : (top + bottom) / 2,
          align: h,
          baseline: v,
          text: props.text ?? ''
        },
        styles: textStyle(id)
      })

      return figures
    },
    setProperties,
    getProperties
  }
}

export default rect
