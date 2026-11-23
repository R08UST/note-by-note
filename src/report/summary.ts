import { isOnTime } from '../judge/judge'
import { BEGINNER_TOLERANCE, type Judgement, type ScoreNote } from '../judge/types'
import type { FreeTempoReport } from './freeTempo'

export interface MeasureReport {
  measure: number
  expected: number
  errors: number
}

export interface RunSummary {
  expected: number
  judged: number
  hits: number
  wrongs: number
  misses: number
  extras: number
  /** Written notes that never received a hit, wrong, or miss (stopped early, or still waiting). */
  unplayed: number
  /** Wrongs that did not consume a written note (wait mode). */
  untiedWrongs: number
  /** Hits divided by every judged key: hits, wrong keys, and misses. */
  hitRate: number
  meanOffsetMs: number | null
  /** Sample standard deviation of hit offsets. Null when timing was not scored. */
  timingSpreadMs: number | null
  perfects: number
  timedHits: number
  errorsPerMeasure: MeasureReport[]
  /** Present on free-tempo runs: inferred self-paced BPM, fluency, and rhythm stability. */
  freeTempo?: FreeTempoReport
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleSpread(values: number[]): number | null {
  if (values.length === 0) return null
  if (values.length === 1) return 0
  const center = mean(values) ?? 0
  const variance = values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function summarize(
  notes: ScoreNote[],
  judgements: readonly Judgement[],
  perfectMs: number = BEGINNER_TOLERANCE.perfectMs,
): RunSummary {
  // A strike a printed mark adds is optional: it is never a miss, and counting it
  // in `expected` would make the hit rate fall when the player simply reads the
  // sheet without the ornament.
  const required = notes.filter((note) => !note.optional)
  const byId = new Map(notes.map((note) => [note.id, note]))
  const hits = judgements.filter((item) => item.result === 'hit')
  const wrongs = judgements.filter((item) => item.result === 'wrong')
  const misses = judgements.filter((item) => item.result === 'miss')
  const extras = judgements.filter((item) => item.result === 'extra')
  const judgedIds = new Set<string>()
  for (const item of judgements) {
    if (item.noteId && item.result !== 'extra') judgedIds.add(item.noteId)
  }
  const offsets = hits
    .map((item) => item.offsetMs)
    .filter((offset): offset is number => typeof offset === 'number')

  const measures = [...new Set(notes.map((note) => note.measure))].sort((a, b) => a - b)
  const errorsPerMeasure = measures.map((measure) => {
    const expected = required.filter((note) => note.measure === measure).length
    const errors = judgements.filter((item) => {
      if (item.result !== 'wrong' && item.result !== 'miss') return false
      const at = item.measure ?? (item.noteId ? byId.get(item.noteId)?.measure : undefined)
      return at === measure
    }).length
    return { measure, expected, errors }
  })

  // Every wrong key counts against the rate. A wait-mode wrong takes no written
  // note, and a rhythm-mode slip can be followed by the right key, so dividing by
  // notes alone would score a run full of wrong keys as perfect.
  const attempts = hits.length + wrongs.length + misses.length
  return {
    expected: required.length,
    judged: judgedIds.size,
    hits: hits.length,
    wrongs: wrongs.length,
    misses: misses.length,
    extras: extras.length,
    unplayed: required.filter((note) => !judgedIds.has(note.id)).length,
    untiedWrongs: wrongs.filter((item) => !item.noteId).length,
    hitRate: attempts === 0 ? 0 : hits.length / attempts,
    meanOffsetMs: mean(offsets),
    timingSpreadMs: sampleSpread(offsets),
    perfects: offsets.filter((offset) => isOnTime(offset, perfectMs)).length,
    timedHits: offsets.length,
    errorsPerMeasure,
  }
}
