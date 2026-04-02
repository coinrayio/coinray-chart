/**
 * Box Overlay
 *
 * A filled rectangle defined by two corner points.
 * All styling is passed via extendData (no setProperties needed).
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

  const prop = <K extends keyof BoxProperties>(key: K): BoxProperties[K] => {
    const ext = _extRef.data as Record<string, unknown> | null
    const props = properties as Record<string, unknown>
    const defs = defaults as Record<string, unknown>
    return (ext?.[key] ?? props[key] ?? defs[key]) as BoxProperties[K]
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

      const topLeft = coordinates[0]
      const bottomRight = coordinates[1]

      const ignoreEvent = ((_extRef.data as Record<string, unknown> | null)?.ignoreEvent ??
        (properties as Record<string, unknown>).ignoreEvent ?? true) as boolean

      return [{
        type: 'polygon',
        attrs: {
          coordinates: [
            topLeft,
            { x: bottomRight.x, y: topLeft.y },
            bottomRight,
            { x: topLeft.x, y: bottomRight.y }
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
