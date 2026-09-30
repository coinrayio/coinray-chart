import type { ProOverlayTemplate } from './types'
import { waveTemplate } from './tv/patterns/elliott'

/**
 * Any Waves overlay - any number of points labelled 0, 1, 2, ..., styled like
 * the Elliott tools (degree, wave toggle; see tv/patterns/elliott.ts).
 */
const anyWaves: () => ProOverlayTemplate = waveTemplate('anyWaves', Number.MAX_SAFE_INTEGER, (n) => Array<string[]>(5).fill(Array.from({ length: n }, (_, i) => String(i))), '#3D85C6')

export default anyWaves
