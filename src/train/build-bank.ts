/**
 * Builds the fixed sight and rhythm banks.
 * Run with: npx vite-node src/train/build-bank.ts
 * The written JSON is the 题库. Do not regenerate it unless the level rules change.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { ScoreNote } from '../judge/types'
import { noteKeys, tooSimilar, type BankItem, type StoredNote } from './bank'
import { SIGHT_LEVELS, type SightLevel } from './curriculum'
import { cellSpans as spansOf, CONTOURS, generateRhythmLine, generateSight, type BuiltExercise } from './generate'

const TARGET = 80
const ROOT = new URL('../../public/pieces/', import.meta.url)

interface CatalogPiece {
  id: string
  title: string
  title_zh?: string | null
  license: string
  file: string
  key: string
  time: string
  category?: string
}

const KEYS: Record<string, { fifths: number; minor: boolean }> = {
  C: { fifths: 0, minor: false },
  G: { fifths: 1, minor: false },
  D: { fifths: 2, minor: false },
  A: { fifths: 3, minor: false },
  E: { fifths: 4, minor: false },
  B: { fifths: 5, minor: false },
  F: { fifths: -1, minor: false },
  Bb: { fifths: -2, minor: false },
  Eb: { fifths: -3, minor: false },
  Ab: { fifths: -4, minor: false },
  Db: { fifths: -5, minor: false },
  Gb: { fifths: -6, minor: false },
  'F#': { fifths: 6, minor: false },
  Am: { fifths: 0, minor: true },
  Em: { fifths: 1, minor: true },
  Bm: { fifths: 2, minor: true },
  Fsm: { fifths: 3, minor: true },
  Dm: { fifths: -1, minor: true },
  Gm: { fifths: -2, minor: true },
  Cm: { fifths: -3, minor: true },
}

function normalizeKey(raw: string): { fifths: number; minor: boolean } | null {
  const text = raw.replace('♭', 'b').replace('♯', '#').replace(' major', '').replace(' minor', 'm').trim()
  return KEYS[text] ?? null
}

function blocked(piece: CatalogPiece): boolean {
  const name = `${piece.id} ${piece.title}`.toLowerCase()
  return ['mikrokosmos', 'thompson', 'kodaly', 'kodály', 'pozzoli'].some((word) => name.includes(word))
}

function readCatalog(): CatalogPiece[] {
  const manifest = JSON.parse(readFileSync(new URL('./manifest.json', ROOT), 'utf8')) as { pieces: CatalogPiece[] }
  const etudes = JSON.parse(readFileSync(new URL('./etudes.json', ROOT), 'utf8')) as CatalogPiece[]
  const methods = JSON.parse(readFileSync(new URL('./method.json', ROOT), 'utf8')) as CatalogPiece[]
  const seen = new Set<string>()
  const rows: CatalogPiece[] = []
  for (const piece of [...manifest.pieces, ...etudes, ...methods]) {
    if (seen.has(piece.id) || blocked(piece)) continue
    seen.add(piece.id)
    rows.push(piece)
  }
  return rows
}

function rangeCap(level: SightLevel): number {
  if (level.id >= 9) return 24
  if (level.id === 8) return 16
  if (level.span <= 3) return 4
  return 7 + Math.max(0, level.span - 5) * 2
}

function fitsLevel(level: SightLevel, notes: readonly ScoreNote[], piece: CatalogPiece): boolean {
  const meter = piece.time.split('/').map(Number)
  if (!level.meters.some((item) => item.beats === meter[0] && item.beatType === meter[1])) return false
  const key = normalizeKey(piece.key)
  if (!key || !level.keys.some((item) => item.fifths === key.fifths && item.minor === key.minor)) return false
  const sounding = notes.filter((note) => note.pitch != null)
  if (sounding.length < 4 || sounding.length > 40) return false
  const allowed = new Set(spansOf(level.id, 'sight'))
  for (const note of sounding) {
    const ticks = Math.round(note.duration * 12)
    if (!allowed.has(ticks)) return false
  }
  for (let index = 1; index < sounding.length; index += 1) {
    const previous = sounding[index - 1]
    const current = sounding[index]
    if (!previous || !current) continue
    if (Math.abs(current.pitch - previous.pitch) > level.maxInterval) return false
  }
  const low = Math.min(...sounding.map((note) => note.pitch))
  const high = Math.max(...sounding.map((note) => note.pitch))
  return high - low <= rangeCap(level)
}

function windowNotes(notes: readonly ScoreNote[], start: number, bars: number, hand: 'R' | 'L'): ScoreNote[] {
  return notes
    .filter((note) => note.hand === hand && note.measure >= start && note.measure < start + bars)
    .map((note) => ({ ...note, measure: note.measure - start + 1 }))
}

interface Excerpt {
  piece: CatalogPiece
  start: number
  bars: number
  hand: 'R' | 'L'
  notes: ScoreNote[]
  transposed: boolean
  echo?: boolean
  preferred: boolean
}

function excerptsFor(level: SightLevel, pieces: readonly { piece: CatalogPiece; notes: ScoreNote[] }[]): Excerpt[] {
  const found: Excerpt[] = []
  const earlier = SIGHT_LEVELS.filter((item) => item.id < level.id)
  const consider = (entry: { piece: CatalogPiece; notes: ScoreNote[] }, slice: ScoreNote[], start: number, bars: number, hand: 'R' | 'L', transposed: boolean, characteristic: boolean, echo = false) => {
    if (!fitsLevel(level, slice, entry.piece)) return
    void characteristic
    const preferred = !earlier.some((item) => fitsLevel(item, slice, entry.piece))
    found.push({ piece: entry.piece, start, bars, hand, notes: slice, transposed, echo, preferred })
  }
  for (const entry of pieces) {
    const measures = [...new Set(entry.notes.map((note) => note.measure))].sort((a, b) => a - b)
    if (measures.length === 0) continue
    const last = measures[measures.length - 1] ?? 1
    for (const bars of level.bars) {
      for (let start = 1; start + bars - 1 <= last; start += 1) {
        for (const hand of ['R', 'L'] as const) {
          const slice = windowNotes(entry.notes, start, bars, hand)
          consider(entry, slice, start, bars, hand, false, true)
          if (hand === 'R' && slice.length >= 4 && slice.every((note) => note.pitch >= 60)) {
            const down = slice.map((note) => ({ ...note, hand: 'L' as const, pitch: note.pitch - 12 }))
            consider(entry, down, start, bars, 'L', true, true)
          }
        }
      }
    }
    for (let start = 1; start <= last; start += 1) {
      const slice = windowNotes(entry.notes, start, 1, 'R')
      const two = windowNotes(entry.notes, start, 2, 'R')
      if (slice.length < 2 || fitsLevel(level, two, entry.piece)) continue
      const repeated = [...slice, ...slice.map((note) => ({ ...note, measure: 2 }))]
      consider(entry, repeated, start, 2, 'R', false, true, true)
      if (slice.every((note) => note.pitch >= 60)) {
        const down = repeated.map((note) => ({ ...note, hand: 'L' as const, pitch: note.pitch - 12 }))
        consider(entry, down, start, 2, 'L', true, true, true)
      }
    }
  }
  found.sort((a, b) => Number(b.preferred) - Number(a.preferred) || Number(a.echo) - Number(b.echo) || a.piece.id.localeCompare(b.piece.id) || a.start - b.start)
  const folk = found.filter((item) => item.piece.id.startsWith('os-'))
  const studies = found.filter((item) => !item.piece.id.startsWith('os-'))
  studies.sort((a, b) => {
    const rank = (piece: CatalogPiece) => (piece.id.startsWith('method-') ? 0 : piece.category === 'method' ? 1 : 2)
    const group = rank(a.piece) - rank(b.piece)
    if (group !== 0) return group
    return Number(b.preferred) - Number(a.preferred) || Number(a.echo) - Number(b.echo) || a.piece.id.localeCompare(b.piece.id) || a.start - b.start
  })
  return [
    ...takeDiverse(folk.filter((item) => item.hand === 'R'), 6),
    ...takeDiverse(studies.filter((item) => item.hand === 'R'), 6),
    ...takeDiverse(folk.filter((item) => item.hand === 'L'), 6),
    ...takeDiverse(studies.filter((item) => item.hand === 'L'), 6),
  ]
}

function takeDiverse(found: Excerpt[], cap: number): Excerpt[] {
  const picked: Excerpt[] = []
  const used = new Set<string>()
  const pieces = new Set<string>()
  const consider = (excerpt: Excerpt, uniquePiece: boolean) => {
    if (picked.length >= cap) return
    const key = `${excerpt.piece.id}:${excerpt.start}:${excerpt.transposed ? 't' : ''}`
    if (used.has(key)) return
    if (uniquePiece && pieces.has(excerpt.piece.id)) return
    const keys = noteKeys(storedFromScore(excerpt.notes))
    if (picked.some((item) => tooSimilar(keys, noteKeys(storedFromScore(item.notes))))) return
    used.add(key)
    pieces.add(excerpt.piece.id)
    picked.push(excerpt)
  }
  for (const excerpt of found) consider(excerpt, true)
  for (const excerpt of found) consider(excerpt, false)
  return picked
}

function storedFromWritten(notes: readonly { pitch: number | null; ticks: number; hand: 'R' | 'L'; measure: number; chord?: boolean; triplet?: 'start' | 'mid' | 'stop'; tie?: 'start' | 'stop' }[]): StoredNote[] {
  return notes.map((note) => ({
    p: note.pitch,
    t: note.ticks,
    h: note.hand,
    m: note.measure,
    ...(note.chord ? { c: true } : {}),
    ...(note.triplet ? { tr: note.triplet } : {}),
    ...(note.tie ? { tie: note.tie } : {}),
  }))
}

function storedFromScore(notes: readonly ScoreNote[]): StoredNote[] {
  return notes.map((note) => ({ p: note.pitch, t: Math.round(note.duration * 12), h: note.hand, m: note.measure }))
}

function fromExercise(exercise: BuiltExercise, id: string, source: string, origin?: string): BankItem | null {
  if (!exercise.written || exercise.written.length === 0) return null
  return {
    id,
    fifths: exercise.fifths,
    beats: exercise.time.beats,
    beatType: exercise.time.beatType,
    source,
    ...(origin ? { origin } : {}),
    notes: storedFromWritten(exercise.written),
  }
}

function accept(item: BankItem, kept: readonly { keys: { rhythm: string; pitches: string } }[], rhythmOnly: boolean, openingCap: number): boolean {
  const keys = noteKeys(item.notes)
  if (kept.some((other) => tooSimilar(keys, other.keys, rhythmOnly))) return false
  const opening = rhythmOnly ? keys.rhythm.split('|')[0] ?? '' : keys.pitches.split(',').slice(0, 3).join(',')
  const same = kept.filter((other) => {
    const otherOpening = rhythmOnly ? other.keys.rhythm.split('|')[0] ?? '' : other.keys.pitches.split(',').slice(0, 3).join(',')
    return otherOpening === opening
  }).length
  return same < openingCap
}

function pad(value: number): string {
  return String(value).padStart(3, '0')
}

function writeBank(name: string, items: BankItem[]) {
  const path = new URL(`./banks/${name}.json`, import.meta.url)
  writeFileSync(path, JSON.stringify({ items }))
}

function parsedNotes(catalog: CatalogPiece[]): { piece: CatalogPiece; notes: ScoreNote[] }[] {
  const jobs = catalog.map((piece) => ({
    id: piece.id,
    path: new URL(`./${piece.file.replace('pieces/', '')}`, ROOT).pathname,
  }))
  const byId = new Map<string, ScoreNote[]>()
  for (let start = 0; start < jobs.length; start += 15) {
    const list = `/tmp/bank-notes-${start}.json`
    writeFileSync(list, JSON.stringify(jobs.slice(start, start + 15)))
    const child = spawnSync(process.execPath, [new URL('../../scripts/dump-notes.mjs', import.meta.url).pathname, list], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (child.status !== 0) continue
    const rows = JSON.parse(child.stdout) as { id: string; notes: ScoreNote[] }[]
    for (const row of rows) if (row.notes.length > 0) byId.set(row.id, row.notes)
  }
  return catalog.flatMap((piece) => {
    const notes = byId.get(piece.id)
    return notes ? [{ piece, notes }] : []
  })
}

function main() {
  mkdirSync(new URL('./banks/', import.meta.url), { recursive: true })
  const catalog = readCatalog()
  const parsed = parsedNotes(catalog)

  const libraryCount: Record<string, number> = {}
  for (const level of SIGHT_LEVELS) {
    const library = excerptsFor(level, parsed)
    for (const hand of ['R', 'L', 'both'] as const) {
      const side = hand === 'both' ? 'b' : hand.toLowerCase()
      const kept: { item: BankItem; keys: { rhythm: string; pitches: string } }[] = []
      const pool = hand === 'both' ? [] : library.filter((item) => item.hand === hand).slice(0, 12)
      for (const excerpt of pool) {
        const label = excerpt.piece.title_zh || excerpt.piece.title
        const where = excerpt.echo ? `第 ${excerpt.start} 小节，再奏一次` : `第 ${excerpt.start}–${excerpt.start + excerpt.bars - 1} 小节`
        const octave = excerpt.transposed ? '，左手低八度' : ''
        const item: BankItem = {
          id: `S${level.id}-${hand === 'both' ? 'B' : hand}-${pad(kept.length + 1)}`,
          fifths: normalizeKey(excerpt.piece.key)?.fifths ?? 0,
          beats: Number(excerpt.piece.time.split('/')[0]),
          beatType: Number(excerpt.piece.time.split('/')[1]),
          source: `${label} · ${excerpt.piece.license} · ${where}${octave}`,
          origin: excerpt.piece.id,
          notes: storedFromScore(excerpt.notes),
        }
        if (!accept(item, kept, false, 24)) continue
        kept.push({ item, keys: noteKeys(item.notes) })
      }
      const phrases = ['echo', 'return', 'through'] as const
      let steps = 0
      while (kept.length < TARGET && steps < 6000) {
        const contour = CONTOURS[steps % CONTOURS.length] ?? 'arch'
        const phrase = phrases[steps % phrases.length] ?? 'echo'
        try {
          const exercise = generateSight({
            level: level.id,
            seed: 1 + (steps % 180),
            hand,
            contour,
            progression: Math.floor(steps / 5),
            position: Math.floor(steps / 11) % 4,
            key: Math.floor(steps / 3) % level.keys.length,
            meter: Math.floor(steps / 7) % level.meters.length,
            phrase,
          })
          const item = fromExercise(exercise, `S${level.id}-${hand === 'both' ? 'B' : hand}-${pad(kept.length + 1)}`, level.source)
          if (item && accept(item, kept, false, 24)) kept.push({ item, keys: noteKeys(item.notes) })
        } catch {
          // This shape did not fit the level. The next seed tries another one.
        }
        steps += 1
      }
      kept.forEach((row, index) => {
        row.item.id = `S${level.id}-${hand === 'both' ? 'B' : hand}-${pad(index + 1)}`
      })
      writeBank(`s${level.id}-${side}`, kept.map((row) => row.item))
      const fromLibrary = kept.filter((row) => row.item.origin).length
      libraryCount[`S${level.id}-${side}`] = fromLibrary
      console.log(`S${level.id} ${hand} ${kept.length} library ${fromLibrary}`)
    }
  }

  for (let level = 1; level <= 10; level += 1) {
    const spec = SIGHT_LEVELS[0]
    void spec
    const kept: { item: BankItem; keys: { rhythm: string; pitches: string } }[] = []
    let seed = 1
    while (kept.length < TARGET && seed < 4000) {
      try {
        const exercise = generateRhythmLine(level, seed, seed % 5 === 0 ? 2 : 4)
        const item = fromExercise(exercise, `R${level}-${pad(kept.length + 1)}`, exercise.source)
        if (item && accept(item, kept, true, 24)) kept.push({ item, keys: noteKeys(item.notes) })
      } catch {
        // Skip a seed that cannot fill the bar.
      }
      seed += 1
    }
    kept.forEach((row, index) => {
      row.item.id = `R${level}-${pad(index + 1)}`
    })
    writeBank(`r${level}`, kept.map((row) => row.item))
    console.log(`R${level} ${kept.length}`)
  }
  console.log('LIBRARY', JSON.stringify(libraryCount))
}

main()
