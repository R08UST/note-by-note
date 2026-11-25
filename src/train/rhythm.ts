import type { Judgement, ScoreNote } from '../judge/types'
import { Judge, isOnTime } from '../judge/judge'
import { summarize, type RunSummary } from '../report/summary'
import type { TimeSignature } from '../score/parseMusicXml'
import { RHYTHM_LEVELS, rhythmLevel } from './curriculum'
import { generateRhythmLine, type BuiltExercise } from './generate'
import { materialize, TICKS, type WrittenNote, type WrittenScore } from './musicXml'
import { timingForExercise } from './timing'
import { mulberry32, pickOne } from './rng'

export { RHYTHM_LEVELS, rhythmLevel, isOnTime }

export function generateRhythm(levelId: number, seed: number, bars = 4): BuiltExercise {
  return generateRhythmLine(levelId, seed, bars)
}

export interface RhythmBuild {
  title: string
  xml: string
  notes: ScoreNote[]
  time: TimeSignature
  level: number
}

function finish(title: string, time: TimeSignature, notes: WrittenNote[]): RhythmBuild {
  const score: WrittenScore = {
    title,
    fifths: 0,
    time,
    staves: notes.some((note) => note.hand === 'L') ? 2 : 1,
    clef: notes.some((note) => note.hand === 'L') ? 'grand' : 'treble',
    notes,
  }
  const built = materialize(score)
  return { title, xml: built.xml, notes: built.notes, time, level: 0 }
}

/** Harris: pulse in one hand, the rhythm in the other. */
export function generateHandsRhythm(seed: number, bars = 2): RhythmBuild {
  const rng = mulberry32(seed)
  const notes: WrittenNote[] = []
  for (let measure = 1; measure <= bars; measure += 1) {
    const right = pickOne(rng, [
      [6, 6, 6, 6, 6, 6, 6, 6],
      [6, 6, 12, 6, 6, 12],
      [12, 6, 6, 12, 6, 6],
    ])
    for (const ticks of right) notes.push({ pitch: 72, ticks, hand: 'R', measure })
    const left = pickOne(rng, [
      [12, 12, 12, 12],
      [24, 24],
      [12, 12, 24],
    ])
    for (const ticks of left) notes.push({ pitch: 48, ticks, hand: 'L', measure })
  }
  return finish('双手节奏', { beats: 4, beatType: 4 }, notes)
}

/** RCM: the left hand keeps the beat while the right hand plays the rhythm. */
export function generatePulseAndRhythm(levelId: number, seed: number): RhythmBuild {
  const line = generateRhythmLine(levelId, seed, 2)
  const beat = 12
  const perBar = Math.round(line.time.beats * (4 / line.time.beatType) * beat)
  const notes: WrittenNote[] = line.notes.map((note) => ({
    pitch: note.pitch,
    ticks: Math.round(note.duration * TICKS),
    hand: 'R' as const,
    measure: note.measure,
  }))
  const measures = new Set(notes.map((note) => note.measure))
  for (const measure of measures) {
    for (let tick = 0; tick < perBar; tick += beat) notes.push({ pitch: 48, ticks: beat, hand: 'L', measure })
  }
  return finish('拍加节奏', line.time, notes)
}

export function generatePulse(subdivision: 'quarter' | 'eighth', bars = 4): RhythmBuild {
  const ticks = subdivision === 'quarter' ? 12 : 6
  const notes: WrittenNote[] = []
  for (let measure = 1; measure <= bars; measure += 1) {
    for (let used = 0; used < 48; used += ticks) notes.push({ pitch: 71, ticks, hand: 'R', measure })
  }
  return finish(subdivision === 'quarter' ? '跟拍 四分' : '跟拍 八分', { beats: 4, beatType: 4 }, notes)
}

export interface PieceRhythmSource {
  notes: readonly ScoreNote[]
  measures: readonly number[]
  time: TimeSignature
}

export function rhythmFromPiece(source: PieceRhythmSource): RhythmBuild {
  const bar = Math.round(source.time.beats * (4 / source.time.beatType) * TICKS)
  const measures = [...new Set(source.measures)].sort((a, b) => a - b)
  const written: WrittenNote[] = []
  measures.forEach((measure, index) => {
    const inMeasure = source.notes.filter((note) => note.measure === measure)
    if (inMeasure.length === 0) return
    const origin = Math.min(...inMeasure.map((note) => note.beat))
    const onsets = [...new Set(inMeasure.map((note) => Math.round((note.beat - origin) * TICKS)))].sort((a, b) => a - b)
    let cursor = 0
    onsets.forEach((start, onsetIndex) => {
      const next = onsets[onsetIndex + 1] ?? bar
      const sounding = inMeasure.filter((note) => Math.round((note.beat - origin) * TICKS) === start)
      const writtenTicks = Math.max(...sounding.map((note) => Math.round(note.duration * TICKS)))
      const ticks = Math.max(3, Math.min(writtenTicks, Math.max(3, next - start)))
      if (start > cursor) written.push({ pitch: null, ticks: start - cursor, hand: 'R', measure: index + 1 })
      written.push({ pitch: 71, ticks, hand: 'R', measure: index + 1 })
      cursor = start + ticks
    })
    if (cursor < bar) written.push({ pitch: null, ticks: bar - cursor, hand: 'R', measure: index + 1 })
  })
  if (written.length === 0) written.push({ pitch: 71, ticks: bar, hand: 'R', measure: 1 })
  return finish('曲目节奏', source.time, written)
}

