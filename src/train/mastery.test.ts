import { describe, expect, it } from 'vitest'
import { levelStars, qualifyingCount, takeQualifies, unlockedThrough, type TakeScore } from './mastery'

function take(level: number, pitch: number, time: number, scoredTiming = true): TakeScore {
  return { level, pitchAccuracy: pitch, onTimeRate: time, scoredTiming }
}

describe('mastery gate', () => {
  it('requires 90% of the pitches and 80% on time when timing counts', () => {
    expect(takeQualifies(take(1, 0.9, 0.8))).toBe(true)
    expect(takeQualifies(take(1, 0.89, 1))).toBe(false)
    expect(takeQualifies(take(1, 1, 0.79))).toBe(false)
    expect(takeQualifies(take(1, 0.9, 0, false))).toBe(true)
  })

  it('opens the next level after three passing takes and gives stars', () => {
    const takes = [take(1, 1, 1), take(1, 0.5, 1), take(1, 0.95, 0.85), take(1, 1, 0.9)]
    expect(qualifyingCount(takes, 1)).toBe(3)
    expect(unlockedThrough(takes, 12)).toBe(2)
    expect(levelStars(takes, 1)).toBe(3)
    expect(levelStars([take(2, 0.2, 0)], 2)).toBe(1)
    expect(levelStars([], 3)).toBe(0)
    expect(unlockedThrough([take(1, 1, 1), take(1, 1, 1)], 12)).toBe(1)
  })
})
