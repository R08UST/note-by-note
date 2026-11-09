import type { ScoreNote } from '../judge/types'
import type { TimeSignature } from '../score/parseMusicXml'
import { summarize, type RunSummary } from '../report/summary'
import { Judge } from '../judge/judge'
import { isOnTime } from '../judge/judge'
import { BEGINNER_TOLERANCE } from '../judge/types'
import { materialize, measureTicks, TICKS, type WrittenNote, type WrittenScore } from './musicXml'
import { mulberry32, pickOne } from './rng'

export interface RhythmLevel {
  id: number
  title: string
  detail: string
  time: TimeSignature
  kind: 'free' | 'syncopation' | 'triplet' | 'tie'
  durations: number[]
  rests: boolean
}

export const RHYTHM_LEVELS: RhythmLevel[] = [
  { id: 1, title: '四分、二分、全音符', detail: '加上同样长度的休止', time: { beats: 4, beatType: 4 }, kind: 'free', durations: [12, 24, 48], rests: true },
  { id: 2, title: '八分音符', detail: '八分和四分', time: { beats: 4, beatType: 4 }, kind: 'free', durations: [6, 12, 24], rests: true },
  { id: 3, title: '附点四分', detail: '附点四分接八分', time: { beats: 4, beatType: 4 }, kind: 'free', durations: [18, 6, 12], rests: false },
  { id: 4, title: '延音线', detail: '一条音连到下一拍，只弹一次', time: { beats: 4, beatType: 4 }, kind: 'tie', durations: [], rests: false },
  { id: 5, title: '十六分音符', detail: '十六分和八分', time: { beats: 4, beatType: 4 }, kind: 'free', durations: [3, 6, 12], rests: false },
  { id: 6, title: '切分', detail: '重音不在拍点上', time: { beats: 4, beatType: 4 }, kind: 'syncopation', durations: [], rests: false },
  { id: 7, title: '三连音', detail: '一拍里三个八分三连音', time: { beats: 4, beatType: 4 }, kind: 'triplet', durations: [], rests: false },
  { id: 8, title: '3/4', detail: '三拍子', time: { beats: 3, beatType: 4 }, kind: 'free', durations: [12, 24, 36], rests: true },
  { id: 9, title: '6/8', detail: '以附点四分音符为拍', time: { beats: 6, beatType: 8 }, kind: 'free', durations: [6, 12, 18], rests: true },
]

export function rhythmLevel(id: number): RhythmLevel {
  const level = RHYTHM_LEVELS.find((item) => item.id === id)
  if (!level) throw new Error(`Unknown rhythm level ${id}`)
  return level
}

const SYNCOPATION: number[][] = [
  [6, 12, 6, 12, 12],
  [12, 6, 12, 6, 12],
  [6, 12, 12, 12, 6],
  [12, 12, 6, 12, 6],
]

const TIED: { ticks: number; tie?: 'start' | 'stop' }[][] = [
  [{ ticks: 12 }, { ticks: 6, tie: 'start' }, { ticks: 6, tie: 'stop' }, { ticks: 24 }],
  [{ ticks: 12, tie: 'start' }, { ticks: 12, tie: 'stop' }, { ticks: 12 }, { ticks: 12 }],
  [{ ticks: 6 }, { ticks: 6, tie: 'start' }, { ticks: 6, tie: 'stop' }, { ticks: 6 }, { ticks: 24 }],
]

function fill(rng: () => number, total: number, allowed: readonly number[], rests: boolean): WrittenNote[] {
  const notes: WrittenNote[] = []
  let left = total
  while (left > 0) {
    const fit = allowed.filter((ticks) => ticks <= left)
    const ticks = pickOne(rng, fit)
    const rest = rests && ticks >= 12 && left - ticks > 0 && rng() < 0.2
    notes.push({ pitch: rest ? null : 71, ticks, hand: 'R', measure: 1 })
    left -= ticks
  }
  return notes
}

function patternNotes(lengths: readonly number[], measure: number, restFirst: boolean): WrittenNote[] {
  return lengths.map((ticks, index) => ({
    pitch: restFirst && index === 0 ? null : 71,
    ticks,
    hand: 'R' as const,
    measure,
  }))
}

export interface RhythmBuild {
  title: string
  xml: string
  notes: ScoreNote[]
  time: TimeSignature
  level: number
}

function finish(title: string, level: RhythmLevel, notes: WrittenNote[], pitchFor: (hand: 'R' | 'L') => number): RhythmBuild {
  const written = notes.map((note) => (note.pitch == null ? note : { ...note, pitch: pitchFor(note.hand) }))
  const score: WrittenScore = {
    title,
    fifths: 0,
    time: level.time,
    staves: notes.some((note) => note.hand === 'L') ? 2 : 1,
    clef: notes.some((note) => note.hand === 'L') ? 'grand' : 'treble',
    notes: written,
  }
  const built = materialize(score)
  return { title, xml: built.xml, notes: built.notes, time: level.time, level: level.id }
}

