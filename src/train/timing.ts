import type { ScoreNote } from '../judge/types'

/**
 * Hit window: half the shortest note, capped at 250 ms (piano-trainer rhythm_checker).
 * On-time band: ±max(40 ms, 0.15 of a beat), tightened from 1.0 at level 1 to 0.6 at level 10
 * (RhythmTrainer's 0.15-beat press window).
 */
export function timingForExercise(notes: readonly ScoreNote[], bpm: number, level = 1): { earlyMs: number; lateMs: number; perfectMs: number } {
  const shortest = notes.reduce((min, note) => Math.min(min, note.duration), 1)
  const beatMs = 60_000 / bpm
  const window = Math.min((shortest * beatMs) / 2, 250)
  const factor = 1 - Math.min(9, Math.max(0, level - 1)) * (0.4 / 9)
  const perfect = Math.max(40, 0.15 * beatMs) * factor
  return { earlyMs: window, lateMs: window, perfectMs: perfect }
}

/** Solfege rhythmtapping: an interval passes when it is within ±ratio of the expected IOI. */
export function ioiRatio(expectedMs: readonly number[], playedMs: readonly number[], ratio = 0.1): number {
  if (expectedMs.length === 0 || playedMs.length === 0) return 0
  const count = Math.min(expectedMs.length, playedMs.length)
  let passed = 0
  for (let index = 0; index < count; index += 1) {
    const expected = expectedMs[index] ?? 0
    const played = playedMs[index] ?? 0
    if (expected <= 0) continue
    if (Math.abs(played - expected) <= expected * ratio) passed += 1
  }
  return passed / count
}

/** Median tap-minus-click offset. Positive means the tap arrived after the click. */
export function medianOffset(samples: readonly number[]): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 1 ? sorted[mid]! : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  return Math.round(median)
}
