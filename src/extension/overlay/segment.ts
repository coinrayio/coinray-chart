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
import type { LineStyle, PolygonStyle, TextStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { getLinearSlopeIntercept, getLinearYFromCoordinates } from '../figure/line'
import { computeTextPosition } from './textUtils'
import { getRotateCoordinate } from './utils'

/** End-cap kind for either anchor of a segment. */
type EndCap = 'normal' | 'arrow'

/**
 * Build the three points that make up an arrowhead polygon anchored at
 * `anchor`, pointing away from `away`. The 30° spread (`arrowAngle`)
 * and the `arrowSize` ratio are the same shape the dedicated `arrow`
 * overlay uses, so a segment with `endCapRight: 'arrow'` and a plain
 * arrow overlay look identical at equal line widths.
 */
const buildArrowhead = (
  anchor: { x: number; y: number },
  away: { x: number; y: number },
  arrowSize: number
): Array<{ x: number; y: number }> => {
  const kb = getLinearSlopeIntercept(away, anchor)
  let angle = 0
  if (kb !== null) {
    angle = Math.atan(kb[0])
    if (anchor.x < away.x) {
      angle += Math.PI
    }
  } else {
    angle = anchor.y > away.y ? Math.PI / 2 : -Math.PI / 2
  }
  const arrowAngle = Math.PI / 6
  const p1 = getRotateCoordinate(
    { x: anchor.x - arrowSize, y: anchor.y },
    anchor,
    angle + arrowAngle
  )
  const p2 = getRotateCoordinate(
    { x: anchor.x - arrowSize, y: anchor.y },
    anchor,
    angle - arrowAngle
  )
  return [anchor, p1, p2]
}

const segment = (): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()

  const lineStyle = (id: string): Partial<LineStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: props.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      size: props.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth,
      dashedValue: props.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
    }
  }

  // Arrowheads always render as a filled solid triangle in the
  // line colour — regardless of whether the line itself is dashed
  // or dotted, because a dashed arrowhead reads as noise. Matches
  // the dedicated `arrow` overlay's treatment.
  const arrowheadStyle = (id: string): Partial<PolygonStyle> => {
    const props = properties.get(id) ?? {}
    return {
      style: 'fill',
      color: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      borderColor: props.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
      borderSize: 0,
      borderStyle: 'solid',
      borderDashedValue: [2, 2]
    }
  }

  const textStyle = (id: string): Partial<TextStyle> => {
    const props = properties.get(id) ?? {}
    return {
      color: props.textColor ?? DEFAULT_OVERLAY_PROPERTIES.textColor,
      size: props.textFontSize ?? DEFAULT_OVERLAY_PROPERTIES.textFontSize,
      weight: props.textFontWeight ?? DEFAULT_OVERLAY_PROPERTIES.textFontWeight,
      family: props.textFont ?? DEFAULT_OVERLAY_PROPERTIES.textFont,
      paddingLeft: props.textPaddingLeft ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingLeft,
      paddingRight: props.textPaddingRight ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingRight,
      paddingTop: props.textPaddingTop ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingTop,
      paddingBottom: props.textPaddingBottom ?? DEFAULT_OVERLAY_PROPERTIES.textPaddingBottom,
      backgroundColor: props.textBackgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.textBackgroundColor
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const current = properties.get(id) ?? {}
    const newProps = clone(current) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }

  const getProperties = (id: string): DeepPartial<OverlayProperties> => properties.get(id) ?? {}

  return {
    name: 'segment',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length !== 2) {
        return []
      }

      const id = overlay.id
      // `extendData` carries the trend-line variant flags (extend
      // toggles + end-cap kinds). All are optional; absent means
      // the legacy finite-segment behaviour.
      const ext = overlay.extendData as {
        extendLeft?: boolean
        extendRight?: boolean
        endCapLeft?: EndCap
        endCapRight?: EndCap
      } | undefined
      const extendLeft = ext?.extendLeft === true
      const extendRight = ext?.extendRight === true
      const endCapLeft: EndCap = ext?.endCapLeft ?? 'normal'
      const endCapRight: EndCap = ext?.endCapRight ?? 'normal'

      // `lineCoordinates` is always sorted so [0] is the visually
      // left (or top, for vertical) end and [1] is the right
      // (bottom). End-cap rendering relies on that order — left
      // cap fires at [0], right cap at [1] — and so does any
      // future midpoint / stats label work that wants to anchor
      // off a canonical end.
      let lineCoordinates: Array<{ x: number; y: number }> = coordinates

      if (coordinates[0].x === coordinates[1].x) {
        // Vertical line. With no extend flags we still sort by Y
        // so endCap targeting is deterministic; with extend flags
        // we push each end to the chart edge.
        const [topPt, bottomPt] = coordinates[0].y <= coordinates[1].y
          ? [coordinates[0], coordinates[1]]
          : [coordinates[1], coordinates[0]]
        lineCoordinates = [
          { x: coordinates[0].x, y: extendLeft ? 0 : topPt.y },
          { x: coordinates[0].x, y: extendRight ? bounding.height : bottomPt.y }
        ]
      } else {
        const [leftPt, rightPt] = coordinates[0].x <= coordinates[1].x
          ? [coordinates[0], coordinates[1]]
          : [coordinates[1], coordinates[0]]

        const startX = extendLeft ? 0 : leftPt.x
        const endX = extendRight ? bounding.width : rightPt.x
        lineCoordinates = [
          { x: startX, y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: startX, y: leftPt.y }) },
          { x: endX, y: getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: endX, y: rightPt.y }) }
        ]
      }

      const figures: Array<{
        type: string
        attrs: unknown
        styles?: Partial<LineStyle> | Partial<TextStyle> | Partial<PolygonStyle>
      }> = [
        {
          type: 'line',
          attrs: { coordinates: lineCoordinates },
          styles: lineStyle(id)
        }
      ]

      // Arrowhead size mirrors `arrow.ts`: scales with line width
      // with an 8 px floor so a 1 px line still has a visible head.
      const lineWidth = properties.get(id)?.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth
      const arrowSize = Math.max(8, lineWidth * 4)
      if (endCapRight === 'arrow') {
        figures.push({
          type: 'polygon',
          attrs: { coordinates: buildArrowhead(lineCoordinates[1], lineCoordinates[0], arrowSize) },
          styles: arrowheadStyle(id)
        })
      }
      if (endCapLeft === 'arrow') {
        figures.push({
          type: 'polygon',
          attrs: { coordinates: buildArrowhead(lineCoordinates[0], lineCoordinates[1], arrowSize) },
          styles: arrowheadStyle(id)
        })
      }

      const props = properties.get(id) ?? {}
      const text = props.text ?? ''
      const midX = (lineCoordinates[0].x + lineCoordinates[1].x) / 2
      const midY = (lineCoordinates[0].y + lineCoordinates[1].y) / 2
      figures.push({
        type: 'editableText',
        attrs: { ...computeTextPosition(midX, midY, props, bounding.width, 'center', 'top'), text },
        styles: textStyle(id)
      })

      return figures
    },
    setProperties,
    getProperties
  }
}

export default segment