export function generateRhythm(levelId: number, seed: number, bars = 2): RhythmBuild {
  const level = rhythmLevel(levelId)
  const rng = mulberry32(seed)
  const total = measureTicks(level.time)
  const notes: WrittenNote[] = []
  for (let measure = 1; measure <= bars; measure += 1) {
    let bar: WrittenNote[]
    if (level.kind === 'syncopation') {
      bar = patternNotes(pickOne(rng, SYNCOPATION), measure, rng() < 0.5)
    } else if (level.kind === 'tie') {
      bar = pickOne(rng, TIED).map((cell) => ({ pitch: 71, ticks: cell.ticks, hand: 'R' as const, measure, tie: cell.tie }))
    } else if (level.kind === 'triplet') {
      bar = []
      let left = total
      while (left > 0) {
        const triplet = rng() < 0.55 && left >= 12
        if (triplet) {
          bar.push(
            { pitch: 71, ticks: 4, hand: 'R', measure, triplet: 'start' },
            { pitch: 71, ticks: 4, hand: 'R', measure, triplet: 'mid' },
            { pitch: 71, ticks: 4, hand: 'R', measure, triplet: 'stop' },
          )
          left -= 12
        } else {
          const ticks = left >= 12 ? 12 : left
          bar.push({ pitch: 71, ticks, hand: 'R', measure })
          left -= ticks
        }
      }
    } else {
      bar = fill(rng, total, level.durations, level.rests).map((note) => ({ ...note, measure }))
    }
    notes.push(...bar)
  }
  return finish(`节奏 L${level.id}`, level, notes, () => 71)
}

export function generateHandsRhythm(seed: number, bars = 2): RhythmBuild {
  const rng = mulberry32(seed)
  const level = rhythmLevel(2)
  const notes: WrittenNote[] = []
  for (let measure = 1; measure <= bars; measure += 1) {
    const rightPattern = pickOne(rng, [
      [6, 6, 6, 6, 6, 6, 6, 6],
      [6, 6, 12, 6, 6, 12],
      [12, 6, 6, 12, 6, 6],
    ])
    for (const ticks of rightPattern) notes.push({ pitch: 72, ticks, hand: 'R', measure })
    const leftPattern = pickOne(rng, [
      [12, 12, 12, 12],
      [24, 24],
      [12, 12, 24],
    ])
    for (const ticks of leftPattern) notes.push({ pitch: 48, ticks, hand: 'L', measure })
  }
  return finish('双手节奏', { ...level, id: 2, title: '双手节奏' }, notes, (hand) => (hand === 'R' ? 72 : 48))
}

export function generatePulse(subdivision: 'quarter' | 'eighth', bars = 4): RhythmBuild {
  const ticks = subdivision === 'quarter' ? 12 : 6
  const level = rhythmLevel(1)
  const notes: WrittenNote[] = []
  for (let measure = 1; measure <= bars; measure += 1) {
    for (let used = 0; used < 48; used += ticks) notes.push({ pitch: 71, ticks, hand: 'R', measure })
  }
  return finish(subdivision === 'quarter' ? '跟拍 四分' : '跟拍 八分', level, notes, () => 71)
}

export interface PieceRhythmSource {
  notes: readonly ScoreNote[]
  measures: readonly number[]
  time: TimeSignature
}

/** Drop the pitches and replay the attacks in the chosen measures, back to back. */
export function rhythmFromPiece(source: PieceRhythmSource): RhythmBuild {
  const bar = measureTicks(source.time)
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
      const ticks = Math.max(3, Math.min(writtenTicks, next - start))
      if (start > cursor) written.push({ pitch: null, ticks: start - cursor, hand: 'R', measure: index + 1 })
      written.push({ pitch: 71, ticks, hand: 'R', measure: index + 1 })
      cursor = start + ticks
    })
    if (cursor < bar) written.push({ pitch: null, ticks: bar - cursor, hand: 'R', measure: index + 1 })
  })
  const level = rhythmLevel(1)
  if (written.length === 0) written.push({ pitch: 71, ticks: bar, hand: 'R', measure: 1 })
  return finish('曲目节奏', { ...level, time: source.time }, written, () => 71)
}

export function worstMeasures(
  rows: readonly { measure: number; errors: number; expected: number }[],
  limit = 4,
): number[] {
  return [...rows]
    .filter((row) => row.expected > 0 && row.errors > 0)
    .sort((a, b) => b.errors / b.expected - a.errors / a.expected || b.errors - a.errors)
    .slice(0, limit)
    .map((row) => row.measure)
    .sort((a, b) => a - b)
}

export type RhythmMatch = 'any' | 'chosen' | 'hands'

/** Map a played key onto the pitch the judge expects, when the drill ignores pitch. */
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

/** Score a finished rhythm take with the shared beginner windows. */
export function scoreRhythm(
  notes: readonly ScoreNote[],
  played: readonly PlayedTap[],
  bpm: number,
  rule: RhythmMatch,
  chosen?: number,
): RunSummary {
  const judge = new Judge([...notes], { bpm })
  const ordered = [...played].sort((a, b) => a.timeMs - b.timeMs)
  for (const tap of ordered) {
    const pitch = matchRhythmPitch(tap.pitch, judge.upcoming(), rule, chosen)
    judge.push({ pitch, velocity: 90, timeMs: tap.timeMs, type: 'on' })
  }
  const end = ordered.reduce((max, tap) => Math.max(max, tap.timeMs), 0)
  judge.advanceTo(end + BEGINNER_TOLERANCE.lateMs + 1)
  return summarize([...notes], judge.judgements)
}

export function onTimeRate(summary: RunSummary): number {
  if (summary.expected === 0) return 0
  return summary.perfects / summary.expected
}

export function pitchAccuracy(summary: RunSummary): number {
  if (summary.expected === 0) return 0
  return summary.hits / summary.expected
}

export { isOnTime }
