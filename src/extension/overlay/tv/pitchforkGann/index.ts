/**
 * TradingView-parity tools, group "pitchforkGann". Owned by one implementer; the
 * overlay registry (../../index.ts) spreads `factories` into its list, so
 * adding a tool is: write it in this folder, append its factory here.
 */
import type { OverlayTemplate } from '../../../../component/Overlay'
import { pitchforkFactories } from './pitchfork'
import { gannFanFactories } from './gannFan'
import { gannSquareFactories } from './gannSquare'
import { gannBoxFactories } from './gannBox'

export const factories: Array<() => OverlayTemplate> = [...pitchforkFactories, ...gannFanFactories, ...gannSquareFactories, ...gannBoxFactories]
