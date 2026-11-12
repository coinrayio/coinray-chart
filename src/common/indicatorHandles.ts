/**
 * Pixels between a selected indicator's handles, at the zoom it was selected
 * at: tradingview.com spaces them about this far apart.
 */
export const HANDLE_SPACING = 120

/**
 * Bars between handles for a bar `barSpace` pixels wide. Chosen once, when
 * the indicator is selected, and kept while it stays selected, as
 * tradingview.com does: zooming spreads or bunches the handles up instead of
 * moving them to other bars.
 */
export function handleStep (barSpace: number): number {
  return Math.max(1, Math.round(HANDLE_SPACING / Math.max(barSpace, 0.0001)))
}
