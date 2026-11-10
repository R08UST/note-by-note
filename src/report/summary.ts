import { isOnTime } from '../judge/judge'
import { BEGINNER_TOLERANCE, type Judgement, type ScoreNote } from '../judge/types'

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
  /** Hits divided by notes that were actually judged. */
  hitRate: number
  meanOffsetMs: number | null
  /** Sample standard deviation of hit offsets. Null when timing was not scored. */
  timingSpreadMs: number | null
  perfects: number
  timedHits: number
  errorsPerMeasure: MeasureReport[]
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
    const expected = notes.filter((note) => note.measure === measure).length
    const errors = judgements.filter((item) => {
      if (item.result !== 'wrong' && item.result !== 'miss') return false
      if (!item.noteId) return false
      return byId.get(item.noteId)?.measure === measure
    }).length
    return { measure, expected, errors }
  })

  return {
    expected: notes.length,
    judged: judgedIds.size,
    hits: hits.length,
    wrongs: wrongs.length,
    misses: misses.length,
    extras: extras.length,
    unplayed: notes.filter((note) => !judgedIds.has(note.id)).length,
    untiedWrongs: wrongs.filter((item) => !item.noteId).length,
    hitRate: judgedIds.size === 0 ? 0 : hits.length / judgedIds.size,
    meanOffsetMs: mean(offsets),
    timingSpreadMs: sampleSpread(offsets),
    perfects: offsets.filter((offset) => isOnTime(offset, perfectMs)).length,
    timedHits: offsets.length,
    errorsPerMeasure,
  }
}
