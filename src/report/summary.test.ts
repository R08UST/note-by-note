import { describe, expect, it } from 'vitest'
import type { Judgement, ScoreNote } from '../judge/types'
import { summarize } from './summary'

const notes: ScoreNote[] = [
  { id: 'a', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1 },
  { id: 'b', pitch: 62, beat: 1, duration: 1, hand: 'R', measure: 1 },
  { id: 'c', pitch: 64, beat: 4, duration: 1, hand: 'L', measure: 2 },
  { id: 'd', pitch: 65, beat: 5, duration: 1, hand: 'L', measure: 2 },
]

const judgements: Judgement[] = [
  { noteId: 'a', pitch: 60, result: 'hit', offsetMs: -20 },
  { noteId: 'b', pitch: 62, result: 'hit', offsetMs: 40 },
  { noteId: 'c', pitch: 64, result: 'miss' },
  { noteId: 'd', pitch: 61, result: 'wrong', offsetMs: 15 },
  { pitch: 72, result: 'extra' },
]

describe('summarize', () => {
  it('computes hit rate, mean offset, spread, and errors per measure', () => {
    const summary = summarize(notes, judgements)
    expect(summary.hits).toBe(2)
    expect(summary.wrongs).toBe(1)
    expect(summary.misses).toBe(1)
    expect(summary.extras).toBe(1)
    expect(summary.judged).toBe(4)
    expect(summary.unplayed).toBe(0)
    expect(summary.hitRate).toBeCloseTo(0.5)
    expect(summary.meanOffsetMs).toBeCloseTo(10)
    expect(summary.timingSpreadMs).toBeCloseTo(Math.sqrt(1800))
    expect(summary.perfects).toBe(2)
    expect(summary.errorsPerMeasure).toEqual([
      { measure: 1, expected: 2, errors: 0 },
      { measure: 2, expected: 2, errors: 2 },
    ])
  })

  it('leaves timing empty when hits have no offset, and ignores unplayed notes', () => {
    const summary = summarize(notes, [{ noteId: 'a', pitch: 60, result: 'hit' }, { pitch: 70, result: 'wrong' }])
    expect(summary.hitRate).toBeCloseTo(1)
    expect(summary.unplayed).toBe(3)
    expect(summary.meanOffsetMs).toBeNull()
    expect(summary.timingSpreadMs).toBeNull()
    expect(summary.untiedWrongs).toBe(1)
    expect(summary.perfects).toBe(0)
  })

  it('returns a zero hit rate when nothing was judged', () => {
    expect(summarize(notes, []).hitRate).toBe(0)
  })
})

describe('summarize with printed marks', () => {
  const base = { duration: 1, hand: 'R' as const, measure: 1 }

  it('keeps the hit rate about the written notes, not the optional strikes', () => {
    const notes = [
      { ...base, id: 'a', pitch: 60, beat: 0 },
      { ...base, id: 'b', pitch: 62, beat: 1 },
      { ...base, id: 'a~m0', pitch: 64, beat: 0, optional: true },
    ]
    const report = summarize(notes, [
      { noteId: 'a', pitch: 60, result: 'hit', offsetMs: 0 },
      { noteId: 'b', pitch: 62, result: 'hit', offsetMs: 0 },
    ])
    expect(report.expected).toBe(2)
    expect(report.hitRate).toBe(1)
    expect(report.unplayed).toBe(0)
  })

  it('counts an optional strike when the player does play it', () => {
    const notes = [
      { ...base, id: 'a', pitch: 60, beat: 0 },
      { ...base, id: 'a~m0', pitch: 64, beat: 0, optional: true },
    ]
    const report = summarize(notes, [
      { noteId: 'a', pitch: 60, result: 'hit', offsetMs: 0 },
      { noteId: 'a~m0', pitch: 64, result: 'hit', offsetMs: 0 },
    ])
    expect(report.hits).toBe(2)
    expect(report.hitRate).toBe(1)
  })
})
