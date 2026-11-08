import type { ScoreNote } from '../judge/types'

export type HandSelection = 'L' | 'R' | 'both'

export function selectHands(notes: ScoreNote[], hands: HandSelection): ScoreNote[] {
  if (hands === 'both') return notes
  return notes.filter((note) => note.hand === hands)
}

/** Notes that share the first attack (a chord, or the single next note). */
export function firstOnset(notes: ScoreNote[]): ScoreNote[] {
  if (notes.length === 0) return []
  const sorted = [...notes].sort((a, b) => a.beat - b.beat || a.pitch - b.pitch)
  const beat = sorted[0].beat
  return sorted.filter((note) => Math.abs(note.beat - beat) < 1e-3)
}
