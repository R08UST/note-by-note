import { describe, expect, it } from 'vitest'
import type { Hand, ScoreNote } from '../judge/types'
import { SCALE_LEVELS } from './technique'
import { analyzeTouch, isCrossing, touchLine, type Touch } from './touch'

const BEAT_MS = 500

function line(pitches: number[], fingers: number[], hand: Hand = 'R'): ScoreNote[] {
  return pitches.map((pitch, index) => ({ id: `n${index}`, pitch, beat: index, duration: 1, hand, measure: Math.floor(index / 4) + 1, finger: fingers[index] }))
}

function play(notes: ScoreNote[], shape: (note: ScoreNote, index: number) => Partial<Touch> = () => ({})): Touch[] {
  return notes.map((note, index) => ({ noteId: note.id, onMs: 1000 + note.beat * BEAT_MS, velocity: 80, offMs: 1000 + note.beat * BEAT_MS + BEAT_MS + 10, ...shape(note, index) }))
}

// C major, right hand, one octave up and down.
const C_UP = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]
const C_FINGERS = [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]

describe('isCrossing', () => {
  it('finds the right-hand thumb turns in C major', () => {
    expect(isCrossing('R', { pitch: 64, finger: 3 }, { pitch: 65, finger: 1 })).toBe(true)
    expect(isCrossing('R', { pitch: 65, finger: 1 }, { pitch: 64, finger: 3 })).toBe(true)
    expect(isCrossing('R', { pitch: 60, finger: 1 }, { pitch: 62, finger: 2 })).toBe(false)
  })

  it('mirrors for the left hand', () => {
    expect(isCrossing('L', { pitch: 55, finger: 1 }, { pitch: 57, finger: 3 })).toBe(true)
    expect(isCrossing('L', { pitch: 48, finger: 5 }, { pitch: 50, finger: 4 })).toBe(false)
  })

  it('ignores steps without fingering or without the thumb', () => {
    expect(isCrossing('R', { pitch: 64 }, { pitch: 65, finger: 1 })).toBe(false)
    expect(isCrossing('R', { pitch: 67, finger: 4 }, { pitch: 69, finger: 2 })).toBe(false)
  })
})

describe('analyzeTouch', () => {
  it('a steady, level, joined scale has nothing to fix', () => {
    const notes = line(C_UP, C_FINGERS)
    const report = analyzeTouch(notes, play(notes, (_, index) => ({ velocity: 78 + (index % 3) })))
    expect(report.unevenPct).toBeCloseTo(0, 5)
    expect(report.crossings?.count).toBe(2)
    expect(Math.abs(report.crossings?.extraMs ?? 99)).toBeLessThan(1)
    expect(report.detached).toBe(0)
    expect(report.tips).toEqual([])
  })

  it('measures evenness against the player\'s own pulse, not the metronome', () => {
    const notes = line(C_UP, C_FINGERS)
    const slow = notes.map((note) => ({ noteId: note.id, onMs: note.beat * 700, velocity: 80 + (note.beat % 2) }))
    expect(analyzeTouch(notes, slow).unevenPct).toBeCloseTo(0, 5)
  })

  it('catches a late thumb turn and names it', () => {
    const notes = line(C_UP, C_FINGERS)
    // F4 going up arrives 90 ms late; everything after keeps the beat.
    const report = analyzeTouch(notes, play(notes, (note, index) => ({ onMs: 1000 + note.beat * BEAT_MS + (index === 3 || index === 12 ? 90 : 0), velocity: 80 + (index % 2) })))
    expect(report.crossings?.worst).toBe('E4→F4')
    expect(report.crossings?.extraMs ?? 0).toBeGreaterThan(25)
    expect(report.tips[0]).toContain('穿指')
  })

  it('finds a weak finger', () => {
    const pitches = [60, 62, 64, 65, 67, 60, 62, 64, 65, 67, 60, 62, 64, 65, 67]
    const fingers = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
    const notes = line(pitches, fingers)
    const report = analyzeTouch(notes, play(notes, (note) => ({ velocity: note.finger === 4 ? 50 : 82 })))
    expect(report.weakFinger?.finger).toBe(4)
    expect(report.tips.some((tip) => tip.includes('4 指偏轻'))).toBe(true)
  })

  it('reports detached legato', () => {
    const notes = line(C_UP, C_FINGERS)
    const report = analyzeTouch(notes, play(notes, (note, index) => ({ offMs: 1000 + note.beat * BEAT_MS + 200, velocity: 80 + (index % 2) })))
    expect(report.detached).toBe(report.joins)
    expect(report.tips.some((tip) => tip.includes('连奏'))).toBe(true)
  })

  it('says there is no velocity when every press is the same', () => {
    const notes = line(C_UP, C_FINGERS)
    const report = analyzeTouch(notes, play(notes, () => ({ velocity: 96 })))
    expect(report.hasVelocity).toBe(false)
    expect(report.weakFinger).toBeNull()
    expect(touchLine(report)).toContain('没有力度数据')
  })

  it('leaves chords out of the neighbour steps', () => {
    const notes: ScoreNote[] = [
      { id: 'a', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1 },
      { id: 'b', pitch: 64, beat: 0, duration: 1, hand: 'R', measure: 1 },
      { id: 'c', pitch: 62, beat: 1, duration: 1, hand: 'R', measure: 1 },
    ]
    expect(analyzeTouch(notes, play(notes)).intervals).toBe(0)
  })

  it('reads the fingering the scale generator prints', () => {
    const scale = SCALE_LEVELS[0]?.items[0]
    expect(scale?.notes.slice(0, 8).map((note) => note.finger)).toEqual([1, 2, 3, 1, 2, 3, 4, 5])
  })
})
