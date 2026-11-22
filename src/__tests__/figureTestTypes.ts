import type { OverlayFigure } from '../component/Overlay'
import type { OverlayTemplate } from '../component/Overlay'
import type { LineStyle, PathStyle, RectStyle, StateTextStyle } from '../common/Styles'
import type { ArcAttrs } from '../extension/figure/arc'
import type { EditableTextAttrs } from '../extension/figure/editableText'
import type { ImageAttrs, ImageStyle } from '../extension/figure/image'
import type { LineAttrs } from '../extension/figure/line'
import type { PathAttrs } from '../extension/figure/path'
import type { PolygonAttrs } from '../extension/figure/polygon'
import type { RectAttrs } from '../extension/figure/rect'
import type { RotatedTextAttrs } from '../extension/figure/rotatedText'

/**
 * The engine types `OverlayFigure.attrs` and `styles` as `unknown`, because
 * each figure type has its own shape. An assertion reads whichever shape the
 * figure it found has, so these carry every figure's fields at once. They are
 * typed as present: a test that reads a field is asserting the figure has it,
 * and a missing one fails that assertion at run time. A field no figure has
 * at all is still a type error.
 */
export type TestFigureAttrs = ArcAttrs & EditableTextAttrs & ImageAttrs & LineAttrs & PathAttrs & PolygonAttrs & RectAttrs & RotatedTextAttrs
export type TestFigureStyles = Omit<LineStyle, 'style'> & Omit<RectStyle, 'style'> & Omit<PathStyle, 'style'> & StateTextStyle & ImageStyle & {
  /** Line dash type, or polygon / rect paint mode, by figure. */
  style: string
}

export interface TestFigure extends Omit<OverlayFigure, 'attrs' | 'styles'> {
  attrs: TestFigureAttrs
  styles: TestFigureStyles
}

/**
 * Runs a template's `createPointFigures` on a hand-built params object. The
 * tests pass only the parts of the chart, overlay and axes a template reads,
 * so the params are not a full `OverlayCreateFiguresCallbackParams`.
 */
export function pointFigures (tpl: Pick<OverlayTemplate, 'createPointFigures'>, params: object): TestFigure[] {
  const figures = tpl.createPointFigures?.(params as never) ?? []
  return (Array.isArray(figures) ? figures : [figures]) as TestFigure[]
}
