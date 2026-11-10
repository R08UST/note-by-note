import { describe, expect, it } from 'vitest'
import { cursorIndexForBeat } from './cursorBeat'

describe('cursorIndexForBeat', () => {
  it('lands on the notes at that beat when the engraving clock is shorter', () => {
    // Pickup of one quarter inside a 3/4 bar. OSMD's cursor reaches the
    // second bar at time 1, while the score still calls that onset beat 3.
    const steps = [0, 3, 3.5, 4, 5]
    expect(cursorIndexForBeat(steps, 0)).toBe(0)
    expect(cursorIndexForBeat(steps, 3)).toBe(1)
    expect(cursorIndexForBeat(steps, 3.5)).toBe(2)
    expect(cursorIndexForBeat(steps, 4.2)).toBe(3)
  })

  it('keeps the cursor on the current notes through a rest', () => {
    const steps = [0, null, null, 4]
    expect(cursorIndexForBeat(steps, 2)).toBe(0)
    expect(cursorIndexForBeat(steps, 4)).toBe(3)
  })
})