export function worstMeasures(rows: readonly { measure: number; errors: number; expected: number }[], limit = 4): number[] {
  return [...rows]
    .filter((row) => row.expected > 0 && row.errors > 0)
    .sort((a, b) => b.errors / b.expected - a.errors / a.expected || b.errors - a.errors)
    .slice(0, limit)
    .map((row) => row.measure)
    .sort((a, b) => a - b)
}

export type RhythmMatch = 'any' | 'chosen' | 'hands'

export function matchRhythmPitch(played: number, upcoming: readonly ScoreNote[], rule: RhythmMatch, chosen?: number): number {
  if (upcoming.length === 0) return played
  if (rule === 'any') return upcoming[0]?.pitch ?? played
  if (rule === 'chosen') return chosen != null && played === chosen ? (upcoming[0]?.pitch ?? played) : played
  const hand = played >= 60 ? 'R' : 'L'
  return upcoming.find((note) => note.hand === hand)?.pitch ?? played
}

export interface PlayedTap {
  pitch: number
  timeMs: number
}

export function scoreRhythm(notes: readonly ScoreNote[], played: readonly PlayedTap[], bpm: number, rule: RhythmMatch, chosen?: number): RunSummary {
  const timing = timingForExercise([...notes], bpm, 1)
  const judge = new Judge([...notes], { bpm, earlyMs: timing.earlyMs, lateMs: timing.lateMs })
  for (const tap of [...played].sort((a, b) => a.timeMs - b.timeMs)) {
    const pitch = matchRhythmPitch(tap.pitch, judge.upcoming(), rule, chosen)
    judge.push({ pitch, velocity: 90, timeMs: tap.timeMs, type: 'on' })
  }
  const end = played.reduce((max, tap) => Math.max(max, tap.timeMs), 0)
  judge.advanceTo(end + timing.lateMs + 1)
  return summarize([...notes], judge.judgements, timing.perfectMs)
}

export function onTimeRate(summary: RunSummary): number {
  if (summary.expected === 0) return 0
  return summary.perfects / summary.expected
}

export function pitchAccuracy(summary: RunSummary): number {
  if (summary.expected === 0) return 0
  return summary.hits / summary.expected
}

export interface MeasureTiming {
  measure: number
  /** Played minus written, in ms, one per note that was hit. */
  offsets: number[]
  missed: number
}

export interface TimingReadout {
  /** A few plain sentences that say what to fix first. */
  lines: string[]
  measures: MeasureTiming[]
  perfectMs: number
}

/** Turns a take into one row of offsets per bar and a short verdict, instead of one line per note. */
export function readTiming(notes: readonly ScoreNote[], judgements: readonly Judgement[], perfectMs: number): TimingReadout {
  const hitOffset = new Map<string, number>()
  for (const item of judgements) {
    if (item.result === 'hit' && item.noteId && item.offsetMs != null) hitOffset.set(item.noteId, item.offsetMs)
  }
  const rows = new Map<number, MeasureTiming>()
  for (const note of notes) {
    if (note.optional) continue
    const row = rows.get(note.measure) ?? { measure: note.measure, offsets: [], missed: 0 }
    rows.set(note.measure, row)
    const offset = hitOffset.get(note.id)
    if (offset == null) row.missed += 1
    else row.offsets.push(offset)
  }
  const measures = [...rows.values()].sort((a, b) => a.measure - b.measure)
  const all = measures.flatMap((row) => row.offsets)
  const missed = measures.reduce((sum, row) => sum + row.missed, 0)
  if (all.length === 0) return { lines: ['一个音都没接上。等预备拍数完，跟着下一声“嗒”进。'], measures, perfectMs }

  const mean = all.reduce((sum, value) => sum + value, 0) / all.length
  const spread = Math.sqrt(all.reduce((sum, value) => sum + (value - mean) ** 2, 0) / all.length)
  const lines: string[] = []
  if (Math.abs(mean) > perfectMs / 2) {
    lines.push(mean > 0 ? `整体偏晚 ${Math.round(mean)} ms，按早一点。` : `整体偏早 ${Math.round(-mean)} ms，等一下再按。`)
  }
  if (spread > perfectMs * 0.6) lines.push(`忽早忽晚（前后差约 ${Math.round(spread)} ms）。放慢速度，先求每一下都一样。`)
  if (lines.length === 0) lines.push('又准又稳。')
  if (missed > 0) lines.push(`漏了 ${missed} 个音。`)
  const off = (row: MeasureTiming) => row.missed + row.offsets.filter((value) => Math.abs(value) > perfectMs).length
  const worst = measures.reduce((best, row) => (off(row) > off(best) ? row : best), measures[0]!)
  if (measures.length > 1 && off(worst) >= 2) lines.push(`第 ${worst.measure} 小节最乱，可以单独练。`)
  return { lines, measures, perfectMs }
}
