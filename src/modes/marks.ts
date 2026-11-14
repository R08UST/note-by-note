import { extrasFor } from '../audio/performance'
import type { ScoreNote } from '../judge/types'

/**
 * Turn printed marks into extra judged strikes.
 *
 * With the toggle off the score is judged exactly as engraved: one strike per
 * written notehead, and a grace note or a trill's alternation counts as an extra
 * (a stray key). With it on, the marks that playback already plays out — grace
 * notes, ornaments and tremolo shakes — become strikes of their own, so playing
 * what the sheet asks for is accepted instead of being called a stray key.
 *
 * They are added as `optional` strikes: matching one scores a hit, but leaving it
 * out never becomes a miss, so turning the toggle on can only help. Dynamics,
 * articulations, slurs, fermatas, breath marks and pedals change how long or how
 * loud a key is held rather than adding a strike, so they add nothing here.
 */
export function markNotes(notes: readonly ScoreNote[], honor: boolean): ScoreNote[] {
  if (!honor) return [...notes]
  const result: ScoreNote[] = []
  for (const note of notes) {
    result.push(note)
    const extras = extrasFor(note)
    if (!extras) continue
    for (const [index, extra] of extras.entries()) {
      result.push({
        ...note,
        id: `${note.id}~m${index}`,
        pitch: extra.pitch,
        // A mark can sit before its written note (a mordent's lead-in). Clamp at
        // the start of the score so the first strike stays reachable.
        beat: Math.max(0, note.beat + extra.offset),
        duration: extra.gate,
        optional: true,
        localBeat: note.localBeat == null ? undefined : Math.max(0, note.localBeat + extra.offset),
        graces: undefined,
        ornament: undefined,
        tremolo: undefined,
        arpeggio: undefined,
        fermata: undefined,
        slur: undefined,
      })
    }
  }
  return result
}
