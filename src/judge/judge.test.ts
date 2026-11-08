import { describe, expect, it } from 'vitest'
import { Judge, computeWindows } from './judge'
import type { PlayedEvent, ScoreNote } from './types'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch' | 'beat'>): ScoreNote {
  return {
    duration: 1,
    hand: 'R',
    measure: 1,
    ...partial,
  }
}

function on(pitch: number, timeMs: number): PlayedEvent {
  return { pitch, velocity: 90, timeMs, type: 'on' }
}

describe('computeWindows', () => {
  it('keeps the beginner window when the next note is far away', () => {
    const windows = computeWindows(
      [note({ id: 'a', pitch: 60, beat: 0 }), note({ id: 'b', pitch: 62, beat: 5 })],
      { bpm: 60 },
    )
    expect(windows[0]).toMatchObject({ earlyMs: 200, lateMs: 250 })
    expect(windows[1]).toMatchObject({ earlyMs: 200, lateMs: 250 })
  })

  it('shrinks each side to 40% of the gap to the neighbouring note', () => {
    const windows = computeWindows(
      [
        note({ id: 'a', pitch: 60, beat: 0 }),
        note({ id: 'b', pitch: 62, beat: 0.5 }),
        note({ id: 'c', pitch: 64, beat: 1 }),
      ],
      { bpm: 60 },
    )
    const middle = windows.find((item) => item.note.id === 'b')
    expect(middle?.earlyMs).toBeCloseTo(200)
    expect(middle?.lateMs).toBeCloseTo(200)
    const first = windows.find((item) => item.note.id === 'a')
    expect(first?.lateMs).toBeCloseTo(200)
    expect(first?.earlyMs).toBeCloseTo(200)
  })

  it('does not let chord tones within 50ms shrink each other', () => {
    const windows = computeWindows(
      [note({ id: 'c', pitch: 60, beat: 0 }), note({ id: 'e', pitch: 64, beat: 0.04 })],
      { bpm: 60 },
    )
    expect(windows.every((item) => item.earlyMs === 200 && item.lateMs === 250)).toBe(true)
  })

  it('treats a note just past 50ms as a neighbour', () => {
    const windows = computeWindows(
      [note({ id: 'a', pitch: 60, beat: 0 }), note({ id: 'b', pitch: 64, beat: 0.06 })],
      { bpm: 60 },
    )
    const first = windows.find((item) => item.note.id === 'a')
    expect(first?.lateMs).toBeCloseTo(24)
  })
})

describe('Judge', () => {
  const c = note({ id: 'c', pitch: 60, beat: 0 })

  it('scores an early hit with a negative offset and a late hit with a positive offset', () => {
    const early = new Judge([note({ id: 'a', pitch: 60, beat: 1 })], { bpm: 60 })
    expect(early.push(on(60, 900))).toEqual([
      { noteId: 'a', pitch: 60, result: 'hit', offsetMs: -100 },
    ])

    const late = new Judge([note({ id: 'b', pitch: 67, beat: 1 })], { bpm: 60 })
    expect(late.push(on(67, 1120))[0]).toMatchObject({ result: 'hit', offsetMs: 120 })
  })

  it('marks a different pitch inside the window as wrong and consumes the note', () => {
    const judge = new Judge([c], { bpm: 60 })
    const wrong = judge.push(on(62, 10))
    expect(wrong[0]).toMatchObject({ noteId: 'c', pitch: 62, result: 'wrong' })
    expect(judge.push(on(60, 20))[0]).toMatchObject({ result: 'extra' })
    expect(judge.advanceTo(10_000)).toEqual([])
  })

  it('marks a note-on with no open window as extra, and a closed window as a miss', () => {
    const judge = new Judge([c], { bpm: 60 })
    expect(judge.advanceTo(249)).toEqual([])
    expect(judge.advanceTo(251)).toEqual([{ noteId: 'c', pitch: 60, result: 'miss' }])
    expect(judge.push(on(60, 400))).toEqual([{ pitch: 60, result: 'extra' }])
  })

  it('ignores note-off events', () => {
    const judge = new Judge([c], { bpm: 60 })
    expect(judge.push({ pitch: 60, velocity: 0, timeMs: 0, type: 'off' })).toEqual([])
  })

  it('matches a rolled chord note by note inside a 50ms spread', () => {
    const judge = new Judge(
      [note({ id: 'c', pitch: 60, beat: 0 }), note({ id: 'e', pitch: 64, beat: 0 }), note({ id: 'g', pitch: 67, beat: 0 })],
      { bpm: 60 },
    )
    expect(judge.push(on(60, 0))[0]).toMatchObject({ noteId: 'c', result: 'hit', offsetMs: 0 })
    expect(judge.push(on(64, 40))[0]).toMatchObject({ noteId: 'e', result: 'hit', offsetMs: 40 })
    expect(judge.push(on(67, 48))[0]).toMatchObject({ noteId: 'g', result: 'hit', offsetMs: 48 })
  })

  it('consumes one chord tone when a wrong pitch arrives during the chord', () => {
    const judge = new Judge(
      [note({ id: 'c', pitch: 60, beat: 0 }), note({ id: 'e', pitch: 64, beat: 0 })],
      { bpm: 60 },
    )
    expect(judge.push(on(65, 5))[0]).toMatchObject({ noteId: 'c', result: 'wrong' })
    expect(judge.push(on(64, 20))[0]).toMatchObject({ noteId: 'e', result: 'hit' })
  })

  it('matches repeated pitches in time order when the windows overlap', () => {
    const judge = new Judge(
      [note({ id: 'first', pitch: 60, beat: 0 }), note({ id: 'second', pitch: 60, beat: 0.3 })],
      { bpm: 60, neighborFraction: 1 },
    )
    expect(judge.push(on(60, 200))[0]).toMatchObject({ noteId: 'first', result: 'hit', offsetMs: 200 })
    expect(judge.push(on(60, 300))[0]).toMatchObject({ noteId: 'second', result: 'hit', offsetMs: 0 })
  })

  it('rejects a strike that falls outside the shrunk window', () => {
    const judge = new Judge(
      [note({ id: 'a', pitch: 60, beat: 0 }), note({ id: 'b', pitch: 62, beat: 0.4 })],
      { bpm: 60 },
    )
    const produced = judge.push(on(60, 180))
    expect(produced.map((item) => item.result)).toEqual(['miss', 'extra'])
  })

  it('applies latencyOffsetMs to the event time, not the window clock', () => {
    const judge = new Judge([c], { bpm: 60, latencyOffsetMs: 100 })
    expect(judge.push(on(60, 300))[0]).toMatchObject({ result: 'hit', offsetMs: 200 })
  })

  it('emits a miss and an extra when the event itself is past the window', () => {
    const judge = new Judge([c], { bpm: 60 })
    expect(judge.push(on(60, 2000)).map((item) => item.result)).toEqual(['miss', 'extra'])
  })
})
