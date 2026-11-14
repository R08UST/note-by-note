import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { markNotes } from './marks'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch' | 'beat'>): ScoreNote {
  return { duration: 1, hand: 'R', measure: 1, ...partial }
}

describe('markNotes', () => {
  it('leaves the score alone when the toggle is off', () => {
    const notes = [note({ id: 'a', pitch: 60, beat: 0, graces: [59] })]
    expect(markNotes(notes, false)).toEqual(notes)
  })

  it('turns a grace note into an extra strike before its written note', () => {
    const notes = [note({ id: 'a', pitch: 60, beat: 1, graces: [58, 59] })]
    const marked = markNotes(notes, true)
    expect(marked).toHaveLength(3)
    const graces = marked.filter((item) => item.optional)
    expect(graces.map((item) => item.pitch).sort((x, y) => x - y)).toEqual([58, 59])
    expect(graces.every((item) => item.beat < 1 && item.beat >= 0)).toBe(true)
    // The written note itself stays required.
    expect(marked.filter((item) => !item.optional).map((item) => item.id)).toEqual(['a'])
  })

  it('turns a trill into alternations that are optional', () => {
    const notes = [note({ id: 't', pitch: 60, beat: 0, ornament: { kind: 'trill', upper: 62, lower: 58 } })]
    const marked = markNotes(notes, true)
    expect(marked.length).toBeGreaterThan(2)
    expect(marked.filter((item) => item.optional).every((item) => item.pitch === 60 || item.pitch === 62)).toBe(true)
  })

  it('turns a tremolo into a shake', () => {
    const notes = [note({ id: 'r', pitch: 60, beat: 0, duration: 1, tremolo: { strokes: 2, kind: 'single' } })]
    const marked = markNotes(notes, true)
    expect(marked.filter((item) => item.optional).length).toBeGreaterThan(1)
  })

  it('never pushes a lead-in strike before the start of the score', () => {
    const notes = [note({ id: 'm', pitch: 60, beat: 0, ornament: { kind: 'mordent', upper: 62, lower: 58 } })]
    const marked = markNotes(notes, true)
    expect(marked.every((item) => item.beat >= 0)).toBe(true)
  })

  it('does not add strikes for marks that only change how a key is held', () => {
    const notes = [
      note({ id: 's', pitch: 60, beat: 0, articulation: 'staccato' }),
      note({ id: 'f', pitch: 62, beat: 1, fermata: true }),
      note({ id: 'b', pitch: 64, beat: 2, breath: true }),
      note({ id: 'l', pitch: 65, beat: 3, slur: 1 }),
    ]
    expect(markNotes(notes, true)).toHaveLength(notes.length)
  })
})
