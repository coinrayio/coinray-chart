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
 * Generic image figure — draws an already-loaded `HTMLImageElement`
 * into the bounding rect, optionally with reduced opacity. Image
 * loading itself lives at the overlay layer (`image` overlay
 * template caches `HTMLImageElement`s by `src` and triggers a chart
 * redraw on load). This figure just paints whatever it's handed.
 *
 * Hit-testing falls back to the rect bounds — same family as `rect`.
 */

import type Coordinate from '../../common/Coordinate'
import type { FigureTemplate } from '../../component/Figure'
import { checkCoordinateOnRect } from './rect'

export interface ImageAttrs {
  x: number
  y: number
  width: number
  height: number
  /**
   * Pre-loaded image. The overlay layer owns the loading lifecycle
   * (caches one `HTMLImageElement` per `src`, triggers a redraw on
   * `onload`) so this figure stays purely about painting.
   *
   * When `null` the figure draws nothing — used during the brief
   * window between an overlay declaring its image and the load
   * completing.
   */
  image: HTMLImageElement | null
}

export interface ImageStyle {
  /** 0–1 alpha multiplier applied via `ctx.globalAlpha`. */
  opacity: number
}

function checkCoordinateOnImage (
  coordinate: Coordinate,
  attrs: ImageAttrs | ImageAttrs[]
): boolean {
  return checkCoordinateOnRect(coordinate, attrs)
}

function drawImage (
  ctx: CanvasRenderingContext2D,
  attrs: ImageAttrs | ImageAttrs[],
  styles: Partial<ImageStyle>
): void {
  const list: ImageAttrs[] = ([] as ImageAttrs[]).concat(attrs)
  const opacity = styles.opacity ?? 1
  if (opacity <= 0) return
  const prevAlpha = ctx.globalAlpha
  ctx.globalAlpha = prevAlpha * opacity
  try {
    for (const a of list) {
      if (a.image !== null && a.image.complete && a.image.naturalWidth > 0) {
        ctx.drawImage(a.image, a.x, a.y, a.width, a.height)
      }
    }
  } finally {
    ctx.globalAlpha = prevAlpha
  }
}

const image: FigureTemplate<ImageAttrs | ImageAttrs[], Partial<ImageStyle>> = {
  name: 'image',
  checkEventOn: checkCoordinateOnImage,
  draw: drawImage
}

export default image
