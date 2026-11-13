import { describe, expect, it } from 'vitest'
import { cursorIndexForBeat, foldRepeats } from './cursorBeat'

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

  it('follows the first pass when a repeat makes the beats run twice', () => {
    // Bars 1-8 are repeated, so OSMD walks beats 0..21 twice before going on.
    // Playback plays the score once; the second pass must not win the lookup.
    const steps = [0, 1, 2, 3, 0, 1, 2, 3, 8, 9]
    expect(cursorIndexForBeat(steps, 0)).toBe(0)
    expect(cursorIndexForBeat(steps, 1.5)).toBe(1)
    expect(cursorIndexForBeat(steps, 3)).toBe(3)
    expect(cursorIndexForBeat(steps, 8)).toBe(8)
  })

  it('advances through eighth and sixteenth notes one step at a time', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
    expect(cursorIndexForBeat(steps, 0.5)).toBe(2)
    expect(cursorIndexForBeat(steps, 1.25)).toBe(5)
    expect(cursorIndexForBeat(steps, 1.9)).toBe(7)
  })
})
describe('foldRepeats', () => {
  it('keeps the first pass and remembers where each step really lives', () => {
    // Bars 1-8 repeat: OSMD walks beats 0..3, rewinds, walks them again, then goes on.
    // Only the rewind is dropped. The step that lands exactly on the last beat of
    // the first pass survives, because an equal beat can also be a second voice on
    // the same note and must not be thrown away.
    const raw = [0, 1, 2, 3, 0, 1, 2, 3, 8, 9]
    const walk = foldRepeats(raw)
    expect(walk.map((item) => item.beat)).toEqual([0, 1, 2, 3, 3, 8, 9])
    // The later music keeps its real place in OSMD's own walk.
    expect(walk.map((item) => item.step)).toEqual([0, 1, 2, 3, 7, 8, 9])
  })

  it('never lets a lookup fall back onto the second pass', () => {
    const raw = [0, 1, 2, 3, 0, 1, 2, 3, 8, 9]
    const walk = foldRepeats(raw)
    const beats = walk.map((item) => item.beat)
    // Beat 3 exists twice; the line must stand on the first pass.
    expect(walk[cursorIndexForBeat(beats, 3)].step).toBe(3)
  })

  it('points later steps past the repeated span they follow', () => {
    // The second pass occupies steps 4..7, so beat 8 lives on step 8, not step 4.
    const raw = [0, 1, 2, 3, 0, 1, 2, 3, 8, 9]
    const walk = foldRepeats(raw)
    const index = cursorIndexForBeat(walk.map((item) => item.beat), 8)
    expect(walk[index].step).toBe(8)
  })

  it('keeps rest-only steps so the line still visits empty bars', () => {
    const raw = [0, null, null, 4]
    expect(foldRepeats(raw).map((item) => item.beat)).toEqual([0, null, null, 4])
  })

  it('does not drop a beat that merely repeats, as two voices can share one', () => {
    const raw = [0, 0, 1, 1, 2]
    const walk = foldRepeats(raw)
    expect(walk.map((item) => item.beat)).toEqual([0, 0, 1, 1, 2])
    expect(walk.map((item) => item.step)).toEqual([0, 1, 2, 3, 4])
  })
})
