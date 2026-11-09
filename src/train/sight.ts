import type { Hand } from '../judge/types'
import { materialize, measureTicks, type WrittenNote, type WrittenScore } from './musicXml'
import { mulberry32, pickOne, pickWeighted } from './rng'

export type ClefChoice = 'auto' | 'treble' | 'bass' | 'grand'
export type RangeChoice = 'narrow' | 'level' | 'wide'

export interface SightLevel {
  id: number
  title: string
  /** What this level adds. */
  detail: string
  clef: 'treble' | 'bass' | 'grand'
  range: Partial<Record<Hand, [number, number]>>
  /** Allowed note lengths in ticks. A quarter is 12. */
  durations: number[]
  rests: boolean
  /** Largest melodic leap, in semitones, that is allowed on purpose. */
  leap: number
  texture: 'single' | 'melody-bass' | 'independent'
  fifths: number[]
  bars: number
}

export const SIGHT_LEVELS: SightLevel[] = [
  { id: 1, title: '高音谱表五音', detail: '高音谱 C4–G4，四分音符', clef: 'treble', range: { R: [60, 67] }, durations: [12], rests: false, leap: 2, texture: 'single', fifths: [0], bars: 2 },
  { id: 2, title: '低音谱表五音', detail: '低音谱 C3–G3，四分音符', clef: 'bass', range: { L: [48, 55] }, durations: [12], rests: false, leap: 2, texture: 'single', fifths: [0], bars: 2 },
  { id: 3, title: '中央 C 附近', detail: '大谱表，F3–G4，四分音符', clef: 'grand', range: { R: [60, 67], L: [53, 59] }, durations: [12], rests: false, leap: 2, texture: 'single', fifths: [0], bars: 2 },
  { id: 4, title: 'C 大调一个八度', detail: '左右手各一个八度，仍是级进', clef: 'grand', range: { R: [60, 72], L: [48, 60] }, durations: [12], rests: false, leap: 2, texture: 'single', fifths: [0], bars: 2 },
  { id: 5, title: '二分、全音符和休止', detail: '加上二分、全音符和同长度的休止', clef: 'grand', range: { R: [60, 72], L: [48, 60] }, durations: [12, 24, 48], rests: true, leap: 2, texture: 'single', fifths: [0], bars: 2 },
  { id: 6, title: '八分音符', detail: '八分音符进入', clef: 'grand', range: { R: [60, 72], L: [48, 60] }, durations: [6, 12, 24], rests: true, leap: 2, texture: 'single', fifths: [0], bars: 2 },
  { id: 7, title: '左手陪衬', detail: '右手旋律，左手全音符或二分音符', clef: 'grand', range: { R: [60, 72], L: [48, 55] }, durations: [6, 12], rests: false, leap: 2, texture: 'melody-bass', fifths: [0], bars: 2 },
  { id: 8, title: '级进和三度', detail: '允许三度跳进', clef: 'grand', range: { R: [60, 72], L: [48, 60] }, durations: [6, 12, 24], rests: false, leap: 4, texture: 'single', fifths: [0], bars: 4 },
  { id: 9, title: 'G 与 F 大调', detail: '一个升号或一个降号', clef: 'grand', range: { R: [60, 79], L: [43, 60] }, durations: [6, 12, 24], rests: false, leap: 4, texture: 'single', fifths: [0, 1, -1], bars: 4 },
  { id: 10, title: '跳进和加线', detail: '四度、五度，以及加线', clef: 'grand', range: { R: [57, 81], L: [40, 64] }, durations: [6, 12, 24], rests: false, leap: 7, texture: 'single', fifths: [0, 1, -1], bars: 4 },
  { id: 11, title: '附点节奏', detail: '附点四分、附点二分', clef: 'grand', range: { R: [57, 81], L: [40, 64] }, durations: [6, 12, 18, 24, 36], rests: false, leap: 7, texture: 'single', fifths: [0, 1, -1], bars: 4 },
  { id: 12, title: '双手独立', detail: '左右手各走各的节奏', clef: 'grand', range: { R: [60, 76], L: [43, 60] }, durations: [6, 12, 18], rests: false, leap: 5, texture: 'independent', fifths: [0, 1, -1], bars: 4 },
]

export function sightLevel(id: number): SightLevel {
  const level = SIGHT_LEVELS.find((item) => item.id === id)
  if (!level) throw new Error(`Unknown sight level ${id}`)
  return level
}

export interface SightOptions {
  level: number
  seed: number
  clef?: ClefChoice
  range?: RangeChoice
  /** Pitch to extra weight. Used by 弱点. Values are error rates, 0 to 1. */
  weakness?: ReadonlyMap<number, number>
  focusWeak?: boolean
  bars?: number
}

export interface BuiltExercise {
  title: string
  xml: string
  notes: import('../judge/types').ScoreNote[]
  fifths: number
  level: number
  time: { beats: number; beatType: number }
}

function mod(value: number, base: number): number {
  return ((value % base) + base) % base
}

export function tonicPc(fifths: number): number {
  return mod(fifths * 7, 12)
}

