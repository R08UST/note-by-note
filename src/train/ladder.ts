import { PITCH_GATE, TIME_GATE } from './mastery'

/**
 * Speed ladder for technique drills. Two clean takes in a row raise the tempo,
 * two unclean takes in a row lower it, and each item remembers its fastest clean tempo.
 */

export const LADDER_STEP = 4
export const LADDER_MIN = 48
export const LADDER_MAX = 144
export const LADDER_RUN = 2
/** A new session starts this far under the best clean tempo, to warm up. */
export const LADDER_WARMUP = 8

export interface LadderRun {
  itemId?: string
  bpm: number
  scoredTiming: boolean
  pitchAccuracy: number
  onTimeRate: number
}

export interface LadderStreak {
  clean: number
  fail: number
}

export const EMPTY_STREAK: LadderStreak = { clean: 0, fail: 0 }

function clamp(bpm: number): number {
  return Math.min(LADDER_MAX, Math.max(LADDER_MIN, Math.round(bpm)))
}

/** Clean means the same gates as mastery, played in time against the metronome. */
export function isCleanRun(run: LadderRun): boolean {
  return run.scoredTiming && run.pitchAccuracy >= PITCH_GATE && run.onTimeRate >= TIME_GATE
}

export function bestCleanBpm(runs: readonly LadderRun[], itemId: string | undefined): number | null {
  if (!itemId) return null
  let best: number | null = null
  for (const run of runs) {
    if (run.itemId !== itemId || !isCleanRun(run)) continue
    if (best == null || run.bpm > best) best = run.bpm
  }
  return best
}

/** Where a session on this item should start. */
export function startBpm(best: number | null, fallback: number): number {
  return best == null ? clamp(fallback) : clamp(best - LADDER_WARMUP)
}

export function nextBpm(bpm: number, streak: LadderStreak, clean: boolean): { bpm: number; streak: LadderStreak; change: number } {
  if (clean) {
    const run = streak.clean + 1
    if (run >= LADDER_RUN) {
      const next = clamp(bpm + LADDER_STEP)
      return { bpm: next, streak: EMPTY_STREAK, change: next - bpm }
    }
    return { bpm, streak: { clean: run, fail: 0 }, change: 0 }
  }
  const run = streak.fail + 1
  if (run >= LADDER_RUN) {
    const next = clamp(bpm - LADDER_STEP)
    return { bpm: next, streak: EMPTY_STREAK, change: next - bpm }
  }
  return { bpm, streak: { clean: 0, fail: run }, change: 0 }
}
