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

import type Nullable from '../../common/Nullable'

import OverlayImp, { type OverlayTemplate, type OverlayConstructor, type OverlayInnerConstructor } from '../../component/Overlay'

// Basic line overlays
import horizontalRayLine from './horizontalRayLine'
import horizontalSegment from './horizontalSegment'
import horizontalStraightLine from './horizontalStraightLine'
import parallelStraightLine from './parallelStraightLine'
import priceChannelLine from './priceChannelLine'
import priceLine from './priceLine'
import rayLine from './rayLine'
import segment from './segment'
import straightLine from './straightLine'
import verticalRayLine from './verticalRayLine'
import verticalSegment from './verticalSegment'
import verticalStraightLine from './verticalStraightLine'

// Annotation overlays
import simpleAnnotation from './simpleAnnotation'
import simpleTag from './simpleTag'
import freePath from './freePath'

// Basic shape overlays (Pro overlays with factory pattern)
import arrow from './arrow'
import circle from './circle'
import rect from './rect'
import triangle from './triangle'
import parallelogram from './parallelogram'
import brush from './brush'

// Fibonacci overlays (Pro overlays with factory pattern)
import fibonacciLine from './fibonacciLine'
import fibonacciCircle from './fibonacciCircle'
import fibonacciSegment from './fibonacciSegment'
import fibonacciSpiral from './fibonacciSpiral'
import fibonacciSpeedResistanceFan from './fibonacciSpeedResistanceFan'
import fibonacciExtension from './fibonacciExtension'

// Wave pattern overlays (Pro overlays with factory pattern)
import threeWaves from './threeWaves'
import fiveWaves from './fiveWaves'
import eightWaves from './eightWaves'
import anyWaves from './anyWaves'

// Harmonic pattern overlays (Pro overlays with factory pattern)
import abcd from './abcd'
import xabcd from './xabcd'

// Gann overlays (Pro overlays with factory pattern)
import gannBox from './gannBox'

// Order line overlay (Pro overlay with factory pattern)
import orderLine from './orderLine'

const overlays: Record<string, OverlayInnerConstructor> = {}

// Standard overlays (direct templates)
const standardExtensions = [
  horizontalRayLine, horizontalSegment, horizontalStraightLine,
  parallelStraightLine, priceChannelLine, priceLine, rayLine, segment,
  straightLine, verticalRayLine, verticalSegment, verticalStraightLine,
  simpleAnnotation, simpleTag, freePath
]

// Pro overlays (factory functions that return templates)
const proExtensions = [
  arrow, circle, rect, triangle, parallelogram, brush,
  fibonacciLine, fibonacciCircle, fibonacciSegment, fibonacciSpiral, fibonacciSpeedResistanceFan, fibonacciExtension,
  threeWaves, fiveWaves, eightWaves, anyWaves,
  abcd, xabcd,
  gannBox,
  orderLine
]

// Register standard overlays (direct templates)
standardExtensions.forEach((template: OverlayTemplate) => {
  overlays[template.name] = OverlayImp.extend(template)
})

// Register pro overlays (call factory functions to get templates)
proExtensions.forEach((factory) => {
  const template = factory()
  overlays[template.name] = OverlayImp.extend(template)
})

function registerOverlay<E = unknown> (template: OverlayTemplate<E>): void {
  overlays[template.name] = OverlayImp.extend(template)
}

function getOverlayInnerClass (name: string): Nullable<OverlayInnerConstructor> {
  return overlays[name] ?? null
}

function getOverlayClass (name: string): Nullable<OverlayConstructor> {
  return overlays[name] ?? null
}

function getSupportedOverlays (): string[] {
  return Object.keys(overlays)
}

export { registerOverlay, getOverlayClass, getOverlayInnerClass, getSupportedOverlays }

// Export Pro overlay types and utilities
export type { OverlayProperties, ProOverlayTemplate, OverlayPropertiesStore, FigureLevel, DeepPartial } from './types'
export { DEFAULT_OVERLAY_PROPERTIES, isProOverlayTemplate, createPropertiesStore } from './types'

// Export default levels for fibonacci overlays
export { FIBONACCI_RETRACEMENT_LEVELS } from './fibonacciLine'
export { FIBONACCI_EXTENSION_LEVELS } from './fibonacciExtension'
export { FIBONACCI_CIRCLE_LEVELS } from './fibonacciCircle'
export { FIBONACCI_FAN_LEVELS } from './fibonacciSpeedResistanceFan'

// Export order line types and fluent API
export type { OrderLineProperties, OrderLine, OrderLineStyle, OrderLineEventListener } from './order'
export { createOrderLine } from './order'
