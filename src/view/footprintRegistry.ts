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

import type Nullable from '../common/Nullable'
import type BarSpace from '../common/BarSpace'
import type { CandleFootprintStyle, RectStyle } from '../common/Styles'
import type { FootprintBarData } from '../common/Footprint'
import type { FigureCreate } from '../component/Figure'
import type { RectAttrs } from '../extension/figure/rect'
import type { YAxis } from '../component/YAxis'

/** What every footprint bar on screen shares. */
export interface FootprintFrame {
  style: CandleFootprintStyle
  /** Largest bid or ask cell on screen. */
  maxCell: number
  /** Largest |ask - bid| row on screen. */
  maxDelta: number
}

export type FootprintDrawer = (
  ctx: CanvasRenderingContext2D,
  yAxis: YAxis,
  x: number,
  priceY: number[],
  barSpace: BarSpace,
  data: FootprintBarData,
  frame: FootprintFrame,
  colors: string[]
) => Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>>

/**
 * The footprint drawing, once `enableFootprint()` (footprintDraw.ts) has run.
 * This file must not import footprintDraw.ts: that edge is what keeps the
 * drawing out of a bundle that never enables it.
 */
let drawer: Nullable<FootprintDrawer> = null

export function registerFootprintDrawer (draw: FootprintDrawer): void {
  drawer = draw
}

export function getFootprintDrawer (): Nullable<FootprintDrawer> {
  return drawer
}
