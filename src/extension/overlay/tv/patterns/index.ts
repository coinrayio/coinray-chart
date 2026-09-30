/**
 * TradingView-parity tools, group "patterns". Owned by one implementer; the
 * overlay registry (../../index.ts) spreads `factories` into its list, so
 * adding a tool is: write it in this folder, append its factory here.
 */
import type { OverlayTemplate } from '../../../../component/Overlay'
import cypher from './cypher'
import { elliottDoubleCombo, elliottTriangle, elliottTripleCombo } from './elliott'
import headAndShoulders from './headAndShoulders'
import threeDrives from './threeDrives'
import trianglePattern from './trianglePattern'

export const factories: Array<() => OverlayTemplate> = [
  headAndShoulders, threeDrives, trianglePattern, cypher, elliottTriangle, elliottDoubleCombo, elliottTripleCombo
]
