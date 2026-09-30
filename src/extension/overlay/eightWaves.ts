import type { ProOverlayTemplate } from './types'
import { waveTemplate } from './tv/patterns/elliott'

/**
 * Eight Waves overlay - 9 points labelled 0-5, a, b, c, styled like the Elliott
 * tools (degree, wave toggle; see tv/patterns/elliott.ts).
 */
const labels = ['0', '1', '2', '3', '4', '5', 'a', 'b', 'c']
const eightWaves: () => ProOverlayTemplate = waveTemplate('eightWaves', 10, () => Array<string[]>(5).fill(labels), '#3D85C6')

export default eightWaves
