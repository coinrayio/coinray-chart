import type { ProOverlayTemplate } from './types'
import { waveTemplate } from './tv/patterns/elliott'

/**
 * Three Waves overlay - TV's `elliott_correction`: 4 points labelled by degree
 * (see tv/patterns/elliottDegree.ts). extendData: `{ degree?, showWave? }`.
 */
const threeWaves: () => ProOverlayTemplate = waveTemplate('threeWaves', 5, () => [
  ['0', 'A', 'B', 'C'],
  ['0', 'a', 'b', 'c'],
  ['0', 'A', 'B', 'C'],
  ['0', 'a', 'b', 'c'],
  ['0', 'A', 'B', 'C']
], '#3D85C6')

export default threeWaves
