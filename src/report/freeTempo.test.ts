import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { analyzeFreeTempo, estimateRecentBpm } from './freeTempo'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch' | 'beat'>): ScoreNote {
  return { duration: 1, hand: 'R', measure: Math.floor(partial.beat / 4) + 1, ...partial }
}

describe('analyzeFreeTempo', () => {
  it('returns null metrics when fewer than four onsets were played', () => {
    const notes = [
      note({ id: 'a', pitch: 60, beat: 0 }),
      note({ id: 'b', pitch: 62, beat: 1 }),
      note({ id: 'c', pitch: 64, beat: 2 }),
    ]
    const hits = new Map([
      ['a', 0],
      ['b', 600],
      ['c', 1200],
    ])
    const report = analyzeFreeTempo(notes, hits)
    expect(report.bpm).toBeNull()
    expect(report.fluency).toBeNull()
    expect(report.stability).toBeNull()
    expect(report.intervals).toBe(2)
  })

  it('automatically infers self-paced BPM and scores steady playing at 100% fluency and stability', () => {
    // 80 BPM -> 750 ms per quarter note, mixing quarter, eighth, and half-note intervals.
    const beats = [0, 1, 1.5, 2, 4, 5, 5.5, 6, 8]
    const notes = beats.map((beat, i) => note({ id: `n${i}`, pitch: 60 + i, beat }))
    const hits = new Map(notes.map((n) => [n.id, 1000 + n.beat * 750]))

    const report = analyzeFreeTempo(notes, hits)
    expect(report.bpm).toBe(80)
    expect(report.fluency).toBe(1)
    expect(report.stability).toBe(1)
    expect(report.unevenPct).toBe(0)
    expect(report.stalls).toBe(0)
    expect(report.stallMeasures).toEqual([])
    expect(report.longestFlowBeats).toBe(8)
    expect(estimateRecentBpm(notes, hits)).toBe(80)
  })

  it('isolates hesitation stalls without letting them drag down inferred BPM or smooth stability', () => {
    // Steady 100 BPM (600 ms/beat) with one 2.4-second pause before measure 2 (beat 4).
    const notes = Array.from({ length: 9 }, (_, i) => note({ id: `n${i}`, pitch: 60 + i, beat: i }))
    const hits = new Map<string, number>()
    let t = 0
    for (let i = 0; i < notes.length; i += 1) {
      if (i > 0) t += i === 4 ? 2400 : 600
      hits.set(notes[i].id, t)
    }

    const report = analyzeFreeTempo(notes, hits)
    expect(report.bpm).toBe(100)
    expect(report.stalls).toBe(1)
    expect(report.stallMeasures).toEqual([2])
    expect(report.fluency).toBeCloseTo(7 / 8)
    // All non-stalled transitions are dead steady, so smooth rhythm stability stays high.
    expect(report.stability).toBeGreaterThan(0.95)
    expect(report.longestFlowBeats).toBe(4)
  })

  it('tracks gradual tempo drift and rubato without falsely penalizing local stability', () => {
    // Gradually speeds up from 70 BPM (857 ms/beat) to 95 BPM (632 ms/beat) over 12 beats.
    const notes = Array.from({ length: 13 }, (_, i) => note({ id: `n${i}`, pitch: 60 + (i % 8), beat: i }))
    const hits = new Map<string, number>()
    let t = 0
    for (let i = 0; i < notes.length; i += 1) {
      if (i > 0) {
        const bpm = 70 + ((95 - 70) * (i - 1)) / 11
        t += 60_000 / bpm
      }
      hits.set(notes[i].id, t)
    }

    const report = analyzeFreeTempo(notes, hits)
    expect(report.stalls).toBe(0)
    expect(report.fluency).toBe(1)
    expect(report.driftBpm).not.toBeNull()
    expect(report.driftBpm!).toBeGreaterThan(10)
    // Gradual phrasing stays locally smooth.
    expect(report.stability!).toBeGreaterThan(0.85)
  })

  it('penalizes erratic local rhythm jitter even when there are no major stalls', () => {
    // Alternates fast (450 ms) and slow (750 ms) quarter notes around ~100 BPM.
    const notes = Array.from({ length: 9 }, (_, i) => note({ id: `n${i}`, pitch: 60 + i, beat: i }))
    const hits = new Map<string, number>()
    let t = 0
    for (let i = 0; i < notes.length; i += 1) {
      if (i > 0) t += i % 2 === 1 ? 450 : 750
      hits.set(notes[i].id, t)
    }

    const report = analyzeFreeTempo(notes, hits)
    expect(report.stalls).toBe(0)
    expect(report.fluency).toBe(1)
    expect(report.unevenPct!).toBeGreaterThan(15)
    expect(report.stability!).toBeLessThan(0.75)
  })

  it('collapses rolled chords into one onset and ignores fermata pauses', () => {
    const notes = [
      note({ id: 'c0a', pitch: 60, beat: 0 }),
      note({ id: 'c0b', pitch: 64, beat: 0 }),
      note({ id: 'n1', pitch: 65, beat: 1 }),
      note({ id: 'n2', pitch: 67, beat: 2, fermata: true }),
      note({ id: 'n3', pitch: 69, beat: 3 }),
      note({ id: 'n4', pitch: 71, beat: 4 }),
      note({ id: 'n5', pitch: 72, beat: 5 }),
    ]
    // 100 BPM (600 ms/beat), chord rolled by 30 ms, and a 2-second fermata hold after beat 2.
    const hits = new Map([
      ['c0a', 0],
      ['c0b', 30],
      ['n1', 615],
      ['n2', 1215],
      ['n3', 3215],
      ['n4', 3815],
      ['n5', 4415],
    ])

    const report = analyzeFreeTempo(notes, hits)
    expect(report.bpm).toBe(100)
    expect(report.stalls).toBe(0)
    expect(report.fluency).toBe(1)
    expect(report.stability).toBe(1)
  })
})
