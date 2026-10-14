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

import type DrawWidget from '../widget/DrawWidget'
import IndicatorWidget from '../widget/IndicatorWidget'
import YAxisWidget from '../widget/YAxisWidget'

import type YAxisImp from '../component/YAxis'
import type { YAxis } from '../component/YAxis'

import { getYAxisClass } from '../extension/y-axis'
import type { UpdateLevel } from '../common/Updater'
import type Bounding from '../common/Bounding'

import DrawPane from './DrawPane'
import { drawCanvas } from '../common/utils/canvas'

export default class IndicatorPane extends DrawPane<YAxis> {
  // Built the first time an indicator binds to it, then kept: it holds no
  // state worth rebuilding, and `_secondaryActive` says whether it counts.
  private _secondaryAxis: Nullable<YAxis> = null
  private _secondaryWidget: Nullable<YAxisWidget> = null
  private _secondaryActive = false

  override getSecondaryYAxis (): Nullable<YAxis> {
    return this._secondaryActive ? this._secondaryAxis : null
  }

  override getSecondaryYAxisWidget (): Nullable<YAxisWidget> {
    return this._secondaryActive ? this._secondaryWidget : null
  }

  override syncSecondaryYAxis (): boolean {
    const bound = this.getChart().getChartStore().getIndicatorsByPaneId(this.getId())
      .some(indicator => indicator.yAxis === 'secondary' && indicator.visible)
    const primary = this.getAxisComponent()
    const primaryWidget = this.getYAxisWidget()
    if (bound && this._secondaryAxis === null && primaryWidget !== null) {
      const YAxisClass = getYAxisClass('normal')
      const axis = new YAxisClass(this)
      const impl = axis as unknown as YAxisImp
      impl.secondary = true
      this._secondaryAxis = axis
      this._secondaryWidget = new YAxisWidget(this.getContainer(), this, true)
    }
    const changed = bound !== this._secondaryActive
    this._secondaryActive = bound && this._secondaryAxis !== null
    const axis = this._secondaryAxis
    const widget = this._secondaryWidget
    if (widget !== null) {
      widget.getContainer().style.display = this._secondaryActive ? '' : 'none'
    }
    if (this._secondaryActive && axis !== null && widget !== null && primaryWidget !== null) {
      // Opposite side of the primary, same inside/reverse/gap; the range is its own.
      axis.override({
        name: 'normal',
        position: primary.position === 'left' ? 'right' : 'left',
        inside: primary.inside,
        reverse: primary.reverse,
        gap: { ...primary.gap }
      })
      const { top, height } = primaryWidget.getBounding()
      widget.setBounding({ top, height })
    }
    return changed
  }

  override updateImp (level: UpdateLevel): void {
    super.updateImp(level)
    this.getSecondaryYAxisWidget()?.update(level)
  }

  override destroy (): void {
    super.destroy()
    this._secondaryWidget?.destroy()
  }

  override getImage (includeOverlay: boolean): HTMLCanvasElement {
    const canvas = super.getImage(includeOverlay)
    const widget = this.getSecondaryYAxisWidget()
    if (widget !== null) {
      const ctx = canvas.getContext('2d')!
      const bounding: Bounding = widget.getBounding()
      // `super.getImage` has already scaled the context by the pixel ratio.
      drawCanvas(ctx, widget.getImage(includeOverlay), bounding.left, 0, bounding.width, bounding.height)
    }
    return canvas
  }

  override createAxisComponent (name?: string): YAxis {
    const YAxisClass = getYAxisClass(name ?? 'default')
    return new YAxisClass(this)
  }

  override createMainWidget (container: HTMLElement): DrawWidget<DrawPane<YAxis>> {
    return new IndicatorWidget(container, this)
  }

  override createYAxisWidget (container: HTMLElement): Nullable<YAxisWidget> {
    return new YAxisWidget(container, this)
  }
}
