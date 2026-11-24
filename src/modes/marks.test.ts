import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { FreeMode } from './freeMode'
import { markNotes } from './marks'
import { RhythmMode } from './rhythmMode'
import { WaitMode } from './waitMode'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch' | 'beat'>): ScoreNote {
  return { duration: 1, hand: 'R', measure: 1, ...partial }
}

describe('markNotes', () => {
  it('leaves ornaments and tremolos out when honor is off, while keeping printed grace notes by default', () => {
    const notes = [note({ id: 'a', pitch: 60, beat: 1, graces: [59], ornament: { kind: 'trill', upper: 62, lower: 58 } })]
    const marked = markNotes(notes, false)
    expect(marked.map((item) => item.id)).toEqual(['a', 'a~m0'])
    expect(marked[1]?.fromGrace).toBe(true)
    expect(markNotes(notes, false, false)).toEqual(notes)
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

  it('marks a grace strike as one wait mode holds the cursor on', () => {
    const notes = [note({ id: 'a', pitch: 60, beat: 1, graces: [58, 59], localBeat: 1 })]
    const marked = markNotes(notes, true)
    const graces = marked.filter((item) => item.fromGrace)
    expect(graces.map((item) => item.pitch).sort((x, y) => x - y)).toEqual([58, 59])
    // The line holds on the written notehead, and the grace head is drawn there too.
    expect(graces.every((item) => item.anchorBeat === 1)).toBe(true)
    expect(graces.every((item) => item.localBeat === 1)).toBe(true)
    // Ornaments and tremolos stay free to skip.
    expect(marked.filter((item) => item.optional && !item.fromGrace)).toHaveLength(0)
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

describe('printed grace notes across every practice mode', () => {
  // Chopin Waltz in A minor (B. 150) measure 5 pattern: two 16th graces (E5, F5) into E5 + LH C3, then D#5.
  const bar = [
    note({ id: 'rh', pitch: 76, beat: 1, hand: 'R', graces: [76, 77] }),
    note({ id: 'lh', pitch: 48, beat: 1, hand: 'L' }),
    note({ id: 'ds', pitch: 75, beat: 1.5, hand: 'R' }),
  ]

  it('expands grace strikes by default even when honor is off', () => {
    const marked = markNotes(bar, false)
    expect(marked.filter((item) => item.fromGrace).map((item) => item.pitch)).toEqual([76, 77])
    expect(marked.filter((item) => item.optional && !item.fromGrace)).toHaveLength(0)
  })

  it('accepts the grace notes in WaitMode, FreeMode, and RhythmMode with default markNotes(notes, false)', () => {
    const marked = markNotes(bar, false)
    const on = (pitch: number, timeMs: number) => ({ pitch, velocity: 84, timeMs, type: 'on' as const })

    const wait = new WaitMode(marked)
    for (const pitch of [76, 77, 48, 76, 75]) {
      expect(wait.push(on(pitch, 0))[0]?.result).toBe('hit')
    }
    expect(wait.done()).toBe(true)

    const free = new FreeMode(marked)
    const freeEvents = [
      [76, 480],
      [77, 540],
      [48, 600],
      [76, 605],
      [75, 900],
    ] as const
    for (const [pitch, timeMs] of freeEvents) {
      expect(free.push(on(pitch, timeMs))[0]?.result).toBe('hit')
    }
    expect(free.done()).toBe(true)

    // At 100 BPM (600 ms/beat), beat 1 is 600 ms and the two grace strikes sit just before it.
    const rhythm = new RhythmMode(marked, { bpm: 100 })
    const graces = marked.filter((item) => item.fromGrace).sort((a, b) => a.beat - b.beat)
    expect(rhythm.push(on(76, graces[0].beat * 600))[0]?.result).toBe('hit')
    expect(rhythm.push(on(77, graces[1].beat * 600))[0]?.result).toBe('hit')
    expect(rhythm.push(on(48, 600))[0]?.result).toBe('hit')
    expect(rhythm.push(on(76, 600))[0]?.result).toBe('hit')
    expect(rhythm.push(on(75, 900))[0]?.result).toBe('hit')
    expect(rhythm.done()).toBe(true)
  })

  it('never penalizes skipping the grace notes in RhythmMode, even on a slightly early written strike', () => {
    const marked = markNotes(bar, false)
    const on = (pitch: number, timeMs: number) => ({ pitch, velocity: 84, timeMs, type: 'on' as const })
    const rhythm = new RhythmMode(marked, { bpm: 100 })
    // Player skips both grace notes and plays the downbeat 40 ms early (560 ms instead of 600 ms).
    expect(rhythm.push(on(48, 560))[0]).toMatchObject({ noteId: 'lh', result: 'hit' })
    expect(rhythm.push(on(76, 565))[0]).toMatchObject({ noteId: 'rh', result: 'hit' })
    expect(rhythm.push(on(75, 900))[0]).toMatchObject({ noteId: 'ds', result: 'hit' })
    expect(rhythm.advanceTo(2000)).toEqual([])
    expect(rhythm.done()).toBe(true)
  })
})
