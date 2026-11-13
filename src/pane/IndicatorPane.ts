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
  // Nothing bound to the pane's own scale while a second one is shown.
  private _primaryHidden = false

  override isYAxisHidden (): boolean {
    return this._primaryHidden
  }

  override getSecondaryYAxis (): Nullable<YAxis> {
    return this._secondaryActive ? this._secondaryAxis : null
  }

  override getSecondaryYAxisWidget (): Nullable<YAxisWidget> {
    return this._secondaryActive ? this._secondaryWidget : null
  }

  override syncSecondaryYAxis (): boolean {
    const indicators = this.getChart().getChartStore().getIndicatorsByPaneId(this.getId())
    const bound = indicators.some(indicator => indicator.yAxis === 'secondary' && indicator.visible)
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
    const active = bound && this._secondaryAxis !== null
    // A pane below the price pane whose indicators are all on the second
    // scale shows that one alone, as tradingview.com moves an indicator's
    // only scale to the side it was pinned to. The price pane always has the
    // candles on its own.
    const primaryHidden = active && !this.getAxisComponent().isInCandle() &&
      !indicators.some(indicator => indicator.yAxis !== 'secondary')
    const changed = active !== this._secondaryActive || primaryHidden !== this._primaryHidden
    this._secondaryActive = active
    this._primaryHidden = primaryHidden
    if (primaryWidget !== null) {
      primaryWidget.getContainer().style.display = primaryHidden ? 'none' : ''
    }
    const axis = this._secondaryAxis
    const widget = this._secondaryWidget
    if (widget !== null) {
      widget.getContainer().style.display = this._secondaryActive ? '' : 'none'
    }
    if (this._secondaryActive && axis !== null && widget !== null && primaryWidget !== null) {
      // Its own side and invert when set (`secondaryAxis`), else the opposite
      // side of the primary, inverted with it; the same inside and gap, and
      // a range of its own.
      const own = this.getOptions().secondaryAxis
      axis.override({
        name: 'normal',
        position: own.position ?? (primary.position === 'left' ? 'right' : 'left'),
        inside: primary.inside,
        reverse: own.reverse ?? primary.reverse,
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
