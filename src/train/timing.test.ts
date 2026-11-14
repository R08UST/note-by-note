import { describe, expect, it } from 'vitest'
import { MIN_WINDOW_MS, ioiRatio, medianOffset, timingForExercise } from './timing'
import type { ScoreNote } from '../judge/types'

const quarter: ScoreNote = { id: 'q', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1 }
const eighth: ScoreNote = { id: 'e', pitch: 60, beat: 0, duration: 0.5, hand: 'R', measure: 1 }
const sixteenth: ScoreNote = { id: 's', pitch: 60, beat: 0, duration: 0.25, hand: 'R', measure: 1 }
const thirtySecond: ScoreNote = { id: 't', pitch: 60, beat: 0, duration: 0.125, hand: 'R', measure: 1 }

describe('timing windows', () => {
  it('caps half a quarter at 250 ms and shrinks for shorter notes', () => {
    expect(timingForExercise([quarter], 60, 1).earlyMs).toBe(250)
    // Half of an eighth at 120 bpm is 125 ms, which is still above the floor.
    expect(timingForExercise([eighth], 120, 10).earlyMs).toBeCloseTo(125)
    // Half of a sixteenth is 62.5 ms, under the floor, so the floor wins.
    expect(timingForExercise([sixteenth], 120, 10).earlyMs).toBe(MIN_WINDOW_MS)
    const fast = timingForExercise([sixteenth], 120, 10)
    expect(fast.perfectMs).toBeLessThan(timingForExercise([quarter], 120, 1).perfectMs)
  })

  it('keeps a floor on the window so a 32nd stays playable', () => {
    // Half of a 32nd at 120 bpm is 31 ms, which is under the jitter of a key press.
    const window = timingForExercise([thirtySecond], 120, 1)
    expect(window.earlyMs).toBe(MIN_WINDOW_MS)
    expect(window.lateMs).toBe(MIN_WINDOW_MS)
  })

  it('does not shrink the window because one short note sits in a slow piece', () => {
    const slow = [0, 1, 2, 3].map((beat) => ({ ...quarter, id: `q${beat}`, beat }))
    slow.push({ ...thirtySecond, beat: 3.875 })
    expect(timingForExercise(slow, 120, 1).earlyMs).toBe(MIN_WINDOW_MS)
  })

  it('accepts an inter-onset interval within 10 percent', () => {
    expect(ioiRatio([1000, 500], [1050, 500])).toBe(1)
    expect(ioiRatio([1000], [1200])).toBe(0)
  })

  it('stores the median tap offset', () => {
    expect(medianOffset([40, 10, 30, 80])).toBe(35)
    expect(medianOffset([20, 10, 30])).toBe(20)
  })
})
