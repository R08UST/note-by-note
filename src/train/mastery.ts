export const MASTERY_TAKES = 3
export const PITCH_GATE = 0.9
export const TIME_GATE = 0.8

export interface TakeScore {
  level: number
  pitchAccuracy: number
  /** Fraction of notes inside ±80ms. Ignored when the drill did not score time. */
  onTimeRate: number
  scoredTiming: boolean
}

export function takeQualifies(take: TakeScore): boolean {
  if (take.pitchAccuracy < PITCH_GATE) return false
  if (take.scoredTiming && take.onTimeRate < TIME_GATE) return false
  return true
}

export function qualifyingCount(takes: readonly TakeScore[], level: number): number {
  return takes.filter((take) => take.level === level && takeQualifies(take)).length
}

/** 0–3 stars from how many passing takes this level has. */
export function levelStars(takes: readonly TakeScore[], level: number): 0 | 1 | 2 | 3 {
  const passed = qualifyingCount(takes, level)
  const any = takes.some((take) => take.level === level)
  if (passed >= MASTERY_TAKES) return 3
  if (passed === 2) return 2
  if (passed === 1 || any) return 1
  return 0
}

/** Level 1 is open. Each later level opens after the previous one has enough passing takes. */
export function unlockedThrough(takes: readonly TakeScore[], levelCount: number): number {
  let open = 1
  for (let level = 1; level < levelCount; level += 1) {
    if (qualifyingCount(takes, level) < MASTERY_TAKES) break
    open = level + 1
  }
  return open
}

export interface PitchMemory {
  pitch: number
  seen: number
  errors: number
  reactionMs: number
}

export function errorRate(stat: PitchMemory | undefined): number {
  if (!stat || stat.seen === 0) return 0
  return stat.errors / stat.seen
}

export function weaknessMap(stats: readonly PitchMemory[]): Map<number, number> {
  return new Map(stats.map((stat) => [stat.pitch, errorRate(stat)]))
}
