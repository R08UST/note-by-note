/**
 * Rhythm line first, then pitch.
 * Cells: GNU Solfege beat vocabulary and LenMus fragments.
 * Harmony, leap-then-step, and repeating a bar's rhythm: MusicReader
 * generator.py (`_progression`, leap recovery, `_MOTIF_REPEAT_PROB`) and LenMus.
 * Short melodic shapes: ftrain/sightreading pattern cells.
 */
import type { ScoreNote } from '../judge/types'
import type { TimeSignature } from '../score/parseMusicXml'
import { CELLS, barTicks, beatTicks, rhythmLevel, scalePcs, sightLevel, tonicPc, type KeyChoice, type RhythmCell, type SightLevel } from './curriculum'
import { materialize, type WrittenNote, type WrittenScore } from './musicXml'
import { mulberry32, pickOne, pickWeighted } from './rng'

export interface BuiltExercise {
  title: string
  xml: string
  notes: ScoreNote[]
  fifths: number
  level: number
  time: TimeSignature
  chords: number[]
  tonic: number
  source: string
  hand: 'R' | 'L' | 'both'
}

export interface SightOptions {
  level: number
  seed: number
  hand?: 'R' | 'L' | 'both'
  weakness?: ReadonlyMap<number, number>
  focusWeak?: boolean
}

const ROOT: Record<number, number> = { 1: 0, 4: 3, 5: 4, 6: 5 }

function mod(value: number, base: number): number {
  return ((value % base) + base) % base
}

function progression(bars: number, rng: () => number): number[] {
  if (bars <= 2) return [5, 1]
  const openings = [[1, 4], [1, 6], [1, 1], [1, 5]]
  const body: number[] = []
  while (body.length < bars - 2) body.push(...pickOne(rng, openings))
  return [...body.slice(0, bars - 2), 5, 1]
}

function position(level: SightLevel, hand: 'R' | 'L', key: KeyChoice, rng: () => number): number[] {
  const harmonic = level.id >= 5
  const pcs = scalePcs(key, harmonic)
  if (level.id >= 9) {
    const low = hand === 'R' ? 57 : 45
    const high = hand === 'R' ? 84 : 64
    const wide: number[] = []
    for (let pitch = low; pitch <= high; pitch += 1) if (pcs.includes(mod(pitch, 12))) wide.push(pitch)
    return wide
  }
  const floor = hand === 'R' ? 60 : 48
  const scale: number[] = []
  for (let pitch = floor - 5; pitch <= floor + 26; pitch += 1) if (pcs.includes(mod(pitch, 12))) scale.push(pitch)
  const tonic = tonicPc(key)
  let index = Math.max(0, scale.findIndex((pitch) => pitch >= floor && mod(pitch, 12) === tonic))
  if (level.id >= 5 && level.id < 8) index = Math.min(scale.length - level.span, index + pickOne(rng, [0, 0, 1, 3]))
  if (level.id === 8) index = Math.max(0, index - 1)
  return scale.slice(index, Math.min(scale.length, index + level.span))
}

function degreePitch(pitches: readonly number[], degree: number, key: KeyChoice, anchor: number | null): number {
  const want = scalePcs(key, true)[mod(degree - 1, 7)] ?? tonicPc(key)
  const pool = pitches.filter((pitch) => mod(pitch, 12) === want)
  const list = pool.length > 0 ? pool : [...pitches]
  if (anchor == null || list.length === 0) return list[0] ?? pitches[0] ?? 60
  return list.reduce((best, pitch) => (Math.abs(pitch - anchor) < Math.abs(best - anchor) ? pitch : best))
}

function fillCells(rng: () => number, total: number, beat: number, cells: readonly RhythmCell[], longestLast: boolean): RhythmCell[] {
  const fitting = cells.filter((cell) => cell.span <= total && cell.span % beat === 0)
  if (fitting.length === 0) throw new Error('没有能放进小节的节奏单元')
  const chosen: RhythmCell[] = []
  let left = total
  while (left > 0) {
    let pool = fitting.filter((cell) => cell.span <= left && (chosen.length > 0 || !cell.events[0]?.rest))
    if (pool.length === 0) pool = fitting.filter((cell) => cell.span <= left)
    if (pool.length === 0) throw new Error('节奏单元填不满小节')
    const exact = pool.filter((cell) => cell.span === left)
    const pick = longestLast && exact.length > 0 ? exact.reduce((best, cell) => (cell.span >= best.span ? cell : best)) : pickOne(rng, pool)
    chosen.push(pick)
    left -= pick.span
  }
  return chosen
}

function asNotes(cells: readonly RhythmCell[], hand: 'R' | 'L', measure: number, pitch: number | null): WrittenNote[] {
  return cells.flatMap((cell) =>
    cell.events.map((item) => ({
      pitch: item.rest ? null : pitch,
      ticks: item.ticks,
      hand,
      measure,
      triplet: item.triplet,
      tie: item.tie,
    })),
  )
}

