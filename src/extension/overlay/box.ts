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
 * Box Overlay
 *
 * A filled rectangle defined by two corner points.
 */

import type DeepPartial from '../../common/DeepPartial'
import { merge, clone } from '../../common/utils/typeChecks'

import type { ProOverlayTemplate } from './types'

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export interface BoxProperties {
  backgroundColor?: string
  /** Whether the overlay ignores mouse/touch events (default: true) */
  ignoreEvent?: boolean
}

const defaults: Required<BoxProperties> = {
  backgroundColor: 'rgba(33,150,243,0.15)',
  ignoreEvent: true
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const box = (): ProOverlayTemplate => {
  let properties: DeepPartial<BoxProperties> = {}

  const _extRef: { data: DeepPartial<BoxProperties> | null } = { data: null }

  const prop = <K extends keyof BoxProperties>(key: K): Required<BoxProperties>[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defs = defaults as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defs[key]) as Required<BoxProperties>[K]
  }

  return {
    name: 'box',
    totalStep: 3,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,

    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return []

      _extRef.data = (overlay.extendData != null && typeof overlay.extendData === 'object')
        ? overlay.extendData as DeepPartial<BoxProperties>
        : null

      const corner1 = coordinates[0]
      const corner2 = coordinates[1]

      const ignoreEvent = prop('ignoreEvent')

      return [{
        type: 'polygon',
        attrs: {
          coordinates: [
            corner1,
            { x: corner2.x, y: corner1.y },
            corner2,
            { x: corner1.x, y: corner2.y }
          ]
        },
        styles: {
          style: 'fill',
          color: prop('backgroundColor'),
          borderSize: 0
        },
        ignoreEvent
      }]
    },

    onRightClick: (event) => {
      ;(event as unknown as { preventDefault?: () => void }).preventDefault?.()
      return false
    },

    setProperties: (_properties: DeepPartial<BoxProperties>, _id: string) => {
      const newProps = clone(properties) as Record<string, unknown>
      merge(newProps, _properties)
      properties = newProps as DeepPartial<BoxProperties>
    },

    getProperties: (_id: string): DeepPartial<BoxProperties> => properties
  }
}

export default box
