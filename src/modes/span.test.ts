import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { summarize } from '../report/summary'
import { WaitMode } from './waitMode'
import { aggregatePasses, entryClock, firstOnsetInMeasure, neighborOnset, notesInBeats, notesInRange, onsets, rangeOriginBeat, shiftNotes } from './span'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch' | 'beat' | 'measure'>): ScoreNote {
  return { duration: 1, hand: 'R', ...partial }
}

describe('practice range', () => {
  const notes = [
    note({ id: 'a', pitch: 60, beat: 0, measure: 1 }),
    note({ id: 'b', pitch: 62, beat: 4, measure: 2 }),
    note({ id: 'c', pitch: 64, beat: 8, measure: 3 }),
  ]

  it('keeps only the chosen measures and restarts their clock at beat 0', () => {
    const span = notesInRange(notes, { start: 2, end: 3 })
    expect(span.map((item) => item.id)).toEqual(['b', 'c'])
    const origin = rangeOriginBeat(notes, { start: 2, end: 3 }, 4)
    expect(origin).toBe(4)
    const shifted = shiftNotes(span, origin)
    expect(shifted.map((item) => item.beat)).toEqual([0, 4])
    const report = summarize(shifted, [])
    expect(report.expected).toBe(2)
    expect(report.errorsPerMeasure.map((row) => row.measure)).toEqual([2, 3])
  })

  it('steps back in wait mode and drops the hit that was undone', () => {
    const mode = new WaitMode(notes)
    mode.push({ pitch: 60, velocity: 90, timeMs: 0, type: 'on' })
    expect(mode.cursorBeat()).toBe(4)
    mode.retreat()
    expect(mode.cursorBeat()).toBe(0)
    expect(mode.judgements.filter((item) => item.result === 'hit')).toHaveLength(0)
    expect(mode.push({ pitch: 60, velocity: 90, timeMs: 0, type: 'on' })[0]?.result).toBe('hit')
    mode.advance()
    expect(mode.cursorBeat()).toBe(8)
    expect(mode.judgements.filter((item) => item.noteId === 'b')).toHaveLength(0)
  })

  it('seeks to one note and judges only the notes from that onset through the end note', () => {
    const line = [
      note({ id: 'a', pitch: 60, beat: 4, measure: 2 }),
      note({ id: 'b', pitch: 62, beat: 5, measure: 2 }),
      note({ id: 'chord-r', pitch: 64, beat: 6, measure: 2, hand: 'R' }),
      note({ id: 'chord-l', pitch: 48, beat: 6, measure: 2, hand: 'L' }),
      note({ id: 'c', pitch: 65, beat: 8, measure: 3 }),
      note({ id: 'd', pitch: 67, beat: 9, measure: 3 }),
    ]
    const steps = onsets(line)
    expect(steps.find((step) => step.beat === 6)?.ids.sort()).toEqual(['chord-l', 'chord-r'])
    expect(steps.map((step) => step.beat)).toEqual([4, 5, 6, 8, 9])
    expect(neighborOnset(steps, 6, 1)?.ids).toEqual(['c'])
    expect(neighborOnset(steps, 6, -1)?.ids).toEqual(['b'])
    expect(firstOnsetInMeasure(steps, 3)?.beat).toBe(8)
    const selected = notesInBeats(line.filter((item) => item.hand === 'R'), { startBeat: 6, endBeat: 8 })
    expect(selected.map((item) => item.id)).toEqual(['chord-r', 'c'])
    const clock = entryClock(6, 4)
    expect(clock).toEqual({ downbeat: 4, offset: 2 })
    const shifted = shiftNotes(selected, clock.downbeat)
    expect(shifted.map((item) => item.beat)).toEqual([2, 4])
    const report = summarize(shifted, [{ noteId: 'chord-r', pitch: 64, result: 'hit', offsetMs: 12 }])
    expect(report.expected).toBe(2)
    expect(report.hits).toBe(1)
    expect(report.errorsPerMeasure.map((row) => row.measure)).toEqual([2, 3])
  })

  it('adds loop passes without counting bars that were not in the range', () => {
    const one = summarize(shiftNotes(notesInRange(notes, { start: 2, end: 2 }), 4), [
      { noteId: 'b', pitch: 62, result: 'hit', offsetMs: 10 },
    ])
    const two = summarize(shiftNotes(notesInRange(notes, { start: 2, end: 2 }), 4), [
      { noteId: 'b', pitch: 62, result: 'miss' },
    ])
    const all = aggregatePasses([one, two])
    expect(all?.expected).toBe(2)
    expect(all?.hits).toBe(1)
    expect(all?.errorsPerMeasure).toEqual([{ measure: 2, expected: 2, errors: 1 }])
  })
})
