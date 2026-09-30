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
 * Per-overlay property store shared by the linesShapes tools: the
 * `setProperties/getProperties` pair of a pro overlay plus the line and
 * polygon style mappings every tool here needs.
 */

import type DeepPartial from '../../../../common/DeepPartial'
import type { LineStyle, PolygonStyle } from '../../../../common/Styles'
import { merge, clone } from '../../../../common/utils/typeChecks'
import type { OverlayProperties } from '../../types'
import { DEFAULT_OVERLAY_PROPERTIES } from '../../types'

export interface ToolProperties {
  props: (id: string) => DeepPartial<OverlayProperties>
  lineStyle: (id: string) => Partial<LineStyle>
  polygonStyle: (id: string) => Partial<PolygonStyle>
  setProperties: (properties: DeepPartial<OverlayProperties>, id: string) => void
  getProperties: (id: string) => DeepPartial<OverlayProperties>
}

export function createToolProperties (defaults: { lineWidth?: number } = {}): ToolProperties {
  const store = new Map<string, DeepPartial<OverlayProperties>>()
  const props = (id: string): DeepPartial<OverlayProperties> => store.get(id) ?? {}
  return {
    props,
    lineStyle: (id) => {
      const p = props(id)
      return {
        style: p.lineStyle ?? DEFAULT_OVERLAY_PROPERTIES.lineStyle,
        color: p.lineColor ?? DEFAULT_OVERLAY_PROPERTIES.lineColor,
        size: p.lineWidth ?? defaults.lineWidth ?? DEFAULT_OVERLAY_PROPERTIES.lineWidth,
        dashedValue: p.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
      }
    },
    polygonStyle: (id) => {
      const p = props(id)
      return {
        // An explicit fill colour implies a filled shape (same rule as circle).
        style: p.style ?? (p.backgroundColor !== undefined ? 'stroke_fill' : DEFAULT_OVERLAY_PROPERTIES.style),
        color: p.backgroundColor ?? DEFAULT_OVERLAY_PROPERTIES.backgroundColor,
        borderColor: p.borderColor ?? DEFAULT_OVERLAY_PROPERTIES.borderColor,
        borderSize: p.borderWidth ?? DEFAULT_OVERLAY_PROPERTIES.borderWidth,
        borderStyle: p.borderStyle ?? DEFAULT_OVERLAY_PROPERTIES.borderStyle,
        borderDashedValue: p.lineDashedValue ?? DEFAULT_OVERLAY_PROPERTIES.lineDashedValue
      }
    },
    setProperties: (properties, id) => {
      const next = clone(store.get(id) ?? {}) as Record<string, unknown>
      merge(next, properties)
      store.set(id, next as DeepPartial<OverlayProperties>)
    },
    getProperties: props
  }
}
