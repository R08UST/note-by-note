/**
 * Pick the OSMD cursor step for a score beat.
 *
 * Step times are the judged beats of the notes drawn under that step, not the
 * cursor's own timestamp. A short first measure (a pickup the file forgot to
 * mark implicit) makes those two clocks disagree, and following the timestamp
 * parks the line on a later note.
 */
export function cursorIndexForBeat(stepBeats: readonly (number | null)[], beat: number): number {
  let index = 0
  for (let i = 0; i < stepBeats.length; i += 1) {
    const value = stepBeats[i]
    if (value != null && value <= beat + 1e-3) index = i
  }
  return index
}
