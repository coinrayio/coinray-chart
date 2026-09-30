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
import type { LineStyle } from '../../common/Styles'
import { merge, clone } from '../../common/utils/typeChecks'
import type { OverlayProperties, ProOverlayTemplate } from './types'
import { DEFAULT_OVERLAY_PROPERTIES } from './types'
import { endCapFigures, type EndCaps } from './endCaps'

/**
 * Brush overlay - freehand drawing tool
 * Collects mouse points during drag to create a smooth path
 * Uses continuous drawing mode for collecting points during mouse move
 */
/**
 * `name` / `defaults` let one implementation serve both TV's Brush and its
 * Highlighter (same freehand stroke, wide and translucent by default).
 */
const brush = (name = 'brush', defaults: DeepPartial<OverlayProperties> = {}): ProOverlayTemplate => {
  const properties = new Map<string, DeepPartial<OverlayProperties>>()
  // TV's brush look, as explicit properties so the settings dialog reads what is drawn.
  const look: DeepPartial<OverlayProperties> = { lineColor: '#00BCD4', lineWidth: 2, backgroundColor: 'rgba(0, 188, 212, 0.5)', style: 'stroke', ...defaults }
  const props = (id: string): DeepPartial<OverlayProperties> => ({ ...look, ...(properties.get(id) ?? {}) })

  const lineStyle = (id: string): Partial<LineStyle> & { smooth?: boolean; lineCap?: CanvasLineCap; lineJoin?: CanvasLineJoin } => {
    const p = props(id)
    return {
      style: p.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
      color: p.lineColor,
      size: p.lineWidth,
      dashedValue: p.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue,
      // TV rounds off a sparse stroke; a dense one has no corners left to round.
      smooth: true,
      lineCap: 'round',
      lineJoin: 'round'
    }
  }

  const setProperties = (_properties: DeepPartial<OverlayProperties>, id: string): void => {
    const current = properties.get(id) ?? {}
    const newProps = clone(current) as Record<string, unknown>
    merge(newProps, _properties)
    properties.set(id, newProps as DeepPartial<OverlayProperties>)
  }

  const getProperties = props

  return {
    name,
    totalStep: 2,
    drawingMode: 'continuous',
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) {
        return []
      }

      const id = overlay.id
      const p = props(id)
      const style = lineStyle(id)
      const figures: Array<{ type: string, key?: string, attrs: unknown, styles?: unknown, ignoreEvent?: boolean }> = []
      // TV's Background: the stroke's own outline, filled.
      if (p.style === 'fill' || p.style === 'stroke_fill') {
        figures.push({ type: 'polygon', key: 'fill', attrs: { coordinates }, styles: { style: 'fill', color: p.backgroundColor }, ignoreEvent: true })
      }
      figures.push({ type: 'line', attrs: { coordinates }, styles: style })
      return [...figures, ...endCapFigures(coordinates, overlay.extendData as EndCaps | undefined, style.color, style.size)]
    },
    setProperties,
    getProperties
  }
}

export default brush
