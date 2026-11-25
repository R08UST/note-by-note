import { describe, expect, it } from 'vitest'
import type { Judgement, ScoreNote } from '../judge/types'
import { analyzeFreeTempo } from './freeTempo'
import { summarize } from './summary'
import { findWeakSpots, improvedMeasures, troubleSpots, weakHistory, weakSpotAdvice } from './weakSpots'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch' | 'beat'>): ScoreNote {
  return { duration: 1, hand: 'R', measure: Math.floor(partial.beat / 4) + 1, localBeat: partial.beat % 4, ...partial }
}

describe('findWeakSpots', () => {
  it('names where a free-tempo stall happened, which measure slows down, and ranks them with wrong notes', () => {
    // 100 BPM quarters over four 4/4 measures. Measure 2 stalls 2 s before its 3rd beat (left hand);
    // measure 3 is played 40% slower throughout; measure 1 has one wrong key.
    const notes = Array.from({ length: 16 }, (_, i) =>
      note({ id: `n${i}`, pitch: 60 + (i % 8), beat: i, hand: i === 6 ? 'L' : 'R' }),
    )
    const hits = new Map<string, number>()
    let t = 0
    for (let i = 0; i < notes.length; i += 1) {
      if (i > 0) t += i === 6 ? 2600 : i >= 9 && i <= 11 ? 1000 : 600
      hits.set(notes[i].id, t)
    }
    const judgements: Judgement[] = [
      ...notes.map((n): Judgement => ({ noteId: n.id, pitch: n.pitch, result: 'hit' })),
      { pitch: 70, result: 'wrong', measure: 1 },
    ]
    const summary = { ...summarize(notes, judgements), freeTempo: analyzeFreeTempo(notes, hits) }
    const spots = findWeakSpots(summary)
    expect(spots.map((s) => s.measure)).toEqual([2, 3, 1])
    expect(spots[0]).toMatchObject({ kind: 'stall', hand: 'L' })
    expect(spots[0].reasons[0]).toBe('第 3 拍前（左手）停了 2.0 秒')
    expect(spots[1].kind).toBe('slow')
    expect(spots[2].reasons[0]).toBe('右手错 1 个音')
    expect(weakSpotAdvice(summary, spots)[0]).toContain('卡顿')
  })

  it('splits errors by hand and flags rhythm-mode notes that miss the beat', () => {
    const notes = [
      note({ id: 'r1', pitch: 72, beat: 0 }),
      note({ id: 'l1', pitch: 48, beat: 0, hand: 'L' }),
      note({ id: 'r2', pitch: 74, beat: 1 }),
      note({ id: 'l2', pitch: 50, beat: 1, hand: 'L' }),
      note({ id: 'r3', pitch: 76, beat: 4 }),
      note({ id: 'r4', pitch: 77, beat: 5 }),
      note({ id: 'r5', pitch: 79, beat: 6 }),
    ]
    const judgements: Judgement[] = [
      { noteId: 'r1', pitch: 72, result: 'hit', offsetMs: 5 },
      { noteId: 'l1', pitch: 48, result: 'miss' },
      { pitch: 47, result: 'wrong', measure: 1 },
      { noteId: 'r2', pitch: 74, result: 'hit', offsetMs: 0 },
      { noteId: 'l2', pitch: 50, result: 'miss' },
      { noteId: 'r3', pitch: 76, result: 'hit', offsetMs: 140 },
      { noteId: 'r4', pitch: 77, result: 'hit', offsetMs: 120 },
      { noteId: 'r5', pitch: 79, result: 'hit', offsetMs: 160 },
    ]
    const summary = summarize(notes, judgements)
    const spots = findWeakSpots(summary)
    expect(spots[0]).toMatchObject({ measure: 1, kind: 'wrong', hand: 'L', reasons: ['左手错 3 个音'] })
    expect(spots[1]).toMatchObject({ measure: 2, kind: 'timing' })
    expect(spots[1].reasons[0]).toBe('3 个音没踩准拍，平均偏晚 140 ms')
  })

  it('finds wait-mode hesitations from real key times', () => {
    const notes = Array.from({ length: 8 }, (_, i) => note({ id: `n${i}`, pitch: 60 + i, beat: i }))
    const hits = new Map(notes.map((n, i) => [n.id, i * 700 + (i >= 5 ? 3000 : 0)]))
    const judgements = notes.map((n): Judgement => ({ noteId: n.id, pitch: n.pitch, result: 'hit' }))
    const summary = { ...summarize(notes, judgements), flow: analyzeFreeTempo(notes, hits) }
    const spots = findWeakSpots(summary)
    expect(spots).toHaveLength(1)
    expect(spots[0]).toMatchObject({ measure: 2, kind: 'stall' })
    expect(weakSpotAdvice(summary, spots)[0]).toContain('读谱')
  })
})

describe('weak spot history', () => {
  const run = (weak: number[]) => ({ weakMeasures: weak, measures: { start: 1, end: 8 } })

  it('counts how often each measure came back across recent runs', () => {
    const history = weakHistory([run([3, 5]), run([3]), run([3, 6]), { weakMeasures: [], measures: { start: 5, end: 8 } }])
    expect(history.get(3)).toEqual({ flagged: 3, played: 3 })
    expect(history.get(5)).toEqual({ flagged: 1, played: 4 })
  })

  it('lists measures that were often weak before and are clean now', () => {
    expect(improvedMeasures([run([5]), run([3, 5]), run([3]), run([6])])).toEqual([3])
  })
})

describe('troubleSpots', () => {
  const run = (weak: number[]) => ({ weakMeasures: weak, measures: { start: 1, end: 8 } })

  it('ranks measures that keep coming back and drops one-off slips once there are enough runs', () => {
    const spots = troubleSpots([run([3, 7]), run([3, 5]), run([3, 5]), run([1])])
    expect(spots.map((s) => [s.measure, s.flagged])).toEqual([
      [3, 3],
      [5, 2],
    ])
  })

  it('uses a single saved run when that is all there is', () => {
    expect(troubleSpots([run([4, 2])]).map((s) => s.measure)).toEqual([2, 4])
    expect(troubleSpots([])).toEqual([])
  })
})
