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
 * TradingView's Elliott combination waves: `elliott_triangle_wave`
 * (LineToolElliottTriangle, 6 points, labels 0 A-E), `elliott_double_combo`
 * (LineToolElliottDoubleCombo, 4 points, 0 W X Y) and `elliott_triple_combo`
 * (LineToolElliottTripleCombo, 6 points, 0 W X Y X Z). One polyline through
 * the points; each point from the second on carries a letter, centred on a
 * spot 10 px plus its circle's radius off the point, alternating above and
 * below. The glyph style follows `degree` (see elliottDegree.ts).
 * Mirrors TV's ElliottLabelsPaneView.
 *
 * extendData: `{ degree: TV index 0-14 or its name, default Intermediate,
 * showWave: boolean, default true }`.
 */

import type Coordinate from '../../../../common/Coordinate'
import type { OverlayFigure } from '../../../../component/Overlay'
import type { ProOverlayTemplate } from '../../types'
import { elliottGlyph, resolveDegree } from './elliottDegree'
import { patternProperties } from './patternShared'

interface ElliottExtendData {
  degree?: number | string
  showWave?: boolean
}

const upper = (letters: string): string[] => ['0', ...letters]
const lower = (letters: string): string[] => ['0', ...letters.toLowerCase()]
/** TV's label sets: upper case for sets 0, 2, 4, lower case for 1, 3. */
const sets = (letters: string): string[][] => [upper(letters), lower(letters), upper(letters), lower(letters), upper(letters)]

/** Whether each point's label sits below it: alternating, starting so that
 *  point 2 is below when the wave falls from point 1 to it (screen y grows
 *  downwards). */
export function labelsBelow (c: Coordinate[]): boolean[] {
  const rising = c.length > 2 && c[2].y < c[1].y
  return c.map((_, i) => (i % 2 === 0) !== rising)
}

/**
 * The wave labels for points 1.. of `c`: each glyph (with its circle when the degree calls
 * for one) sits off its point, alternating above and below. Point 0 is only labelled while
 * selected in TV; we leave it bare. Shared with fiveWaves and threeWaves.
 */
export function elliottLabelFigures (c: Coordinate[], labelSets: string[][], degree: number, color: string | undefined): OverlayFigure[] {
  const figures: OverlayFigure[] = []
  const below = labelsBelow(c)
  for (let i = 1; i < c.length; i++) {
    const g = elliottGlyph(labelSets, degree, i)
    const radius = g.circle / 2
    const sign = below[i] ? 1 : -1
    const at = { x: c[i].x, y: c[i].y + sign * (10 + radius) }
    if (g.circled) figures.push({ type: 'circle', key: `circle_${i}`, ignoreEvent: true, attrs: { x: at.x, y: at.y, r: radius }, styles: { style: 'stroke', borderColor: color, borderSize: 1 } })
    figures.push({
      type: 'text',
      key: `label_${i}`,
      ignoreEvent: true,
      attrs: { x: at.x, y: at.y, text: g.text, align: 'center', baseline: 'middle' },
      styles: { color, size: g.font, weight: g.bold ? 'bold' : 'normal', backgroundColor: 'transparent' }
    })
  }
  return figures
}

function elliottWave (name: string, letters: string, points: number, defaultColor: string): () => ProOverlayTemplate {
  const labelSets = sets(letters)
  return () => {
    const store = patternProperties({ color: defaultColor, background: 'transparent' })
    return {
      name,
      totalStep: points + 1,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      createPointFigures: ({ coordinates: c, overlay }) => {
        const id = overlay.id
        const ext = (overlay.extendData ?? {}) as ElliottExtendData
        const degree = resolveDegree(ext.degree)
        const color = store.color(id)
        const figures: OverlayFigure[] = []
        if (ext.showWave !== false) figures.push({ type: 'line', key: 'main', attrs: { coordinates: c }, styles: store.line(id) })
        figures.push(...elliottLabelFigures(c, labelSets, degree, color))
        return figures
      },
      setProperties: store.setProperties,
      getProperties: store.getProperties
    }
  }
}

// Point counts include TV's unlabelled starting point 0 ahead of the letters.
export const elliottTriangle = elliottWave('elliottTriangleWave', 'ABCDE', 6, '#FF9800')
export const elliottDoubleCombo = elliottWave('elliottDoubleCombo', 'WXY', 4, '#6AA84F')
export const elliottTripleCombo = elliottWave('elliottTripleCombo', 'WXYXZ', 6, '#6AA84F')
