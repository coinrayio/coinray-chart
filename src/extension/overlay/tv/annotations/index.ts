/**
 * TradingView-parity tools, group "annotations". Owned by one implementer; the
 * overlay registry (../../index.ts) spreads `factories` into its list, so
 * adding a tool is: write it in this folder, append its factory here.
 */
import type { OverlayTemplate } from '../../../../component/Overlay'
import anchoredNote from './anchoredNote'
import anchoredText from './anchoredText'
import balloon from './balloon'

export const factories: Array<() => OverlayTemplate> = [
  () => balloon,
  () => anchoredText,
  () => anchoredNote
]
