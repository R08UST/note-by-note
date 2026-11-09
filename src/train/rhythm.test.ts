import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../score/parseMusicXml'
import {
  generateHandsRhythm,
  generatePulse,
  generateRhythm,
  matchRhythmPitch,
  rhythmFromPiece,
  RHYTHM_LEVELS,
  scoreRhythm,
  worstMeasures,
} from './rhythm'
import type { ScoreNote } from '../judge/types'

function expectParsed(xml: string, notes: { pitch: number; beat: number; duration: number }[]) {
  const parsed = parseMusicXml(xml)
  expect(parsed.notes.map((note) => [note.pitch, Number(note.beat.toFixed(4)), Number(note.duration.toFixed(4))])).toEqual(
    notes.map((note) => [note.pitch, Number(note.beat.toFixed(4)), Number(note.duration.toFixed(4))]),
  )
}

describe('rhythm generator', () => {
  it('fills every bar, stays on one pitch, and matches the parser', () => {
    for (const level of RHYTHM_LEVELS) {
      const built = generateRhythm(level.id, 5)
      const bar = level.time.beats * (4 / level.time.beatType)
      const measures = [...new Set(built.notes.map((note) => note.measure))]
      expect(measures.length).toBeGreaterThan(0)
      for (const measure of measures) {
        const covered = built.notes.filter((note) => note.measure === measure).reduce((sum, note) => sum + note.duration, 0)
        expect(covered).toBeLessThanOrEqual(bar + 1e-6)
      }
      for (const note of built.notes) expect(note.pitch).toBe(71)
      expectParsed(built.xml, built.notes)
    }
  })

  it('repeats itself for the same seed', () => {
    expect(generateRhythm(6, 21).xml).toBe(generateRhythm(6, 21).xml)
    expect(generateRhythm(6, 21).xml).not.toBe(generateRhythm(6, 22).xml)
  })

  it('writes triplets as three equal attacks inside a quarter', () => {
    const built = generateRhythm(7, 1, 1)
    const index = built.notes.findIndex((note, noteIndex, all) => {
      const second = all[noteIndex + 1]
      const third = all[noteIndex + 2]
      return second != null && third != null && Math.abs(note.duration - 1 / 3) < 1e-3 && Math.abs(second.duration - 1 / 3) < 1e-3 && Math.abs(third.duration - 1 / 3) < 1e-3
    })
    expect(index).toBeGreaterThanOrEqual(0)
    const group = built.notes.slice(index, index + 3)
    expect(group[1]!.beat - group[0]!.beat).toBeCloseTo(1 / 3)
    expect(group[2]!.beat - group[1]!.beat).toBeCloseTo(1 / 3)
  })

  it('merges a tie into one attack', () => {
    const built = generateRhythm(4, 2, 1)
    const parsed = parseMusicXml(built.xml)
    expect(parsed.notes.length).toBe(built.notes.length)
    expect(built.notes.some((note) => note.duration > 0.5)).toBe(true)
  })

  it('gives the two hands different pitches and a full bar each', () => {
    const built = generateHandsRhythm(8)
    const right = built.notes.filter((note) => note.hand === 'R')
    const left = built.notes.filter((note) => note.hand === 'L')
    expect(right.every((note) => note.pitch === 72)).toBe(true)
    expect(left.every((note) => note.pitch === 48)).toBe(true)
    for (const hand of [right, left]) {
      const covered = hand.filter((note) => note.measure === 1).reduce((sum, note) => sum + note.duration, 0)
      expect(covered).toBeCloseTo(4)
    }
    expectParsed(built.xml, built.notes)
  })

  it('builds a steady pulse and a rhythm taken from a piece', () => {
    const pulse = generatePulse('eighth', 1)
    expect(pulse.notes).toHaveLength(8)
    expect(pulse.notes.every((note) => note.duration === 0.5)).toBe(true)
    const piece: ScoreNote[] = [
      { id: 'a', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1 },
      { id: 'b', pitch: 64, beat: 1, duration: 1, hand: 'R', measure: 1 },
      { id: 'c', pitch: 67, beat: 4, duration: 2, hand: 'R', measure: 2 },
    ]
    const taken = rhythmFromPiece({ notes: piece, measures: [2, 1], time: { beats: 4, beatType: 4 } })
    expect(taken.notes.map((note) => note.pitch)).toEqual([71, 71, 71])
    expect(taken.notes.map((note) => note.duration)).toEqual([1, 1, 2])
    expect(worstMeasures([{ measure: 1, errors: 1, expected: 4 }, { measure: 2, errors: 3, expected: 4 }])).toEqual([1, 2])
  })
})

describe('scoreRhythm', () => {
  const notes: ScoreNote[] = [
    { id: 'a', pitch: 71, beat: 0, duration: 1, hand: 'R', measure: 1 },
    { id: 'b', pitch: 71, beat: 1, duration: 1, hand: 'R', measure: 1 },
  ]

  it('counts any key on time, and a late tap as not on time', () => {
    const clean = scoreRhythm(notes, [{ pitch: 40, timeMs: 0 }, { pitch: 12, timeMs: 1000 }], 60, 'any')
    expect(clean.hits).toBe(2)
    expect(clean.perfects).toBe(2)
    const late = scoreRhythm(notes, [{ pitch: 40, timeMs: 150 }, { pitch: 40, timeMs: 1000 }], 60, 'any')
    expect(late.hits).toBe(2)
    expect(late.perfects).toBe(1)
  })

  it('requires the chosen key, and the correct hand', () => {
    const missed = scoreRhythm(notes, [{ pitch: 62, timeMs: 0 }], 60, 'chosen', 60)
    expect(missed.hits).toBe(0)
    const hands = scoreRhythm(
      [
        { id: 'r', pitch: 72, beat: 0, duration: 1, hand: 'R', measure: 1 },
        { id: 'l', pitch: 48, beat: 0, duration: 1, hand: 'L', measure: 1 },
      ],
      [
        { pitch: 76, timeMs: 0 },
        { pitch: 40, timeMs: 20 },
      ],
      60,
      'hands',
    )
    expect(hands.hits).toBe(2)
    expect(matchRhythmPitch(40, [{ id: 'r', pitch: 72, beat: 0, duration: 1, hand: 'R', measure: 1 }], 'hands')).toBe(40)
  })
})
