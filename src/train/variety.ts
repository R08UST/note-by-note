import { generateRhythmLine, generateSight } from './generate'
import { RHYTHM_LEVELS, SIGHT_LEVELS } from './curriculum'
import type { ScoreNote } from '../judge/types'

export function rhythmKey(notes: readonly ScoreNote[]): string {
  const bars = new Map<number, string[]>()
  for (const note of notes) {
    const list = bars.get(note.measure) ?? []
    list.push(String(Math.round(note.duration * 12)))
    bars.set(note.measure, list)
  }
  return [...bars.keys()].sort((a, b) => a - b).map((bar) => (bars.get(bar) ?? []).join('.')).join('|')
}

export function pitchKey(notes: readonly ScoreNote[]): string {
  const line = notes.filter((note) => note.hand === 'R' || notes.every((item) => item.hand === 'L'))
  if (line.length === 0) return ''
  const origin = line[0]?.pitch ?? 0
  return line.map((note) => note.pitch - origin).join(',')
}

export function ngramOverlap(left: string, right: string, size = 2): number {
  const grams = (value: string) => {
    const parts = value.split(/[|,]/).filter(Boolean)
    const set = new Set<string>()
    for (let index = 0; index <= parts.length - size; index += 1) set.add(parts.slice(index, index + size).join(':'))
    if (set.size === 0 && parts.length) set.add(parts.join(':'))
    return set
  }
  const a = grams(left)
  const b = grams(right)
  if (a.size === 0 || b.size === 0) return 1
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared += 1
  return shared / Math.max(a.size, b.size)
}

export function varietyOf(items: readonly { rhythm: string; pitches: string }[]) {
  const rhythms = new Set(items.map((item) => item.rhythm))
  const pitches = new Set(items.map((item) => item.pitches))
  const openings = new Map<string, number>()
  let overlap = 0
  let pairs = 0
  const sample = items.slice(0, 40)
  for (let i = 0; i < sample.length; i += 1) {
    const open = sample[i]?.pitches.split(',').slice(0, 3).join(',') ?? ''
    openings.set(open, (openings.get(open) ?? 0) + 1)
    for (let j = i + 1; j < sample.length; j += 1) {
      overlap += ngramOverlap(sample[i]?.pitches ?? '', sample[j]?.pitches ?? '')
      pairs += 1
    }
  }
  const topOpen = [...openings.values()].sort((a, b) => b - a)[0] ?? 0
  return {
    count: items.length,
    distinctRhythms: rhythms.size,
    distinctPitches: pitches.size,
    meanPitchOverlap: pairs === 0 ? 0 : Number((overlap / pairs).toFixed(2)),
    topOpeningShare: items.length === 0 ? 0 : Number((topOpen / sample.length).toFixed(2)),
  }
}

export function sampleSight(level: number, count = 200) {
  const rows = []
  let failed = 0
  for (let seed = 1; seed <= count; seed += 1) {
    try {
      const built = generateSight({ level, seed, hand: 'R' })
      rows.push({ rhythm: rhythmKey(built.notes), pitches: pitchKey(built.notes) })
    } catch {
      failed += 1
    }
  }
  return { rows, failed }
}

export function sampleRhythm(level: number, count = 200) {
  const rows = []
  for (let seed = 1; seed <= count; seed += 1) {
    const built = generateRhythmLine(level, seed, 4)
    rows.push({ rhythm: rhythmKey(built.notes), pitches: pitchKey(built.notes) })
  }
  return rows
}

export function inventory() {
  const seen = (cells: { id: number; cells: string[] }[], id: number) => {
    const ids: string[] = []
    for (const level of cells) {
      if (level.id > id) break
      ids.push(...level.cells)
    }
    return new Set(ids).size
  }
  return {
    sight: SIGHT_LEVELS.map((level) => ({
      id: level.id,
      cells: seen(SIGHT_LEVELS, level.id),
      keys: level.keys.length,
      meters: level.meters.length,
      progressions: level.id <= 2 ? 4 : level.id <= 4 ? 8 : 12,
      contours: 5,
      positions: level.id >= 5 && level.id < 9 ? 4 : 1,
    })),
    rhythm: RHYTHM_LEVELS.map((level) => ({
      id: level.id,
      cells: seen(RHYTHM_LEVELS, level.id),
      meters: level.meters.length,
    })),
  }
}
