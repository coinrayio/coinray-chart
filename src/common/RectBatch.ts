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

import { isTransparent } from './utils/color'

export interface BatchRect {
  x: number
  y: number
  width: number
  height: number
}

interface Layer {
  fills: Map<string, BatchRect[]>
  strokes: Map<string, BatchRect[]>
  /** Rects too thin to stroke, filled with their border colour instead. */
  thinFills: Map<string, BatchRect[]>
}

/**
 * Collects plain rectangles and paints each colour as one path: one `fill()`
 * per colour per layer, instead of the `beginPath` / `roundRect` / `fill` and
 * style switch per rect that a `rect` figure costs. With thousands of bars on
 * screen that per-rect work was most of the native canvas time.
 *
 * Output matches `drawRect` with no radius, a 1px solid border, and the same
 * half-pixel border inset. Layers paint in ascending order, fills before
 * strokes within a layer, so a caller putting wicks on layer 0 and bodies on
 * layer 1 keeps the stacking the per-bar draw had. Rects on one layer should
 * not overlap: a translucent colour is filled once as a union, not blended per
 * rect.
 */
// The engine compiles to ES5, where `for…of` and destructuring become iterator
// helpers; on the per-rect path these loops are plain indexed ones on purpose.
/* eslint-disable @typescript-eslint/prefer-for-of -- see above */
export default class RectBatch {
  private readonly _layers: Layer[] = []
  private readonly _transparent = new Map<string, boolean>()

  private _isTransparent (color: string): boolean {
    let transparent = this._transparent.get(color)
    if (transparent === undefined) {
      transparent = isTransparent(color)
      this._transparent.set(color, transparent)
    }
    return transparent
  }

  private _layer (index: number): Layer {
    let layer = this._layers[index] as Layer | undefined
    if (layer === undefined) {
      layer = { fills: new Map(), strokes: new Map(), thinFills: new Map() }
      this._layers[index] = layer
    }
    return layer
  }

  private static _push (map: Map<string, BatchRect[]>, color: string, rect: BatchRect): void {
    const list = map.get(color)
    if (list === undefined) {
      map.set(color, [rect])
    } else {
      list.push(rect)
    }
  }

  /** Returns whether anything will be painted, as `drawRect`'s `solid`. */
  fill (layer: number, color: string, rect: BatchRect): boolean {
    if (this._isTransparent(color)) {
      return false
    }
    RectBatch._push(this._layer(layer).fills, color, rect)
    return true
  }

  /**
   * A 1px border. A rect too small to show one is filled with the border colour
   * instead, unless `filled` says its body is already painted.
   */
  stroke (layer: number, color: string, rect: BatchRect, filled: boolean): void {
    if (this._isTransparent(color)) {
      return
    }
    const target = this._layer(layer)
    if (rect.width > 2 && rect.height > 2) {
      RectBatch._push(target.strokes, color, rect)
    } else if (!filled) {
      RectBatch._push(target.thinFills, color, rect)
    }
  }

  draw (ctx: CanvasRenderingContext2D): void {
    if (this._layers.length === 0) {
      return
    }
    ctx.setLineDash([])
    ctx.lineWidth = 1
    this._layers.forEach(layer => {
      layer.fills.forEach((rects, color) => {
        ctx.fillStyle = color
        ctx.beginPath()
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]
          ctx.rect(r.x, r.y, r.width, r.height)
        }
        ctx.fill()
      })
      layer.strokes.forEach((rects, color) => {
        ctx.strokeStyle = color
        ctx.beginPath()
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]
          ctx.rect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1)
        }
        ctx.stroke()
      })
      layer.thinFills.forEach((rects, color) => {
        ctx.fillStyle = color
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]
          ctx.fillRect(r.x, r.y, r.width, r.height)
        }
      })
    })
  }
}
/* eslint-enable @typescript-eslint/prefer-for-of */
