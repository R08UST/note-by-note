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
})
