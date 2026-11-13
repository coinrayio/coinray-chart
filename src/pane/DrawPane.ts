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

import type DeepRequired from '../common/DeepRequired'
import type Nullable from '../common/Nullable'
import type { UpdateLevel } from '../common/Updater'
import type Bounding from '../common/Bounding'

import { isValid, merge } from '../common/utils/typeChecks'

import type { Axis } from '../component/Axis'

import type DrawWidget from '../widget/DrawWidget'
import type YAxisWidget from '../widget/YAxisWidget'

import Pane from './Pane'
import { type PaneOptions, type YAxisColumns, PANE_DEFAULT_HEIGHT, PANE_MIN_HEIGHT, PaneIdConstants } from './types'

import type Chart from '../Chart'

import { createDom } from '../common/utils/dom'
import { drawCanvas, getPixelRatio } from '../common/utils/canvas'
import YAxisImp, { type YAxis } from '../component/YAxis'

export default abstract class DrawPane<C extends Axis = Axis> extends Pane {
  private readonly _mainWidget: DrawWidget<DrawPane<C>>
  private readonly _yAxisWidget: Nullable<YAxisWidget> = null

  private _axis: C
  private _yAxisColumns: Nullable<YAxisColumns> = null

  private readonly _options: DeepRequired<PaneOptions> = {
    id: '',
    minHeight: PANE_MIN_HEIGHT,
    dragEnabled: true,
    order: 0,
    height: PANE_DEFAULT_HEIGHT,
    state: 'normal',
    axis: { name: 'normal', scrollZoomEnabled: true },
    secondaryAxis: { position: null, reverse: null }
  }

  constructor (chart: Chart, id: string, options: Omit<PaneOptions, 'id' | 'height'>) {
    super(chart, id)
    const container = this.getContainer()
    this._mainWidget = this.createMainWidget(container)
    this._yAxisWidget = this.createYAxisWidget(container)
    this.setOptions(options)
  }

  setOptions (options: PaneOptions): this {
    const paneId = this.getId()
    // A manual range means nothing across a transform change; reverse, position
    // or gap changes keep it.
    let resetAuto = !isValid(this._axis)
    if (paneId === PaneIdConstants.CANDLE || paneId === PaneIdConstants.X_AXIS) {
      const axisName = options.axis?.name
      if (
        !isValid(this._axis) ||
        (isValid(axisName) && this._options.axis.name !== axisName)
      ) {
        this._axis = this.createAxisComponent(axisName ?? 'normal')
        resetAuto = true
      }
    } else {
      if (!isValid(this._axis)) {
        this._axis = this.createAxisComponent('normal')
      }
    }
    if (resetAuto && this._axis instanceof YAxisImp) {
      this._axis.setAutoCalcTickFlag(true)
    }
    // The lock request is one-shot: kept in _options it would re-lock on every call.
    const { priceToBarRatio, ...persistedAxis } = options.axis ?? {}
    merge(this._options, options.axis === undefined ? options : { ...options, axis: persistedAxis })
    this._axis.override({
      ...this._options.axis,
      ...(priceToBarRatio === undefined ? {} : { priceToBarRatio }),
      name: options.axis?.name ?? 'normal'
    })
    let container: Nullable<HTMLElement> = null
    let cursor = 'default'
    if (this.getId() === PaneIdConstants.X_AXIS) {
      container = this.getMainWidget().getContainer()
      cursor = 'ew-resize'
    } else {
      container = this.getYAxisWidget()!.getContainer()
      cursor = 'ns-resize'
    }
    if (options.axis?.scrollZoomEnabled ?? true) {
      container.style.cursor = cursor
    } else {
      container.style.cursor = 'default'
    }
    return this
  }

  getOptions (): DeepRequired<PaneOptions> { return this._options }

  getAxisComponent (): C {
    return this._axis
  }

