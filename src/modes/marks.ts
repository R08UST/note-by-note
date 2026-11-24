import { extrasFor } from '../audio/performance'
import type { ScoreNote } from '../judge/types'

/**
 * Turn printed marks into extra judged strikes.
 *
 * Grace notes are printed as noteheads of their own, so they are expanded by default
 * for every practice mode (`includeGraces = true`). Symbols without their own noteheads
 * — ornaments and tremolo shakes — are expanded only when `honor` is on.
 *
 * All expanded strikes are marked `optional`: matching one scores a hit, and leaving
 * it out never becomes a miss. Dynamics, articulations, slurs, fermatas, breath marks
 * and pedals change how long or how loud a key is held rather than adding a strike, so
 * they add nothing here.
 */
export function markNotes(notes: readonly ScoreNote[], honor: boolean, includeGraces = true): ScoreNote[] {
  if (!honor && !includeGraces) return [...notes]
  const result: ScoreNote[] = []
  for (const note of notes) {
    result.push(note)
    const extras = extrasFor(note)
    if (!extras) continue
    for (const [index, extra] of extras.entries()) {
      // A grace note is printed as a notehead of its own, so wait mode holds the
      // cursor on it. It also sits on its written note's measure position, which is
      // where the drawn grace head lives, so the score can colour it. The other
      // marks land between beats and stay free to skip.
      const fromGrace = extra.kind === 'grace'
      // Wait mode reads grace notes even when the other printed marks are left off,
      // because they are written noteheads the player is meant to play.
      if (fromGrace ? !includeGraces : !honor) continue
      result.push({
        ...note,
        id: `${note.id}~m${index}`,
        pitch: extra.pitch,
        // A mark can sit before its written note (a mordent's lead-in). Clamp at
        // the start of the score so the first strike stays reachable.
        beat: Math.max(0, note.beat + extra.offset),
        duration: extra.gate,
        optional: true,
        localBeat: fromGrace
          ? note.localBeat
          : note.localBeat == null
            ? undefined
            : note.localBeat + extra.offset,
        ...(fromGrace && { fromGrace: true, anchorBeat: note.beat }),
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
