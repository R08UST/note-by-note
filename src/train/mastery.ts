export const MASTERY_TAKES = 3
export const PITCH_GATE = 0.9
export const TIME_GATE = 0.8

export interface TakeScore {
  level: number
  pitchAccuracy: number
  /** Fraction of notes inside the on-time band. Ignored when the drill did not score time. */
  onTimeRate: number
  scoredTiming: boolean
  hand?: 'R' | 'L' | 'both'
  seed?: number
  /** Stable bank id. Replays of the same item count once. */
  itemId?: string
  /** Replays do not count. Missing means this is the first attempt. */
  firstAttempt?: boolean
}

export function takeQualifies(take: TakeScore): boolean {
  if (take.firstAttempt === false) return false
  if (take.pitchAccuracy < PITCH_GATE) return false
  if (take.scoredTiming && take.onTimeRate < TIME_GATE) return false
  return true
}

export function qualifyingCount(takes: readonly TakeScore[], level: number, hand?: TakeScore['hand']): number {
  const seen = new Set<string>()
  let count = 0
  takes.forEach((take, index) => {
    if (take.level !== level || !takeQualifies(take)) return
    if (hand && take.hand && take.hand !== hand) return
    const key = take.itemId ?? (take.seed == null ? `row-${index}` : `${take.hand ?? ''}:${take.seed}`)
    if (seen.has(key)) return
    seen.add(key)
    count += 1
  })
  return count
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

/** Old 12-level drills map onto the nearest new S level. New runs set curriculum 2 and are not mapped. */
export function migratedSightLevel(level: number, curriculum?: number): number {
  if (curriculum === 2) return level
  if (level <= 2) return 1
  if (level <= 4) return 2
  if (level <= 6) return 3
  if (level <= 7) return 4
  if (level <= 9) return 5
  if (level <= 10) return 6
  if (level <= 11) return 7
  return 8
}

/** Three scores under 80% in a row: offer to step back (Piano Marvel strikes). */
export function shouldStepBack(scores: readonly number[]): boolean {
  const recent = scores.slice(-3)
  return recent.length >= 3 && recent.every((score) => score < 0.8)
}
