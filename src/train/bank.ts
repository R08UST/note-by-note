import type { ScoreNote } from '../judge/types'
import type { TimeSignature } from '../score/parseMusicXml'
import { materialize, type WrittenNote, type WrittenScore } from './musicXml'
import { pitchKey } from './variety'

/** Two items are the same exercise when the tune and the rhythm are this close. */
export const SIMILARITY_LIMIT = 0.84
export const RECENT_WINDOW = 8

export interface StoredNote {
  p: number | null
  t: number
  h: 'R' | 'L'
  m: number
  c?: boolean
  tr?: 'start' | 'mid' | 'stop'
  tie?: 'start' | 'stop'
}

export interface BankItem {
  id: string
  fifths: number
  beats: number
  beatType: number
  source: string
  origin?: string
  notes: StoredNote[]
}

export interface BankFile {
  items: BankItem[]
}

export interface BuiltFromBank {
  title: string
  xml: string
  notes: ScoreNote[]
  fifths: number
  time: TimeSignature
  source: string
  hand: 'R' | 'L' | 'both'
}

const banks = import.meta.glob('./banks/*.json')

export function loadBank(name: string): Promise<BankFile> {
  const load = banks[`./banks/${name}.json`]
  if (!load) return Promise.reject(new Error(`没有题库 ${name}`))
  return load().then((module) => (module as { default: BankFile }).default)
}

export function noteKeys(notes: readonly { p?: number | null; pitch?: number | null; t?: number; duration?: number; h?: 'R' | 'L'; hand?: 'R' | 'L'; m?: number; measure?: number }[]): { rhythm: string; pitches: string } {
  const bars = new Map<number, string[]>()
  for (const note of notes) {
    const measure = note.m ?? note.measure ?? 1
    const ticks = note.t ?? Math.round((note.duration ?? 1) * 12)
    const sounding = (note.p ?? note.pitch) != null
    const list = bars.get(measure) ?? []
    list.push(sounding ? String(ticks) : `r${ticks}`)
    bars.set(measure, list)
  }
  const rhythm = [...bars.keys()].sort((a, b) => a - b).map((bar) => (bars.get(bar) ?? []).join('.')).join('|')
  const scored = notes
    .filter((note) => (note.p ?? note.pitch) != null)
    .map((note) => ({
      pitch: (note.p ?? note.pitch) as number,
      duration: note.duration ?? (note.t ?? 12) / 12,
      hand: (note.h ?? note.hand ?? 'R') as 'R' | 'L',
      measure: note.m ?? note.measure ?? 1,
      beat: 0,
      id: '',
    }))
  return { rhythm, pitches: pitchKey(scored) }
}

export function editSimilarity(left: string, right: string): number {
  const a = left.split(/[|,.]/).filter(Boolean)
  const b = right.split(/[|,.]/).filter(Boolean)
  if (a.length === 0 || b.length === 0) return 1
  const rows = a.length + 1
  const cols = b.length + 1
  const dist = new Array<number>(cols).fill(0)
  for (let col = 0; col < cols; col += 1) dist[col] = col
  for (let row = 1; row < rows; row += 1) {
    let previous = dist[0] ?? 0
    dist[0] = row
    for (let col = 1; col < cols; col += 1) {
      const current = dist[col] ?? 0
      const cost = a[row - 1] === b[col - 1] ? 0 : 1
      dist[col] = Math.min(current + 1, (dist[col - 1] ?? 0) + 1, previous + cost)
      previous = current
    }
  }
  return 1 - (dist[cols - 1] ?? 0) / Math.max(a.length, b.length)
}

export function tooSimilar(left: { rhythm: string; pitches: string }, right: { rhythm: string; pitches: string }, rhythmOnly = false): boolean {
  if (left.rhythm === right.rhythm && left.pitches === right.pitches) return true
  const rhythm = editSimilarity(left.rhythm, right.rhythm)
  if (rhythmOnly) return rhythm >= SIMILARITY_LIMIT
  const pitch = editSimilarity(left.pitches, right.pitches)
  if (left.rhythm === right.rhythm && pitch >= 0.72) return true
  return rhythm >= SIMILARITY_LIMIT && pitch >= SIMILARITY_LIMIT
}

export function nextItem<T extends { id: string }>(items: readonly T[], seen: ReadonlySet<string>, recent: readonly string[]): T | undefined {
  if (items.length === 0) return undefined
  const blocked = new Set(recent.slice(-RECENT_WINDOW))
  return (
    items.find((item) => !seen.has(item.id) && !blocked.has(item.id)) ??
    items.find((item) => !blocked.has(item.id)) ??
    items[0]
  )
}

export type PracticeHand = 'R' | 'L' | 'both'

/** Same level, in the order the curriculum already states: right, left, then both. */
export function nextHand(hand: PracticeHand): PracticeHand {
  if (hand === 'R') return 'L'
  if (hand === 'L') return 'both'
  return 'R'
}

export interface AdvancePlan {
  level: number
  hand: PracticeHand
  itemId: string | undefined
  recent: string[]
  /** A retry is never a first attempt, so it cannot count toward mastery. */
  firstAttempt: boolean
}

/**
 * What to serve after an exercise.
 * The level never changes here. A retry stays on the same item.
 * Otherwise the current item joins the recent window and is treated as seen.
 */
export function afterExercise<T extends { id: string }>(options: {
  items: readonly T[]
  seen: ReadonlySet<string>
  recent: readonly string[]
  currentId: string
  retry: boolean
  level: number
  hand: PracticeHand
  cycleHands: boolean
}): AdvancePlan {
  if (options.retry) {
    return {
      level: options.level,
      hand: options.hand,
      itemId: options.currentId,
      recent: [...options.recent],
      firstAttempt: false,
    }
  }
  const recent = [...options.recent, options.currentId].slice(-RECENT_WINDOW)
  const seen = new Set(options.seen)
  seen.add(options.currentId)
  const hand = options.cycleHands ? nextHand(options.hand) : options.hand
  const itemId = hand === options.hand ? nextItem(options.items, seen, recent)?.id : undefined
  return {
    level: options.level,
    hand,
    itemId,
    recent,
    firstAttempt: itemId != null && !options.seen.has(itemId),
  }
}

export function exerciseFromBank(item: BankItem, title: string, hand: 'R' | 'L' | 'both'): BuiltFromBank {
  const notes: WrittenNote[] = item.notes.map((note) => ({
    pitch: note.p,
    ticks: note.t,
    hand: note.h,
    measure: note.m,
    chord: note.c,
    triplet: note.tr,
    tie: note.tie,
  }))
  const bothHands = notes.some((note) => note.hand === 'L') && notes.some((note) => note.hand === 'R')
  const score: WrittenScore = {
    title,
    fifths: item.fifths,
    time: { beats: item.beats, beatType: item.beatType },
    staves: bothHands ? 2 : 1,
    clef: bothHands ? 'grand' : notes.every((note) => note.hand === 'L') ? 'bass' : 'treble',
    notes,
  }
  const made = materialize(score)
  return { title, xml: made.xml, notes: made.notes, fifths: item.fifths, time: score.time, source: item.source, hand }
}

export function bankFileName(kind: 's' | 'r', level: number, hand?: 'R' | 'L' | 'both'): string {
  if (kind === 'r') return `r${level}`
  const side = hand === 'L' ? 'l' : hand === 'both' ? 'b' : 'r'
  return `s${level}-${side}`
}
