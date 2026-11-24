import { bestCleanBpm, type LadderRun } from './ladder'
import { unlockedThrough, type TakeScore } from './mastery'
import { techLevels, type TechKind } from './technique'

/** A short daily warm-up: one finger drill, one scale, one chord, in that order. */

export const DAILY_ORDER: TechKind[] = ['finger', 'scale', 'chord']
/** Each step moves on after a clean take, or after this many takes. */
export const DAILY_TRIES = 3

export interface DailyStep {
  kind: TechKind
  level: number
  index: number
  title: string
}

export type DailyRun = TakeScore & LadderRun & { mode: string }

/**
 * For each kind, the highest unlocked level, and in it the first item with no clean take
 * against the metronome. When every item there is clean, the one with the slowest best tempo.
 */
export function dailyPlan(runs: readonly DailyRun[]): DailyStep[] {
  return DAILY_ORDER.map((kind) => {
    const levels = techLevels(kind)
    const own = runs.filter((run) => run.mode === kind)
    const level = unlockedThrough(own, levels.length)
    const items = levels[level - 1]?.items ?? []
    let index = 0
    let slowest = Infinity
    for (const [at, item] of items.entries()) {
      const best = bestCleanBpm(own, item.id)
      if (best == null) {
        index = at
        break
      }
      if (best < slowest) {
        slowest = best
        index = at
      }
    }
    return { kind, level, index, title: items[index]?.title ?? '' }
  })
}