export function scalePitches(low: number, high: number, fifths: number): number[] {
  const tonic = tonicPc(fifths)
  const steps = [0, 2, 4, 5, 7, 9, 11].map((step) => mod(tonic + step, 12))
  const pitches: number[] = []
  for (let pitch = low; pitch <= high; pitch += 1) {
    if (steps.includes(mod(pitch, 12))) pitches.push(pitch)
  }
  return pitches
}

function shrink(range: [number, number], choice: RangeChoice): [number, number] {
  const [low, high] = range
  if (choice === 'wide') return [Math.max(36, low - 2), Math.min(84, high + 2)]
  if (choice === 'narrow') {
    const mid = Math.round((low + high) / 2)
    return [Math.max(low, mid - 3), Math.min(high, mid + 3)]
  }
  return range
}

function resolvedRanges(level: SightLevel, clef: ClefChoice, range: RangeChoice, fifths: number): { clef: WrittenScore['clef']; hands: Partial<Record<Hand, [number, number]>> } {
  let hands = { ...level.range }
  if (level.id >= 9 && level.fifths.length > 1) {
    const lowTonic = 48 + tonicPc(fifths)
    const highTonic = 60 + tonicPc(fifths)
    if (hands.L) hands.L = [lowTonic, lowTonic + 12]
    if (hands.R) hands.R = [highTonic, Math.min(84, highTonic + 12)]
    if (level.id >= 10) {
      if (hands.L) hands.L = [hands.L[0] - 5, hands.L[1] + 2]
      if (hands.R) hands.R = [hands.R[0] - 3, Math.min(84, hands.R[1] + 5)]
    }
  }
  const wanted = clef === 'auto' ? level.clef : clef
  if (wanted === 'treble') hands = { R: hands.R ?? hands.L ?? [60, 72] }
  if (wanted === 'bass') hands = { L: hands.L ?? hands.R ?? [48, 60] }
  const next: Partial<Record<Hand, [number, number]>> = {}
  for (const hand of ['R', 'L'] as const) {
    const span = hands[hand]
    if (span) next[hand] = shrink(span, range)
  }
  const written: WrittenScore['clef'] = next.R && next.L ? 'grand' : next.L ? 'bass' : 'treble'
  return { clef: written, hands: next }
}

function fillTicks(rng: () => number, total: number, allowed: readonly number[]): number[] {
  const out: number[] = []
  let left = total
  while (left > 0) {
    const fit = allowed.filter((ticks) => ticks <= left)
    if (fit.length === 0) throw new Error(`Cannot fill ${left} ticks`)
    const ticks = pickOne(rng, fit)
    out.push(ticks)
    left -= ticks
  }
  return out
}

function choosePitch(
  rng: () => number,
  previous: number | null,
  choices: readonly number[],
  leap: number,
  weakness: ReadonlyMap<number, number> | undefined,
  focusWeak: boolean,
): number {
  if (choices.length === 0) throw new Error('Range has no scale tones')
  const items = choices.map((pitch) => {
    const bias = weakness?.get(pitch) ?? 0
    const weak = focusWeak ? 1 + bias * 12 : 1 + bias
    if (previous == null) return { item: pitch, weight: weak }
    const distance = Math.abs(pitch - previous)
    let shape = 0
    if (distance === 0) shape = 1.4
    else if (distance <= 2) shape = 8
    else if (distance <= 4 && leap >= 4) shape = 3.2
    else if (distance <= leap) shape = 1
    return { item: pitch, weight: shape * weak }
  })
  if (items.every((entry) => entry.weight <= 0)) {
    const anchor = previous ?? choices[0] ?? 60
    return choices.reduce((best, pitch) => (Math.abs(pitch - anchor) < Math.abs(best - anchor) ? pitch : best))
  }
  return pickWeighted(rng, items)
}

function tonicNear(previous: number, choices: readonly number[], fifths: number): number {
  const tonic = tonicPc(fifths)
  const landing = choices.filter((pitch) => mod(pitch, 12) === tonic)
  const pool = landing.length > 0 ? landing : choices
  return pool.reduce((best, pitch) => (Math.abs(pitch - previous) < Math.abs(best - previous) ? pitch : best))
}

function melody(
  rng: () => number,
  hand: Hand,
  measures: number,
  barTicks: number,
  allowed: readonly number[],
  rests: boolean,
  choices: readonly number[],
  leap: number,
  fifths: number,
  weakness: ReadonlyMap<number, number> | undefined,
  focusWeak: boolean,
): WrittenNote[] {
  const notes: WrittenNote[] = []
  let previous: number | null = null
  for (let measure = 1; measure <= measures; measure += 1) {
    const lengths = fillTicks(rng, barTicks, allowed)
    lengths.forEach((ticks, index) => {
      const last = measure === measures && index === lengths.length - 1
      const rest = rests && !last && ticks >= 12 && rng() < 0.18
      const pitch = rest ? null : last && previous != null ? tonicNear(previous, choices, fifths) : choosePitch(rng, previous, choices, leap, weakness, focusWeak)
      if (pitch != null) previous = pitch
      notes.push({ pitch, ticks, hand, measure })
    })
  }
  return notes
}

