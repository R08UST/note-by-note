import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../score/parseMusicXml'
import { RHYTHM_LEVELS } from './curriculum'
import { cellSpans } from './generate'
import { generateHandsRhythm, generateRhythm, rhythmFromPiece, scoreRhythm, worstMeasures } from './rhythm'
import type { ScoreNote } from '../judge/types'

describe('rhythm generator', () => {
  it('uses only the level cell lengths and matches the parser', () => {
    for (const level of RHYTHM_LEVELS) {
      const built = generateRhythm(level.id, 4)
      const allowed = new Set(cellSpans(level.id, 'rhythm'))
      for (const note of built.notes) {
        expect(note.pitch).toBe(71)
        const ticks = Math.round(note.duration * 12)
        expect([...allowed, 12, 6].some((span) => ticks % span === 0)).toBe(true)
      }
      const parsed = parseMusicXml(built.xml)
      expect(parsed.notes.length).toBe(built.notes.length)
    }
  })

  it('is deterministic and can write a triplet or a tie', () => {
    expect(generateRhythm(1, 9).xml).toBe(generateRhythm(1, 9).xml)
    const triplet = generateRhythm(10, 1, 2)
    expect(triplet.notes.some((note) => Math.abs(note.duration - 1 / 3) < 0.02)).toBe(true)
    const tied = generateRhythm(4, 2, 2)
    expect(tied.notes.some((note) => note.duration >= 1)).toBe(true)
  })

  it('keeps two-hand rhythm and a stripped piece', () => {
    const hands = generateHandsRhythm(3)
    expect(hands.notes.some((note) => note.hand === 'L' && note.pitch === 48)).toBe(true)
    expect(hands.notes.some((note) => note.hand === 'R' && note.pitch === 72)).toBe(true)
    const piece: ScoreNote[] = [
      { id: 'a', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1 },
      { id: 'b', pitch: 64, beat: 1, duration: 1, hand: 'R', measure: 1 },
    ]
    const taken = rhythmFromPiece({ notes: piece, measures: [1], time: { beats: 4, beatType: 4 } })
    expect(taken.notes.map((note) => note.duration).slice(0, 2)).toEqual([1, 1])
    expect(worstMeasures([{ measure: 1, errors: 1, expected: 4 }, { measure: 3, errors: 2, expected: 2 }])).toEqual([1, 3])
  })
})

describe('scoreRhythm', () => {
  const notes: ScoreNote[] = [
    { id: 'a', pitch: 71, beat: 0, duration: 1, hand: 'R', measure: 1 },
    { id: 'b', pitch: 71, beat: 1, duration: 1, hand: 'R', measure: 1 },
  ]

  it('counts any key, and a tap outside the on-time band is still a hit inside the window', () => {
    const clean = scoreRhythm(notes, [{ pitch: 40, timeMs: 0 }, { pitch: 12, timeMs: 1000 }], 60, 'any')
    expect(clean.hits).toBe(2)
    expect(clean.perfects).toBe(2)
    const late = scoreRhythm(notes, [{ pitch: 40, timeMs: 200 }, { pitch: 40, timeMs: 1000 }], 60, 'any')
    expect(late.hits).toBe(2)
    expect(late.perfects).toBe(1)
  })
})
