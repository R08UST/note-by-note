import type { ScoreNote } from '../judge/types'
import type { RunSummary } from '../report/summary'

export interface MeasureRange {
  start: number
  end: number
}

export function clampRange(start: number, end: number, lastMeasure: number): MeasureRange {
  const last = Math.max(1, lastMeasure)
  const low = Math.min(Math.max(1, start), Math.max(1, end))
  const high = Math.max(low, Math.min(last, Math.max(start, end)))
  return { start: low, end: high }
}

export function notesInRange(notes: readonly ScoreNote[], range: MeasureRange): ScoreNote[] {
  return notes.filter((note) => note.measure >= range.start && note.measure <= range.end)
}

/** Downbeat of the first selected measure, in quarter-note beats. */
export function rangeOriginBeat(notes: readonly ScoreNote[], range: MeasureRange, beatsPerMeasure: number): number {
  const inStart = notes.filter((note) => note.measure === range.start)
  if (inStart.length > 0) return Math.min(...inStart.map((note) => note.beat))
  return (range.start - 1) * beatsPerMeasure
}

export interface BeatSpan {
  startBeat: number
  endBeat: number
}

/** Notes whose onset is inside the span, inclusive. A chord shares one beat. */
export function notesInBeats(notes: readonly ScoreNote[], span: BeatSpan): ScoreNote[] {
  const low = Math.min(span.startBeat, span.endBeat)
  const high = Math.max(span.startBeat, span.endBeat)
  return notes.filter((note) => note.beat >= low - 1e-3 && note.beat <= high + 1e-3)
}

/**
 * Where a mid-measure entry sits in the bar.
 * Count-in is still one full bar; playback time 0 is this downbeat, so the note
 * sounds `offset` quarter-beats later, on its written beat.
 */
export function entryClock(startBeat: number, beatsPerMeasure: number): { downbeat: number; offset: number } {
  const per = Math.max(1, beatsPerMeasure)
  const within = ((startBeat % per) + per) % per
  const offset = within < 0.02 ? 0 : within
  return { downbeat: startBeat - offset, offset }
}

export interface Onset {
  beat: number
  measure: number
  ids: string[]
}

/** One step per sounding time. Both hands at that time are the same step. */
export function onsets(notes: readonly ScoreNote[]): Onset[] {
  const sorted = [...notes].sort((a, b) => a.beat - b.beat || a.pitch - b.pitch || a.id.localeCompare(b.id))
  const groups: Onset[] = []
  for (const note of sorted) {
    const last = groups[groups.length - 1]
    if (!last || Math.abs(last.beat - note.beat) > 1e-3) {
      groups.push({ beat: note.beat, measure: note.measure, ids: [note.id] })
    } else {
      last.ids.push(note.id)
    }
  }
  return groups
}

export function neighborOnset(groups: readonly Onset[], beat: number, direction: -1 | 1): Onset | undefined {
  if (groups.length === 0) return undefined
  let index = 0
  for (let i = 0; i < groups.length; i += 1) {
    if (groups[i].beat <= beat + 1e-3) index = i
  }
  return groups[index + direction]
}

export function firstOnsetInMeasure(groups: readonly Onset[], measure: number): Onset | undefined {
  return groups.find((group) => group.measure === measure)
}

export function lastOnsetInMeasure(groups: readonly Onset[], measure: number): Onset | undefined {
  let found: Onset | undefined
  for (const group of groups) if (group.measure === measure) found = group
  return found
}

/** Copy notes so the range begins at beat 0. Ids stay the same. */
export function shiftNotes(notes: readonly ScoreNote[], originBeat: number): ScoreNote[] {
  return notes.map((note) => ({ ...note, beat: note.beat - originBeat }))
}

export function neighborMeasure(current: number, direction: -1 | 1, range: MeasureRange): number {
  return Math.min(range.end, Math.max(range.start, current + direction))
}

/** One summary for a whole loop session. Only the passes that were played are included. */
export function aggregatePasses(passes: readonly RunSummary[]): RunSummary | null {
  if (passes.length === 0) return null
  const sum = (pick: (pass: RunSummary) => number) => passes.reduce((total, pass) => total + pick(pass), 0)
  const timed = passes.filter((pass) => pass.meanOffsetMs != null && pass.timedHits > 0)
  const timedWeight = timed.reduce((total, pass) => total + pass.timedHits, 0)
  const mean =
    timedWeight === 0
      ? null
      : timed.reduce((total, pass) => total + (pass.meanOffsetMs ?? 0) * pass.timedHits, 0) / timedWeight
  const measures = new Map<number, { expected: number; errors: number }>()
  for (const pass of passes) {
    for (const row of pass.errorsPerMeasure) {
      const current = measures.get(row.measure) ?? { expected: 0, errors: 0 }
      current.expected += row.expected
      current.errors += row.errors
      measures.set(row.measure, current)
    }
  }
  const expected = sum((pass) => pass.expected)
  const hits = sum((pass) => pass.hits)
  return {
    expected,
    judged: sum((pass) => pass.judged),
    hits,
    wrongs: sum((pass) => pass.wrongs),
    misses: sum((pass) => pass.misses),
    extras: sum((pass) => pass.extras),
    unplayed: passes[passes.length - 1]?.unplayed ?? 0,
    untiedWrongs: sum((pass) => pass.untiedWrongs),
    hitRate: expected === 0 ? 0 : hits / expected,
    meanOffsetMs: mean,
    timingSpreadMs: null,
    perfects: sum((pass) => pass.perfects),
    timedHits: sum((pass) => pass.timedHits),
    errorsPerMeasure: [...measures.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([measure, row]) => ({ measure, expected: row.expected, errors: row.errors })),
  }
}
