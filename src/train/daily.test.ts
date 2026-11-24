import { describe, expect, it } from 'vitest'
import { dailyPlan, type DailyRun } from './daily'
import { FINGER_LEVELS } from './technique'

const clean = (mode: string, level: number, itemId: string, bpm: number): DailyRun => ({ mode, level, itemId, bpm, pitchAccuracy: 1, onTimeRate: 1, scoredTiming: true, firstAttempt: true })

describe('dailyPlan', () => {
  it('starts a new player on the first item of each kind', () => {
    expect(dailyPlan([]).map((step) => [step.kind, step.level, step.index])).toEqual([
      ['finger', 1, 0],
      ['scale', 1, 0],
      ['chord', 1, 0],
    ])
  })

  it('skips items already played clean, then picks the slowest once all are clean', () => {
    const items = FINGER_LEVELS[0]?.items ?? []
    const some = [clean('finger', 1, items[0]?.id ?? '', 80), clean('finger', 1, items[1]?.id ?? '', 70)]
    expect(dailyPlan(some)[0]?.index).toBe(2)
    // Three clean first takes open level 2, so the plan moves up.
    const passed = [...some, clean('finger', 1, items[2]?.id ?? '', 60)]
    expect(dailyPlan(passed)[0]?.level).toBe(2)
  })

  it('picks the slowest clean item when the whole top level is clean', () => {
    const top = FINGER_LEVELS.at(-1)
    const lower = FINGER_LEVELS.slice(0, -1).flatMap((level) => level.items.slice(0, 3).map((item) => clean('finger', level.id, item.id, 100)))
    const topRuns = (top?.items ?? []).map((item, at) => clean('finger', top?.id ?? 0, item.id, at === 2 ? 60 : 90))
    const step = dailyPlan([...lower, ...topRuns])[0]
    expect(step?.level).toBe(top?.id)
    expect(step?.index).toBe(2)
  })
})
