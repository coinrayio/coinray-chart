import type { ProOverlayTemplate } from './types'
import { waveTemplate } from './tv/patterns/elliott'

/**
 * Five Waves overlay - TV's `elliott_impulse_wave`: 6 points labelled by degree
 * (see tv/patterns/elliottDegree.ts). extendData: `{ degree?, showWave? }`.
 */
const fiveWaves: () => ProOverlayTemplate = waveTemplate('fiveWaves', 7, () => [
  ['0', '1', '2', '3', '4', '5'],
  ['0', 'i', 'ii', 'iii', 'iv', 'v'],
  ['0', '1', '2', '3', '4', '5'],
  ['0', 'I', 'II', 'III', 'IV', 'V'],
  ['0', '1', '2', '3', '4', '5']
], '#3D85C6')

export default fiveWaves
