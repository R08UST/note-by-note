import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { WaitMode } from './waitMode'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch' | 'beat'>): ScoreNote {
  return { duration: 1, hand: 'R', measure: 1, ...partial }
}

const on = (pitch: number) => ({ pitch, velocity: 80, timeMs: 0, type: 'on' as const })

describe('WaitMode', () => {
  it('holds until every note of the current beat is played', () => {
    const mode = new WaitMode([
      note({ id: 'c', pitch: 60, beat: 0 }),
      note({ id: 'e', pitch: 64, beat: 0 }),
      note({ id: 'g', pitch: 67, beat: 1 }),
    ])
    expect(mode.cursorBeat()).toBe(0)
    expect(mode.push(on(64))[0]).toMatchObject({ noteId: 'e', result: 'hit' })
    expect(mode.cursorBeat()).toBe(0)
    expect(mode.currentNotes().map((item) => item.id)).toEqual(['c'])
    expect(mode.push(on(60))[0]).toMatchObject({ noteId: 'c', result: 'hit' })
    expect(mode.cursorBeat()).toBe(1)
    expect(mode.done()).toBe(false)
  })

  it('flags a wrong pitch and does not advance or consume the written note', () => {
    const mode = new WaitMode([note({ id: 'c', pitch: 60, beat: 0 })])
    expect(mode.push(on(62))[0]).toEqual({ pitch: 62, result: 'wrong' })
    expect(mode.cursorBeat()).toBe(0)
    expect(mode.push(on(60))[0]).toMatchObject({ noteId: 'c', result: 'hit' })
    expect(mode.done()).toBe(true)
  })

  it('accepts chord tones in any order', () => {
    const mode = new WaitMode([
      note({ id: 'c', pitch: 60, beat: 2 }),
      note({ id: 'e', pitch: 64, beat: 2 }),
      note({ id: 'g', pitch: 67, beat: 2 }),
    ])
    mode.push(on(67))
    mode.push(on(60))
    mode.push(on(64))
    expect(mode.done()).toBe(true)
  })

  it('calls notes after the piece extra', () => {
    const mode = new WaitMode([note({ id: 'c', pitch: 60, beat: 0 })])
    mode.push(on(60))
    expect(mode.push(on(60))[0].result).toBe('extra')
  })

  it('rewinds to the measure start on a wrong pitch when resetOnError is on', () => {
    const mode = new WaitMode(
      [
        note({ id: 'a', pitch: 60, beat: 0, measure: 1 }),
        note({ id: 'b', pitch: 62, beat: 1, measure: 1 }),
        note({ id: 'c', pitch: 64, beat: 2, measure: 1 }),
        note({ id: 'd', pitch: 65, beat: 4, measure: 2 }),
      ],
      { resetOnError: true },
    )
    expect(mode.push(on(60))[0]).toMatchObject({ noteId: 'a', result: 'hit' })
    expect(mode.push(on(62))[0]).toMatchObject({ noteId: 'b', result: 'hit' })
    expect(mode.cursorBeat()).toBe(2)
    // A wrong pitch rewinds to the first note of the measure and drops the hits.
    expect(mode.push(on(70))[0]).toEqual({ pitch: 70, result: 'wrong' })
    expect(mode.cursorBeat()).toBe(0)
    expect(mode.consumeReset().sort()).toEqual(['a', 'b'])
    expect(mode.judgements.filter((item) => item.result === 'hit').length).toBe(0)
    // Replaying the measure is now required again.
    expect(mode.currentNotes().map((item) => item.id)).toEqual(['a'])
  })

  it('does not rewind across a measure boundary', () => {
    const mode = new WaitMode(
      [
        note({ id: 'a', pitch: 60, beat: 0, measure: 1 }),
        note({ id: 'd', pitch: 65, beat: 4, measure: 2 }),
        note({ id: 'e', pitch: 67, beat: 5, measure: 2 }),
      ],
      { resetOnError: true },
    )
    mode.push(on(60))
    mode.push(on(65))
    expect(mode.cursorBeat()).toBe(5)
    mode.push(on(70))
    // Measure 2's own start (beat 4) is where it rewinds to, not measure 1.
    expect(mode.cursorBeat()).toBe(4)
  })

  it('keeps the old behavior when resetOnError is off', () => {
    const mode = new WaitMode([
      note({ id: 'a', pitch: 60, beat: 0, measure: 1 }),
      note({ id: 'b', pitch: 62, beat: 1, measure: 1 }),
    ])
    mode.push(on(60))
    expect(mode.cursorBeat()).toBe(1)
    mode.push(on(70))
    expect(mode.cursorBeat()).toBe(1)
    expect(mode.consumeReset()).toEqual([])
  })
})

