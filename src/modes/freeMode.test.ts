import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { FreeMode } from './freeMode'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch' | 'beat'>): ScoreNote {
  return { duration: 1, hand: 'R', measure: 1, ...partial }
}

const on = (pitch: number, timeMs: number) => ({ pitch, velocity: 84, timeMs, type: 'on' as const })

describe('FreeMode', () => {
  it('advances across written notes and records real event timestamps', () => {
    const mode = new FreeMode([
      note({ id: 'a', pitch: 60, beat: 0 }),
      note({ id: 'b', pitch: 62, beat: 1 }),
      note({ id: 'c', pitch: 64, beat: 2 }),
    ])
    expect(mode.push(on(60, 1000))[0]).toMatchObject({ noteId: 'a', result: 'hit' })
    expect(mode.push(on(62, 1600))[0]).toMatchObject({ noteId: 'b', result: 'hit' })
    expect(mode.push(on(64, 2200))[0]).toMatchObject({ noteId: 'c', result: 'hit' })
    expect(mode.done()).toBe(true)
    expect(mode.hitTimes.get('a')).toBe(1000)
    expect(mode.hitTimes.get('b')).toBe(1600)
    expect(mode.hitTimes.get('c')).toBe(2200)
  })

  it('does not block when one chord tone is missed and the player moves to the next beat', () => {
    const mode = new FreeMode([
      note({ id: 'c', pitch: 60, beat: 0 }),
      note({ id: 'e', pitch: 64, beat: 0 }),
      note({ id: 'g', pitch: 67, beat: 1 }),
    ])
    expect(mode.push(on(60, 0))).toEqual([{ noteId: 'c', pitch: 60, result: 'hit' }])
    expect(mode.cursorBeat()).toBe(0)
    // After 500 ms the player plays the next beat (G4), skipping the missing E4.
    const next = mode.push(on(67, 500))
    expect(next).toEqual([
      { noteId: 'e', pitch: 64, result: 'miss' },
      { noteId: 'g', pitch: 67, result: 'hit' },
    ])
    expect(mode.done()).toBe(true)
    expect(mode.hitTimes.has('e')).toBe(false)
    expect(mode.hitTimes.get('g')).toBe(500)
  })

  it('keeps waiting on the chord during a short fat-finger inside the chord settle window', () => {
    const mode = new FreeMode([
      note({ id: 'c', pitch: 60, beat: 0 }),
      note({ id: 'e', pitch: 64, beat: 0 }),
      note({ id: 'd', pitch: 62, beat: 1 }),
    ])
    mode.push(on(60, 100))
    // 25 ms later, accidentally brushes D4 while still landing the chord.
    expect(mode.push(on(62, 125))).toEqual([{ pitch: 62, result: 'wrong', measure: 1 }])
    expect(mode.cursorBeat()).toBe(0)
    // Landing E4 completes the chord cleanly.
    expect(mode.push(on(64, 140))).toEqual([{ noteId: 'e', pitch: 64, result: 'hit' }])
    expect(mode.cursorBeat()).toBe(1)
  })

  it('advances past a skipped note without stalling when the next beat is played', () => {
    const mode = new FreeMode([
      note({ id: 'a', pitch: 60, beat: 0 }),
      note({ id: 'b', pitch: 62, beat: 1 }),
      note({ id: 'c', pitch: 64, beat: 2 }),
      note({ id: 'd', pitch: 65, beat: 3 }),
    ])
    mode.push(on(60, 0))
    // Player skips D4 and continues straight onto E4 at beat 2.
    const res = mode.push(on(64, 1000))
    expect(res).toEqual([
      { noteId: 'b', pitch: 62, result: 'miss' },
      { noteId: 'c', pitch: 64, result: 'hit' },
    ])
    expect(mode.cursorBeat()).toBe(3)
    expect(mode.push(on(65, 1500))).toEqual([{ noteId: 'd', pitch: 65, result: 'hit' }])
    expect(mode.done()).toBe(true)
  })

  it('recovers across multiple skipped beats after a wrong attempt', () => {
    const mode = new FreeMode([
      note({ id: 'a', pitch: 60, beat: 0 }),
      note({ id: 'b', pitch: 62, beat: 1 }),
      note({ id: 'c', pitch: 64, beat: 2 }),
      note({ id: 'd', pitch: 67, beat: 3 }),
    ])
    mode.push(on(60, 0))
    // Hits a wrong pitch instead of beat 1, then resumes cleanly on beat 3.
    expect(mode.push(on(61, 500))).toEqual([{ pitch: 61, result: 'wrong', measure: 1 }])
    const recovered = mode.push(on(67, 1500))
    expect(recovered).toEqual([
      { noteId: 'b', pitch: 62, result: 'miss' },
      { noteId: 'c', pitch: 64, result: 'miss' },
      { noteId: 'd', pitch: 67, result: 'hit' },
    ])
    expect(mode.done()).toBe(true)
  })

  it('distinguishes a same-pitch next beat from a chord bounce', () => {
    const mode = new FreeMode([
      note({ id: 'c0', pitch: 60, beat: 0 }),
      note({ id: 'e0', pitch: 64, beat: 0 }),
      note({ id: 'c1', pitch: 60, beat: 1 }),
      note({ id: 'g1', pitch: 67, beat: 1 }),
    ])
    mode.push(on(60, 0))
    // Immediate bounce (< 80 ms) is ignored.
    expect(mode.push(on(60, 30))).toEqual([])
    expect(mode.cursorBeat()).toBe(0)
    // Playing C4 again 500 ms later advances to beat 1 and marks the skipped E4 missed.
    expect(mode.push(on(60, 500))).toEqual([
      { noteId: 'e0', pitch: 64, result: 'miss' },
      { noteId: 'c1', pitch: 60, result: 'hit' },
    ])
    expect(mode.cursorBeat()).toBe(1)
  })

  it('keeps optional grace and ornament marks non-blocking', () => {
    const mode = new FreeMode([
      note({ id: 'g0', pitch: 59, beat: 0.9, optional: true, fromGrace: true, anchorBeat: 1 }),
      note({ id: 'a', pitch: 60, beat: 1 }),
      note({ id: 'b', pitch: 62, beat: 2 }),
    ])
    // Skipping the optional grace note lands straight on the written note with no miss.
    expect(mode.push(on(60, 500))).toEqual([{ noteId: 'a', pitch: 60, result: 'hit' }])
    expect(mode.cursorBeat()).toBe(2)
    expect(mode.judgements.some((item) => item.result === 'miss')).toBe(false)
  })

  it('drops timestamps when retreating to replay an attack', () => {
    const mode = new FreeMode([
      note({ id: 'a', pitch: 60, beat: 0 }),
      note({ id: 'b', pitch: 62, beat: 1 }),
    ])
    mode.push(on(60, 100))
    mode.retreat()
    expect(mode.cursorBeat()).toBe(0)
    expect(mode.hitTimes.has('a')).toBe(false)
    mode.push(on(60, 900))
    expect(mode.hitTimes.get('a')).toBe(900)
  })
})