  override setBounding (
    rootBounding: Partial<Bounding>,
    mainBounding?: Partial<Bounding>,
    leftYAxisBounding?: Partial<Bounding>,
    rightYAxisBounding?: Partial<Bounding>
  ): this {
    merge(this.getBounding(), rootBounding)
    const contentBounding: Partial<Bounding> = {}
    if (isValid(rootBounding.height)) {
      contentBounding.height = rootBounding.height
    }
    if (isValid(rootBounding.top)) {
      contentBounding.top = rootBounding.top
    }
    this._mainWidget.setBounding(contentBounding)
    const mainBoundingValid = isValid(mainBounding)
    if (mainBoundingValid) {
      this._mainWidget.setBounding(mainBounding)
    }
    // Each scale in its column: on a side with two, the pane's own scale
    // stands next to the plot and the second one outside it. The columns are
    // the chart's, so the scales of every pane line up.
    const leftWidth = leftYAxisBounding?.width ?? 0
    const rightWidth = rightYAxisBounding?.width ?? 0
    const cols = this._yAxisColumns ?? { left: { inner: leftWidth, outer: 0 }, right: { inner: rightWidth, outer: 0 } }
    const place = (widget: YAxisWidget, side: 'left' | 'right', outer: boolean): void => {
      widget.setBounding(contentBounding)
      if (side === 'left') {
        if (isValid(leftYAxisBounding)) {
          widget.setBounding(outer
            ? { width: cols.left.outer, left: 0 }
            : { width: cols.left.inner, left: cols.left.outer })
        }
      } else if (isValid(rightYAxisBounding)) {
        widget.setBounding({ width: outer ? cols.right.outer : cols.right.inner })
        if (mainBoundingValid) {
          const start = (mainBounding.left ?? 0) + (mainBounding.width ?? 0) + (mainBounding.right ?? 0) - rightWidth
          widget.setBounding({ left: outer ? start + cols.right.inner : start })
        }
      }
    }
    for (const { widget, side, outer } of this.getYAxisPlacements()) {
      place(widget, side, outer)
    }
    // A scale nothing uses takes no room and no events.
    if (isValid(this._yAxisWidget) && this.isYAxisHidden()) {
      this._yAxisWidget.setBounding({ width: 0 })
    }
    return this
  }

  /**
   * Where each shown scale of the pane goes: its side, and whether it stands
   * outside the pane's own scale there (a second scale on the same side).
   */
  getYAxisPlacements (): Array<{ axis: YAxis, widget: YAxisWidget, side: 'left' | 'right', outer: boolean }> {
    const out: Array<{ axis: YAxis, widget: YAxisWidget, side: 'left' | 'right', outer: boolean }> = []
    const primaryWidget = this._yAxisWidget
    const primaryShown = primaryWidget !== null && !this.isYAxisHidden()
    const primary = this._axis as unknown as YAxis
    if (primaryWidget !== null && primaryShown) {
      out.push({ axis: primary, widget: primaryWidget, side: primary.position === 'left' ? 'left' : 'right', outer: false })
    }
    const secondary = this.getSecondaryYAxis()
    const secondaryWidget = this.getSecondaryYAxisWidget()
    if (secondary !== null && secondaryWidget !== null) {
      const side = secondary.position === 'left' ? 'left' : 'right'
      out.push({ axis: secondary, widget: secondaryWidget, side, outer: primaryShown && primary.position === side })
    }
    return out
  }

  /** The chart's scale columns, for the next `setBounding`. */
  setYAxisColumns (columns: Nullable<YAxisColumns>): void {
    this._yAxisColumns = columns
  }

  /** Whether the pane's own scale is hidden: nothing is bound to it, and a second scale is shown. */
  isYAxisHidden (): boolean { return false }

  getMainWidget (): DrawWidget<DrawPane<C>> { return this._mainWidget }

  getYAxisWidget (): Nullable<YAxisWidget> { return this._yAxisWidget }

  /** The secondary y-axis, only while an indicator is bound to it. Panes without one return null. */
  getSecondaryYAxis (): Nullable<YAxis> { return null }

  /** The widget of the secondary y-axis, only while it exists. */
  getSecondaryYAxisWidget (): Nullable<YAxisWidget> { return null }

  /**
   * Creates, updates or retires the secondary axis to match the indicators
   * bound to it. Called by the chart's layout before any axis is measured.
   * @return whether the axis appeared or went away
   */
  syncSecondaryYAxis (): boolean { return false }

  override updateImp (level: UpdateLevel): void {
    this._mainWidget.update(level)
    this._yAxisWidget?.update(level)
  }

  destroy (): void {
    this._mainWidget.destroy()
    this._yAxisWidget?.destroy()
  }

  override getImage (includeOverlay: boolean): HTMLCanvasElement {
    const { width, height } = this.getBounding()
    const canvas = createDom('canvas', {
      width: `${width}px`,
      height: `${height}px`,
      boxSizing: 'border-box'
    })
    const ctx = canvas.getContext('2d')!
    const pixelRatio = getPixelRatio(canvas)
    canvas.width = width * pixelRatio
    canvas.height = height * pixelRatio
    ctx.scale(pixelRatio, pixelRatio)

    const mainBounding = this._mainWidget.getBounding()
    drawCanvas(
      ctx, this._mainWidget.getImage(includeOverlay),
      mainBounding.left, 0,
      mainBounding.width, mainBounding.height
    )
    if (this._yAxisWidget !== null) {
      const yAxisBounding = this._yAxisWidget.getBounding()
      drawCanvas(
        ctx, this._yAxisWidget.getImage(includeOverlay),
        yAxisBounding.left, 0,
        yAxisBounding.width, yAxisBounding.height
      )
    }
    return canvas
  }

  protected abstract createAxisComponent (name: string): C

  protected createYAxisWidget (_container: HTMLElement): Nullable<YAxisWidget> { return null }

  protected abstract createMainWidget (container: HTMLElement): DrawWidget<DrawPane<C>>
}