function singleLine(level: SightLevel, rng: () => number, hands: Partial<Record<Hand, [number, number]>>, fifths: number, bars: number, weakness: ReadonlyMap<number, number> | undefined, focusWeak: boolean): WrittenNote[] {
  const available = (['R', 'L'] as const).filter((hand) => hands[hand] && scalePitches(hands[hand][0], hands[hand][1], fifths).length > 0)
  const notes: WrittenNote[] = []
  let hand = available[0] ?? 'R'
  let previous: number | null = null
  const barTicks = 48
  for (let measure = 1; measure <= bars; measure += 1) {
    const lengths = fillTicks(rng, barTicks, level.durations)
    for (const [index, ticks] of lengths.entries()) {
      if (available.length > 1 && rng() < 0.45) hand = pickOne(rng, available)
      const span = hands[hand] ?? [60, 72]
      const choices = scalePitches(span[0], span[1], fifths)
      const last = measure === bars && index === lengths.length - 1
      const rest = level.rests && !last && ticks >= 12 && rng() < 0.16
      const pitch: number | null = rest
        ? null
        : last && previous != null
          ? tonicNear(previous, choices, fifths)
          : choosePitch(rng, previous, choices, level.leap, weakness, focusWeak)
      if (pitch != null) previous = pitch
      const other = hand === 'R' ? 'L' : 'R'
      notes.push({ pitch, ticks, hand, measure })
      if (hands.R && hands.L) notes.push({ pitch: null, ticks, hand: other, measure })
    }
  }
  return notes
}

export function generateSightPhrase(options: SightOptions): BuiltExercise {
  const level = sightLevel(options.level)
  const rng = mulberry32(options.seed)
  const fifths = pickOne(rng, level.fifths)
  const layout = resolvedRanges(level, options.clef ?? 'auto', options.range ?? 'level', fifths)
  const bars = options.bars ?? level.bars
  const barTicks = 48
  let written: WrittenNote[]
  if (level.texture === 'single') {
    written = singleLine(level, rng, layout.hands, fifths, bars, options.weakness, options.focusWeak ?? false)
  } else if (level.texture === 'melody-bass') {
    const right = scalePitches(...(layout.hands.R ?? [60, 72]), fifths)
    const left = scalePitches(...(layout.hands.L ?? [48, 55]), fifths)
    const rh = melody(rng, 'R', bars, barTicks, level.durations, false, right, level.leap, fifths, options.weakness, options.focusWeak ?? false)
    const lh = melody(rng, 'L', bars, barTicks, [24, 48], false, left, 7, fifths, options.weakness, false)
    written = [...rh, ...lh]
  } else {
    const right = scalePitches(...(layout.hands.R ?? [60, 76]), fifths)
    const left = scalePitches(...(layout.hands.L ?? [43, 60]), fifths)
    const rh = melody(rng, 'R', bars, barTicks, level.durations, false, right, level.leap, fifths, options.weakness, options.focusWeak ?? false)
    const lh = melody(rng, 'L', bars, barTicks, [12, 24], false, left, 5, fifths, options.weakness, false)
    written = [...rh, ...lh]
  }
  const score: WrittenScore = {
    title: `视奏 L${level.id}`,
    fifths,
    time: { beats: 4, beatType: 4 },
    staves: layout.clef === 'grand' ? 2 : 1,
    clef: layout.clef,
    notes: written,
  }
  const built = materialize(score)
  return { title: score.title, xml: built.xml, notes: built.notes, fifths, level: level.id, time: score.time }
}

export function generateFlash(options: SightOptions): BuiltExercise {
  const level = sightLevel(options.level)
  const rng = mulberry32(options.seed)
  const fifths = pickOne(rng, level.fifths)
  const layout = resolvedRanges(level, options.clef ?? 'auto', options.range ?? 'level', fifths)
  const hands = (['R', 'L'] as const).filter((hand) => layout.hands[hand])
  const hand = pickOne(rng, hands.length > 0 ? hands : (['R'] as const))
  const span = layout.hands[hand] ?? [60, 67]
  const choices = scalePitches(span[0], span[1], fifths)
  const pitch = choosePitch(rng, null, choices, level.leap, options.weakness, options.focusWeak ?? false)
  const other = hand === 'R' ? 'L' : 'R'
  const notes: WrittenNote[] = [{ pitch, ticks: 48, hand, measure: 1 }]
  if (layout.clef === 'grand') notes.push({ pitch: null, ticks: 48, hand: other, measure: 1 })
  const score: WrittenScore = {
    title: `认谱 L${level.id}`,
    fifths,
    time: { beats: 4, beatType: 4 },
    staves: layout.clef === 'grand' ? 2 : 1,
    clef: layout.clef,
    notes,
  }
  const built = materialize(score)
  return { title: score.title, xml: built.xml, notes: built.notes, fifths, level: level.id, time: score.time }
}

export function handTicks(notes: readonly WrittenNote[], measure: number, hand: Hand): number {
  return notes.filter((note) => note.measure === measure && note.hand === hand).reduce((sum, note) => sum + note.ticks, 0)
}

export { measureTicks }
