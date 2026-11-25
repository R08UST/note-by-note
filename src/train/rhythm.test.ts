import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../score/parseMusicXml'
import { RHYTHM_LEVELS } from './curriculum'
import { cellSpans } from './generate'
import { generateHandsRhythm, generatePulse, generateRhythm, readTiming, rhythmFromPiece, scoreRhythm, worstMeasures } from './rhythm'
import type { Judgement, ScoreNote } from '../judge/types'

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

describe('timing readout', () => {
  const notes = generatePulse('quarter', 2).notes
  const take = (offset: (index: number) => number | null): Judgement[] =>
    notes.flatMap((note, index): Judgement[] => {
      const value = offset(index)
      return value == null ? [{ noteId: note.id, pitch: note.pitch, result: 'miss' as const }] : [{ noteId: note.id, pitch: note.pitch, result: 'hit' as const, offsetMs: value }]
    })

  it('groups a take by bar and says when it runs late', () => {
    const readout = readTiming(notes, take(() => 90), 120)
    expect(readout.measures.map((row) => row.offsets.length)).toEqual([4, 4])
    expect(readout.lines[0]).toContain('偏晚 90')
  })

  it('names the uneven bar and counts what was missed', () => {
    const readout = readTiming(notes, take((index) => (index < 4 ? 0 : index % 2 ? 200 : null)), 120)
    expect(readout.lines).toContain('漏了 2 个音。')
    expect(readout.lines.some((line) => line.includes('第 2 小节'))).toBe(true)
    expect(readTiming(notes, take(() => 10), 120).lines).toEqual(['又准又稳。'])
  })
})
