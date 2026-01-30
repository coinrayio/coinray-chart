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
import type { LineType, PolygonType } from '../../common/Styles'
import type { OverlayTemplate } from '../../component/Overlay'

/**
 * Extended overlay properties for per-instance styling.
 * This interface provides comprehensive styling options for overlays
 * that need individual property management (Pro overlays).
 */
export interface OverlayProperties {
  /** Polygon/shape rendering style: 'stroke', 'fill', or 'stroke_fill' */
  style: PolygonType

  /** Text content for annotations */
  text: string

  /** Text color (CSS color string) */
  textColor: string

  /** Text font family */
  textFont: string

  /** Text font size in pixels */
  textFontSize: number

  /** Text font weight (number or CSS keyword) */
  textFontWeight: number | string

  /** Text background color */
  textBackgroundColor: string

  /** Text padding left in pixels */
  textPaddingLeft: number

  /** Text padding right in pixels */
  textPaddingRight: number

  /** Text padding top in pixels */
  textPaddingTop: number

  /** Text padding bottom in pixels */
  textPaddingBottom: number

  /** Line/stroke color */
  lineColor: string

  /** Line width in pixels */
  lineWidth: number

  /** Line style: 'solid' or 'dashed' */
  lineStyle: LineType

  /** Line length (for specific overlay types) */
  lineLength: number

  /** Dashed line pattern [dash, gap] */
  lineDashedValue: number[]

  /** Tooltip text content */
  tooltip: string

  /** Background fill color */
  backgroundColor: string

  /** Border line style: 'solid' or 'dashed' */
  borderStyle: LineType

  /** Border color */
  borderColor: string

  /** Border width in pixels */
  borderWidth: number
}

/**
 * Default overlay properties.
 * Used as fallback values when properties are not explicitly set.
 */
export const DEFAULT_OVERLAY_PROPERTIES: OverlayProperties = {
  style: 'stroke',
  text: '',
  textColor: '#FFFFFF',
  textFont: 'Helvetica Neue',
  textFontSize: 12,
  textFontWeight: 'normal',
  textBackgroundColor: '#1677FF',
  textPaddingLeft: 4,
  textPaddingRight: 4,
  textPaddingTop: 4,
  textPaddingBottom: 4,
  lineColor: '#1677FF',
  lineWidth: 1,
  lineStyle: 'solid',
  lineLength: 50,
  lineDashedValue: [2, 2],
  tooltip: '',
  backgroundColor: 'rgba(22, 119, 255, 0.25)',
  borderStyle: 'solid',
  borderColor: '#1677FF',
  borderWidth: 1
}

/**
 * Extended overlay template with per-instance property management.
 * Pro overlays maintain a properties store keyed by overlay ID,
 * allowing each instance to have its own styling configuration.
 *
 * @example
 * ```typescript
 * const myProOverlay: ProOverlayTemplate = {
 *   name: 'myProOverlay',
 *   totalStep: 2,
 *   // ... other OverlayTemplate properties
 *
 *   setProperties(properties, id) {
 *     propertiesStore[id] = { ...propertiesStore[id], ...properties }
 *   },
 *
 *   getProperties(id) {
 *     return propertiesStore[id] ?? {}
 *   },
 *
 *   createPointFigures({ overlay }) {
 *     const props = this.getProperties?.(overlay.id) ?? {}
 *     // Use props.lineColor, props.lineWidth, etc.
 *   }
 * }
 * ```
 */
export interface ProOverlayTemplate<E = unknown> extends OverlayTemplate<E> {
  /**
   * Set properties for a specific overlay instance.
   * Properties are merged with existing values.
   *
   * @param properties - Partial properties to set/update
   * @param id - The overlay instance ID
   */
  setProperties?: (properties: DeepPartial<OverlayProperties>, id: string) => void

  /**
   * Get properties for a specific overlay instance.
   *
   * @param id - The overlay instance ID
   * @returns The current properties for the overlay, or empty object if not set
   */
  getProperties?: (id: string) => DeepPartial<OverlayProperties>
}

/**
 * Type guard to check if an overlay template is a Pro overlay.
 *
 * @param template - The overlay template to check
 * @returns True if the template has setProperties and getProperties methods
 */
export function isProOverlayTemplate<E = unknown> (
  template: OverlayTemplate<E>
): template is ProOverlayTemplate<E> {
  const pro = template as ProOverlayTemplate<E>
  return typeof pro.setProperties === 'function' && typeof pro.getProperties === 'function'
}

/**
 * Helper type for the properties store used by Pro overlays.
 * Maps overlay IDs to their property configurations.
 */
export type OverlayPropertiesStore = Record<string, DeepPartial<OverlayProperties>>

/**
 * Create a new properties store for Pro overlays.
 * This is a convenience function for initializing the store.
 *
 * @returns An empty properties store
 */
export function createPropertiesStore (): OverlayPropertiesStore {
  return {}
}

export type { DeepPartial }
