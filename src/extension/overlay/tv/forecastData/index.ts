/**
 * TradingView-parity tools, group "forecastData". Owned by one implementer; the
 * overlay registry (../../index.ts) spreads `factories` into its list, so
 * adding a tool is: write it in this folder, append its factory here.
 */
import type { OverlayTemplate } from '../../../../component/Overlay'
import { forecast, projection } from './forecast'
import { anchoredVwap } from './anchoredVwap'
import { fixedRangeVolumeProfile } from './volumeProfile'
import { regressionTrend } from './regressionTrend'
import { barsPattern } from './barsPattern'
import { ghostFeed } from './ghostFeed'

export const factories: Array<() => OverlayTemplate> = [forecast, projection, barsPattern, ghostFeed, regressionTrend, anchoredVwap, fixedRangeVolumeProfile]
