/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Note overlay (TradingView `note`, LineToolNote): one click drops a pin on a
 * bar and price; the note text shows in a tooltip above it while the pin is
 * hovered or selected. It is `anchoredNote` without the screen anchoring, so
 * the two draw and style identically (see tv/annotations/anchoredNote.ts).
 *
 * Saved notes from when this was a two-point anchor-and-label drawing keep
 * their first point as the pin; the second is ignored.
 */

import { noteTemplate } from './tv/annotations/anchoredNote'
export type { AnchoredNoteData as NoteOverlayData } from './tv/annotations/anchoredNote'

export default noteTemplate('note')
