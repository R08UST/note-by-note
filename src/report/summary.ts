import { isOnTime } from '../judge/judge'
import { BEGINNER_TOLERANCE, type Judgement, type ScoreNote } from '../judge/types'
import type { FreeTempoReport } from './freeTempo'

export interface MeasureReport {
  measure: number
  expected: number
  errors: number
  /** Written notes in the bar that were hit, missed, or played wrong. Absent on runs saved before it existed. */
  played?: number
}

export type MeasureTone = 'unplayed' | 'clean' | 'some' | 'many'

/**
 * How a bar went. A bar the player never reached is 'unplayed', not clean:
 * a run stopped in bar 1 must not paint bars 2 to 11 green.
 */
export function measureTone(report: MeasureReport, stalls = 0): MeasureTone {
  const reached = report.played === undefined || report.played > 0 || report.errors > 0 || stalls > 0
  if (!reached) return 'unplayed'
  if (report.expected <= 0 || report.errors <= 0) return stalls > 0 ? 'some' : 'clean'
  return report.errors / report.expected < 0.34 ? 'some' : 'many'
}

/** How far a run got: bars reached out of all bars, and the last bar reached. */
export function measureReach(reports: readonly MeasureReport[]): { reached: number; total: number; last: number | null } {
  const reachedBars = reports.filter((report) => measureTone(report) !== 'unplayed')
  return { reached: reachedBars.length, total: reports.length, last: reachedBars.at(-1)?.measure ?? null }
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
    const inBar = required.filter((note) => note.measure === measure)
    const errors = judgements.filter((item) => {
      if (item.result !== 'wrong' && item.result !== 'miss') return false
      const at = item.measure ?? (item.noteId ? byId.get(item.noteId)?.measure : undefined)
      return at === measure
    }).length
    const played = inBar.filter((note) => judgedIds.has(note.id)).length
    return { measure, expected: inBar.length, errors, played }
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
