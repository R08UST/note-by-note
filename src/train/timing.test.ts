import { describe, expect, it } from 'vitest'
import { ioiRatio, medianOffset, timingForExercise } from './timing'
import type { ScoreNote } from '../judge/types'

const quarter: ScoreNote = { id: 'q', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1 }
const eighth: ScoreNote = { id: 'e', pitch: 60, beat: 0, duration: 0.25, hand: 'R', measure: 1 }

describe('timing windows', () => {
  it('caps half a quarter at 250 ms and shrinks for sixteenths', () => {
    expect(timingForExercise([quarter], 60, 1).earlyMs).toBe(250)
    const fast = timingForExercise([eighth], 120, 10)
    expect(fast.earlyMs).toBeCloseTo(62.5)
    expect(fast.perfectMs).toBeLessThan(timingForExercise([quarter], 120, 1).perfectMs)
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