describe('WaitMode with printed marks', () => {
  const base = { duration: 1, hand: 'R' as const, measure: 1 }
  const written = { ...base, id: 'w', pitch: 60, beat: 0 }
  const ornament = { ...base, id: 'w~m0', pitch: 62, beat: 0, optional: true }

  it('does not wait for an optional strike', () => {
    const engine = new WaitMode([written, ornament])
    expect(engine.push({ pitch: 60, velocity: 90, timeMs: 0, type: 'on' })[0]).toMatchObject({ result: 'hit' })
    expect(engine.done()).toBe(true)
  })

  it('accepts the optional strike as a hit when the player does play it', () => {
    const engine = new WaitMode([written, ornament])
    expect(engine.push({ pitch: 62, velocity: 90, timeMs: 0, type: 'on' })[0]).toMatchObject({
      noteId: 'w~m0',
      result: 'hit',
    })
    expect(engine.done()).toBe(false)
    expect(engine.push({ pitch: 60, velocity: 90, timeMs: 10, type: 'on' })[0]).toMatchObject({ result: 'hit' })
    expect(engine.done()).toBe(true)
  })
})

describe('WaitMode with a trill printed on the current note', () => {
  const base = { duration: 1, hand: 'R' as const, measure: 1 }
  // C4, the trilled D4 with its alternations sitting inside the next beat, then E4.
  const score = [
    { ...base, id: 'c', pitch: 60, beat: 0 },
    { ...base, id: 'd', pitch: 62, beat: 1 },
    { ...base, id: 'd~m0', pitch: 64, beat: 1.125, optional: true },
    { ...base, id: 'd~m1', pitch: 62, beat: 1.375, optional: true },
    { ...base, id: 'e', pitch: 64, beat: 2 },
  ]

  it('accepts an alternation whose beat lands past the current attack', () => {
    const engine = new WaitMode(score)
    expect(engine.push({ pitch: 60, velocity: 90, timeMs: 0, type: 'on' })[0]).toMatchObject({ result: 'hit' })
    const trill = engine.push({ pitch: 64, velocity: 90, timeMs: 10, type: 'on' })
    expect(trill[0]).toMatchObject({ noteId: 'd~m0', result: 'hit' })
    // The cursor stays on the written D4: the alternation does not move it.
    expect(engine.cursorBeat()).toBe(1)
  })

  it('still flags a pitch that is not on the sheet', () => {
    const engine = new WaitMode(score)
    engine.push({ pitch: 60, velocity: 90, timeMs: 0, type: 'on' })
    expect(engine.push({ pitch: 66, velocity: 90, timeMs: 10, type: 'on' })[0]).toMatchObject({ result: 'wrong' })
  })

  it('never consumes the written note that follows out of turn', () => {
    const engine = new WaitMode(score)
    engine.push({ pitch: 60, velocity: 90, timeMs: 0, type: 'on' })
    // The first E4 is a printed alternation of the trill; a second one is not on
    // the sheet at that point, so it must not reach the written E4 a beat away.
    expect(engine.push({ pitch: 64, velocity: 90, timeMs: 10, type: 'on' })[0]?.noteId).toBe('d~m0')
    expect(engine.push({ pitch: 64, velocity: 90, timeMs: 20, type: 'on' })[0]?.result).not.toBe('hit')
  })
})
