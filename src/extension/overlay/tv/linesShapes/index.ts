/**
 * TradingView-parity tools, group "linesShapes". Owned by one implementer; the
 * overlay registry (../../index.ts) spreads `factories` into its list, so
 * adding a tool is: write it in this folder, append its factory here.
 */
import type { OverlayTemplate } from '../../../../component/Overlay'
import { disjointAngle, flatBottom, trendAngleTool } from './lines'
import { arc, doubleCurve, ellipse, rotatedRectangle } from './shapes'

export const factories: Array<() => OverlayTemplate> = [
  trendAngleTool, flatBottom, disjointAngle, ellipse, arc, doubleCurve, rotatedRectangle
]