function onBeat(notes: readonly WrittenNote[], target: WrittenNote, beat: number): boolean {
  let ticks = 0
  for (const note of notes) {
    if (note === target) return ticks % beat === 0
    if (note.measure === target.measure && note.hand === target.hand && !note.chord) ticks += note.ticks
  }
  return false
}

function paint(
  notes: WrittenNote[],
  pitches: readonly number[],
  chords: readonly number[],
  beat: number,
  maxInterval: number,
  key: KeyChoice,
  rng: () => number,
  weakness: ReadonlyMap<number, number> | undefined,
  focusWeak: boolean,
): void {
  const line = notes.filter((note) => note.pitch != null)
  let previous: number | null = null
  let repeats = 0
  let recover = 0
  line.forEach((note, index) => {
    if (index === 0) {
      const choices = [1, 3, 5].map((degree) => degreePitch(pitches, degree, key, null))
      note.pitch = pickOne(rng, [...new Set(choices)])
      previous = note.pitch
      return
    }
    if (index === line.length - 1) {
      note.pitch = degreePitch(pitches, 1, key, previous)
      return
    }
    if (note.tie === 'stop') {
      note.pitch = previous
      return
    }
    const strong = onBeat(notes, note, beat)
    const degree = chords[note.measure - 1] ?? 1
    const steps = [ROOT[degree] ?? 0, ((ROOT[degree] ?? 0) + 2) % 7, ((ROOT[degree] ?? 0) + 4) % 7]
    const options = pitches.filter((pitch) => {
      if (previous == null) return steps.includes(pitches.indexOf(pitch) % 7) || true
      const distance = pitch - previous
      if (recover !== 0) return Math.sign(distance) === recover && Math.abs(distance) > 0 && Math.abs(distance) <= 2
      return Math.abs(distance) <= maxInterval
    })
    const pool = options.length > 0 ? options : pitches
    const pitch = pickWeighted(
      rng,
      pool.map((item) => {
        const distance = previous == null ? 0 : Math.abs(item - previous)
        const step = Math.max(0, pitches.indexOf(item)) % 7
        let weight = strong && steps.includes(step) ? 6 : distance <= 2 ? 4 : 1
        if (previous === item) weight = repeats >= 2 ? 0 : 1
        const bias = Math.min(0.4, weakness?.get(item) ?? 0)
        weight *= focusWeak ? 1 + bias * 6 : 1
        return { item, weight }
      }),
    )
    if (previous != null && Math.abs(pitch - previous) > 2) recover = Math.sign(previous - pitch)
    else recover = 0
    repeats = pitch === previous ? repeats + 1 : 0
    note.pitch = pitch
    previous = pitch
  })
}

function leftHand(measure: number, total: number, root: number, fifth: number, chords: boolean): WrittenNote[] {
  if (chords) {
    const held = Math.min(12, total)
    return [
      { pitch: root, ticks: held, hand: 'L', measure },
      { pitch: fifth, ticks: held, hand: 'L', measure, chord: true },
      { pitch: null, ticks: total - held, hand: 'L', measure },
    ]
  }
  if (total >= 48) return [{ pitch: root, ticks: 24, hand: 'L', measure }, { pitch: fifth, ticks: total - 24, hand: 'L', measure }]
  return [{ pitch: root, ticks: total, hand: 'L', measure }]
}

export function generateSight(options: SightOptions): BuiltExercise {
  const level = sightLevel(options.level)
  const hand = options.hand ?? 'R'
  let last: unknown
  for (let attempt = 0; attempt < 16; attempt += 1) {
    try {
      const built = once(level, hand, options.seed + attempt * 997, options.weakness, options.focusWeak ?? false)
      assertSight(built, level)
      return built
    } catch (error) {
      last = error
    }
  }
  throw last instanceof Error ? last : new Error('没能作出这一级的视奏')
}

function once(level: SightLevel, hand: 'R' | 'L' | 'both', seed: number, weakness: ReadonlyMap<number, number> | undefined, focusWeak: boolean): BuiltExercise {
  const rng = mulberry32(seed)
  const key = pickOne(rng, level.keys)
  const time = pickOne(rng, level.meters)
  const bars = time.beats === 2 ? Math.max(...level.bars) : pickOne(rng, level.bars)
  const beat = beatTicks(time)
  const total = barTicks(time)
  const bank = level.cells.map((id) => CELLS[id]).filter((cell) => cell.span <= total && cell.span % beat === 0)
  const chords = progression(bars, rng)
  const right = position(level, 'R', key, rng)
  const left = position(level, 'L', key, rng)
  const notes: WrittenNote[] = []
  const memory: WrittenNote[][] = []
  for (let measure = 1; measure <= bars; measure += 1) {
    const active: 'R' | 'L' = hand === 'both' && !level.together ? (measure % 2 === 1 ? 'R' : 'L') : hand === 'L' ? 'L' : 'R'
    const earlier = memory[measure - 3]
    const fresh = asNotes(fillCells(rng, total, beat, bank, measure === bars), active, measure, 0)
    const line = earlier && rng() < 0.4 ? earlier.map((note) => ({ ...note, hand: active, measure })) : fresh
    memory.push(line.map((note) => ({ ...note })))
    paint(line, active === 'L' ? left : right, chords, beat, level.maxInterval, key, rng, weakness, focusWeak)
    notes.push(...line)
    if (hand === 'both' && !level.together) {
      notes.push({ pitch: null, ticks: total, hand: active === 'R' ? 'L' : 'R', measure })
    }
    if (hand === 'both' && level.together) {
      const degree = chords[measure - 1] ?? 1
      const root = degreePitch(left, (ROOT[degree] ?? 0) + 1, key, null)
      const fifth = degreePitch(left, ((ROOT[degree] ?? 0) + 4) % 7 + 1, key, root)
      notes.push(...leftHand(measure, total, root, fifth, level.chords))
    }
  }
  const clef: WrittenScore['clef'] = hand === 'R' ? 'treble' : hand === 'L' ? 'bass' : 'grand'
  const score: WrittenScore = { title: `视奏 S${level.id}`, fifths: key.fifths, time, staves: clef === 'grand' ? 2 : 1, clef, notes }
  const made = materialize(score)
  return {
    title: `视奏 S${level.id} · ${key.name}`,
    xml: made.xml,
    notes: made.notes,
    fifths: key.fifths,
    level: level.id,
    time,
    chords,
    tonic: tonicPc(key),
    source: level.source,
    hand,
  }
}

