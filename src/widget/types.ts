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

export const WidgetNameConstants = {
  MAIN: 'main',
  X_AXIS: 'xAxis',
  Y_AXIS: 'yAxis',
  Y_AXIS_SECONDARY: 'yAxisSecondary',
  SEPARATOR: 'separator'
}

/** The mouse's grab band on a pane separator: a 2px line plus 4px either
 *  side, the same as the splitter between a host's layout panels. */
export const REAL_SEPARATOR_HEIGHT = 10

/** A finger's grab band on a pane separator: the mouse band is far too thin
 *  to land a touch on. */
export const TOUCH_SEPARATOR_HEIGHT = 24
