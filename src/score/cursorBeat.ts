/**
 * Pick the OSMD cursor step for a score beat.
 *
 * Step times are the judged beats of the notes drawn under that step, not the
 * cursor's own timestamp. A short first measure (a pickup the file forgot to
 * mark implicit) makes those two clocks disagree, and following the timestamp
 * parks the line on a later note.
 *
 * A repeat mark makes the cursor walk the repeated bars twice, so the same beat
 * shows up on two different steps. Playback runs the score once, so the first
 * pass is the one to follow: only a strictly later beat may move the line, which
 * also keeps it from stuttering when two voices share one timestamp.
 */
export function cursorIndexForBeat(stepBeats: readonly (number | null)[], beat: number): number {
  let index = 0
  let best = -Infinity
  for (let i = 0; i < stepBeats.length; i += 1) {
    const value = stepBeats[i]
    if (value == null) continue
    if (value <= beat + 1e-3 && value > best) {
      best = value
      index = i
    }
  }
  return index
}

export interface CursorWalk {
  /** Judged beat under the step, or null where the step only holds rests. */
  beat: number | null
  /** The step's index in the full OSMD walk, repeats included. */
  step: number
}

/**
 * Keep the first pass over repeated bars.
 *
 * A repeat mark makes OSMD engrave and walk the repeated bars a second time, so
 * the beat sequence falls back, for example 70, 71, 74, 51, 51.5 … 74, 75. The
 * parser reads each note once, so those extra steps have no beat of their own and
 * would otherwise match a beat on the far side of the rewind. Dropping any step
 * whose beat moves backwards leaves one entry per printed position, and the
 * recorded `step` still points at the right place in OSMD's own walk.
 */
export function foldRepeats(stepBeats: readonly (number | null)[]): CursorWalk[] {
  const walk: CursorWalk[] = []
  let lastBeat = -Infinity
  for (let step = 0; step < stepBeats.length; step += 1) {
    const beat = stepBeats[step]
    if (beat != null) {
      if (beat < lastBeat - 1e-3) continue
      lastBeat = beat
    }
    walk.push({ beat, step })
  }
  return walk
}