export function assertSight(exercise: BuiltExercise, level: SightLevel): void {
  const chords = exercise.chords
  if (chords.at(-1) !== 1 || chords.at(-2) !== 5) throw new Error('进行没有以 V–I 结束')
  const melodic = exercise.notes.filter((note) => exercise.hand !== 'both' || !level.together || note.hand === 'R')
  for (let index = 1; index < melodic.length; index += 1) {
    const previous = melodic[index - 1]
    const note = melodic[index]
    if (!previous || !note) continue
    const leap = note.pitch - previous.pitch
    if (Math.abs(leap) > level.maxInterval + 7 && note.measure !== previous.measure) continue
    if (previous.measure === note.measure && Math.abs(leap) > level.maxInterval) throw new Error('音程超出这一级')
  }
  const last = melodic.at(-1)
  if (!last || mod(last.pitch, 12) !== exercise.tonic) throw new Error('最后一音不是主音')
}

export function generateFlash(options: SightOptions): BuiltExercise {
  const level = sightLevel(options.level)
  const rng = mulberry32(options.seed)
  const key = pickOne(rng, level.keys)
  const hand = options.hand === 'L' ? 'L' : 'R'
  const pitches = position(level, hand, key, rng).slice(0, 3)
  const pitch = pickWeighted(rng, pitches.map((item) => ({ item, weight: 1 + Math.min(0.4, options.weakness?.get(item) ?? 0) * 5 })))
  const score: WrittenScore = {
    title: `认谱 S${level.id}`,
    fifths: key.fifths,
    time: { beats: 4, beatType: 4 },
    staves: 1,
    clef: hand === 'L' ? 'bass' : 'treble',
    notes: [{ pitch, ticks: 48, hand, measure: 1 }],
  }
  const made = materialize(score)
  return { title: score.title, xml: made.xml, notes: made.notes, fifths: key.fifths, level: level.id, time: score.time, chords: [1], tonic: tonicPc(key), source: 'philippotto 三音窗，音域跟当前级别', hand }
}

export function generateRhythmLine(levelId: number, seed: number, bars = 4): BuiltExercise {
  const level = rhythmLevel(levelId)
  const rng = mulberry32(seed)
  const time = pickOne(rng, level.meters)
  const beat = beatTicks(time)
  const total = barTicks(time)
  const bank = level.cells.map((id) => CELLS[id]).filter((cell) => cell.span <= total && cell.span % beat === 0)
  const notes: WrittenNote[] = []
  const memory: WrittenNote[][] = []
  for (let measure = 1; measure <= bars; measure += 1) {
    const earlier = memory[measure - 3]
    const line = earlier && rng() < 0.4
      ? earlier.map((note) => ({ ...note, measure }))
      : asNotes(fillCells(rng, total, beat, bank, measure === bars), 'R', measure, 71)
    memory.push(line)
    notes.push(...line)
  }
  if (level.pickup) {
    for (const note of notes) note.measure += 1
    notes.unshift(
      { pitch: null, ticks: total - beat, hand: 'R', measure: 1 },
      { pitch: 71, ticks: beat, hand: 'R', measure: 1 },
    )
  }
  const score: WrittenScore = { title: `节奏 R${level.id}`, fifths: 0, time, staves: 1, clef: 'treble', notes }
  const made = materialize(score)
  return { title: score.title, xml: made.xml, notes: made.notes, fifths: 0, level: level.id, time, chords: [], tonic: 0, source: level.source, hand: 'R' }
}

export function cellSpans(levelId: number, kind: 'sight' | 'rhythm'): number[] {
  const ids = kind === 'sight' ? sightLevel(levelId).cells : rhythmLevel(levelId).cells
  return [...new Set(ids.flatMap((id) => CELLS[id]?.events.filter((item) => !item.rest).map((item) => item.ticks) ?? []))]
}
