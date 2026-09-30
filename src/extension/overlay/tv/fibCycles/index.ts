/**
 * TradingView-parity tools, group "fibCycles". Owned by one implementer; the
 * overlay registry (../../index.ts) spreads `factories` into its list, so
 * adding a tool is: write it in this folder, append its factory here.
 */
import type { OverlayTemplate } from '../../../../component/Overlay'
import { fibTimeZone, trendBasedFibTime } from './fibTime'
import { fibSpeedResistanceArcs, fibWedge } from './fanArcs'
import { cyclicLines, timeCycles, sineLine } from './cycles'

export const factories: Array<() => OverlayTemplate> = [
  fibTimeZone, trendBasedFibTime, fibSpeedResistanceArcs, fibWedge, cyclicLines, timeCycles, sineLine
]
