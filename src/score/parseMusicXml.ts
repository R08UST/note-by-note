import type { Articulation, Hand, Ornament, OrnamentKind, ScoreNote } from '../judge/types'
import { pitchToMidi } from './pitch'

export interface TimeSignature {
  beats: number
  beatType: number
}

/** One printed dynamic, in quarter-note beats from the start of the piece. */
export interface DynamicMark {
  beat: number
  /** MIDI velocity this mark asks for, 1–127. */
  velocity: number
  /** Staff the mark is printed under. Absent means it applies to every staff. */
  staff?: number
}

/** A crescendo or diminuendo hairpin. */
export interface Wedge {
  startBeat: number
  /** Null when the hairpin never printed a stop. */
  endBeat: number | null
  direction: 'crescendo' | 'diminuendo'
  staff?: number
}

/** One sustain-pedal press, from down to up. */
export interface PedalSpan {
  downBeat: number
  upBeat: number | null
}

/** A printed tempo change, in quarter notes per minute. */
export interface TempoMark {
  beat: number
  bpm: number
}

export interface ParsedScore {
  title: string
  notes: ScoreNote[]
  timeSignature: TimeSignature
  /** Length of the piece in quarter-note beats. */
  totalBeats: number
  dynamics: DynamicMark[]
  wedges: Wedge[]
  pedals: PedalSpan[]
  tempos: TempoMark[]
}

function findChild(element: Element, name: string): Element | null {
  for (const child of element.children) {
    if (child.localName === name) return child
  }
  return null
}

function directText(element: Element, name: string): string | null {
  const child = findChild(element, name)
  const text = child?.textContent?.trim()
  return text ? text : null
}

function hasChild(element: Element, name: string): boolean {
  return findChild(element, name) != null
}

function tieFlags(note: Element): { start: boolean; stop: boolean } {
  let start = false
  let stop = false
  const tags = note.getElementsByTagName('*')
  for (const tag of tags) {
    if (tag.localName !== 'tie' && tag.localName !== 'tied') continue
    const type = tag.getAttribute('type')
    if (type === 'start') start = true
    if (type === 'stop') stop = true
  }
  return { start, stop }
}

function readPitch(note: Element): number | null {
  const pitch = findChild(note, 'pitch')
  if (!pitch) return null
  const step = directText(pitch, 'step')
  const octaveText = directText(pitch, 'octave')
  if (!step || octaveText == null) return null
  const alter = Number(directText(pitch, 'alter') ?? '0')
  return pitchToMidi(step, Number(octaveText), Number.isFinite(alter) ? alter : 0)
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const LETTER_SEMITONE = [0, 2, 4, 5, 7, 9, 11]
/** Order a key signature adds its sharps in, then its flats. */
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const

/** Semitone adjustment the key signature puts on each letter. */
function keyAlterations(fifths: number): Map<string, number> {
  const map = new Map<string, number>()
  if (fifths > 0) {
    for (const letter of SHARP_ORDER.slice(0, Math.min(7, fifths))) map.set(letter, 1)
  } else if (fifths < 0) {
    for (const letter of FLAT_ORDER.slice(0, Math.min(7, -fifths))) map.set(letter, -1)
  }
  return map
}

/**
 * The scale step above or below a written pitch, using the key signature so a trill
 * on F in G major alternates with G, not with G flat.
 */
function stepFrom(pitch: number, fifths: number, direction: 1 | -1): number {
  const alterations = keyAlterations(fifths)
  const pitchClass = ((pitch % 12) + 12) % 12
  // MIDI octave 0 starts at C0 = 12, so the printed octave is one less.
  const octave = Math.floor(pitch / 12) - 1
  // Which printed letter this pitch most likely is. An altered note keeps the letter
  // of its natural spelling, which is what the engraver wrote.
  let letterIndex = 0
  let best = Infinity
  LETTERS.forEach((letter, index) => {
    const natural = LETTER_SEMITONE[index] + (alterations.get(letter) ?? 0)
    const distance = Math.abs(((natural - pitchClass + 12) % 12))
    if (distance < best) {
      best = distance
      letterIndex = index
    }
  })
  const nextIndex = (letterIndex + direction + 7) % 7
  const nextOctave = octave + (direction === 1 ? (letterIndex === 6 ? 1 : 0) : letterIndex === 0 ? -1 : 0)
  const nextLetter = LETTERS[nextIndex]
  return (nextOctave + 1) * 12 + LETTER_SEMITONE[nextIndex] + (alterations.get(nextLetter) ?? 0)
}

const ORNAMENTS: Record<string, OrnamentKind> = {
  'trill-mark': 'trill',
  mordent: 'mordent',
  'inverted-mordent': 'inverted-mordent',
  turn: 'turn',
}

/** Printed ornament on one note, if any. */
function readOrnament(note: Element, pitch: number, fifths: number): Ornament | undefined {
  const notations = findChild(note, 'notations')
  if (!notations) return undefined
  const group = findChild(notations, 'ornaments')
  if (!group) return undefined
  for (const child of group.children) {
    const kind = ORNAMENTS[child.localName]
    if (!kind) continue
    return { kind, upper: stepFrom(pitch, fifths, 1), lower: stepFrom(pitch, fifths, -1) }
  }
  return undefined
}

function handFor(staff: number | null, partIndex: number, partStaves: number): Hand {
  if (partStaves >= 2) return (staff ?? 1) <= 1 ? 'R' : 'L'
  if (staff != null && staff >= 2) return 'L'
  return partIndex === 0 ? 'R' : 'L'
}

/**
 * Printed dynamic symbols as MIDI velocity. The ladder is the one most
 * engravers use: ppp 16 … fff 126, with mf 80 sitting where a neutral
 * keystroke lands.
 */
const DYNAMIC_VELOCITY: Record<string, number> = {
  ppppp: 8,
  pppp: 12,
  ppp: 16,
  pp: 33,
  p: 49,
  mp: 64,
  mf: 80,
  f: 96,
  ff: 112,
  fff: 118,
  ffff: 123,
  fffff: 126,
  sf: 100,
  sfz: 104,
  fp: 96,
  rf: 100,
  rfz: 104,
  sffz: 110,
  fz: 104,
}

const ARTICULATIONS: Record<string, Articulation> = {
  staccato: 'staccato',
  staccatissimo: 'staccato',
  tenuto: 'tenuto',
  accent: 'accent',
  strongaccent: 'marcato',
  detachedlegato: 'portato',
}

/** Printed articulation on one note, from `<notations><articulations>`. */
function readArticulation(note: Element): Articulation | undefined {
  const notations = findChild(note, 'notations')
  if (!notations) return undefined
  const group = findChild(notations, 'articulations')
  if (!group) return undefined
  for (const child of group.children) {
    const kind = ARTICULATIONS[child.localName]
    if (kind) return kind
  }
  return undefined
}

function readFermata(note: Element): boolean {
  const notations = findChild(note, 'notations')
  if (!notations) return false
  for (const child of notations.children) {
    if (child.localName === 'fermata') return true
  }
  return false
}

/** Slur numbers that start and stop on this note. */
function slurEvents(note: Element): { starts: string[]; stops: string[] } {
  const starts: string[] = []
  const stops: string[] = []
  const notations = findChild(note, 'notations')
  if (!notations) return { starts, stops }
  for (const child of notations.children) {
    if (child.localName !== 'slur') continue
    const number = child.getAttribute('number') ?? '1'
    const type = child.getAttribute('type')
    if (type === 'start') starts.push(number)
    if (type === 'stop') stops.push(number)
  }
  return { starts, stops }
}

/**
 * Read one `<direction>`. A direction sits at the current cursor without
 * advancing it, so its beat is the measure start plus whatever is written so far.
 */
function readDirection(
  direction: Element,
  beat: number,
  sink: { dynamics: DynamicMark[]; wedges: Wedge[]; pedals: PedalSpan[]; tempos: TempoMark[] },
  openWedges: Map<string, Wedge>,
  openPedals: Map<string, PedalSpan>,
): void {
  const staffText = directText(direction, 'staff')
  const staff = staffText ? Number(staffText) : undefined

  for (const sound of direction.getElementsByTagName('sound')) {
    const tempo = Number(sound.getAttribute('tempo'))
    if (Number.isFinite(tempo) && tempo > 0) sink.tempos.push({ beat, bpm: tempo })
    const dyn = Number(sound.getAttribute('dynamics'))
    // MusicXML measures sound dynamics against 90 = mf, which is velocity 80.
    if (Number.isFinite(dyn) && dyn > 0) {
      sink.dynamics.push({ beat, velocity: Math.round((dyn / 90) * 80), staff })
    }
  }

  for (const metronome of direction.getElementsByTagName('metronome')) {
    const perMinute = Number(directText(metronome, 'per-minute'))
    const unit = directText(metronome, 'beat-unit')
    if (!Number.isFinite(perMinute) || perMinute <= 0) continue
    // Convert to quarter notes per minute so the transport can use it directly.
    const factor = unit === 'half' ? 2 : unit === 'whole' ? 4 : unit === 'eighth' ? 0.5 : unit === '16th' ? 0.25 : 1
    sink.tempos.push({ beat, bpm: perMinute * factor })
  }

  for (const dynamics of direction.getElementsByTagName('dynamics')) {
    for (const child of dynamics.children) {
      const velocity = DYNAMIC_VELOCITY[child.localName]
      if (velocity != null) sink.dynamics.push({ beat, velocity, staff })
    }
  }

  for (const wedge of direction.getElementsByTagName('wedge')) {
    const type = wedge.getAttribute('type')
    const key = `${staff ?? ''}`
    if (type === 'crescendo' || type === 'diminuendo') {
      // Two hairpins can overlap on one staff (one per hand, or a printed pair). A new
      // start closes whatever was still open, at this beat, rather than leaving it dangling.
      const previous = openWedges.get(key)
      if (previous && beat >= previous.startBeat) previous.endBeat = beat
      const span: Wedge = { startBeat: beat, endBeat: null, direction: type, staff }
      sink.wedges.push(span)
      openWedges.set(key, span)
    } else if (type === 'stop') {
      const open = openWedges.get(key)
      // Some engravers place the stop a hair before the start when two hairpins share a bar,
      // or write a stray stop. A stop can never end a hairpin that has not begun.
      if (open && beat >= open.startBeat) {
        open.endBeat = beat
        openWedges.delete(key)
      }
    }
  }

  for (const pedal of direction.getElementsByTagName('pedal')) {
    const type = pedal.getAttribute('type')
    const key = `${staff ?? ''}`
    if (type === 'start' || type === 'resume' || type === 'change') {
      // A change lifts the old pedal and presses again on the same beat.
      const open = openPedals.get(key)
      if (open) {
        open.upBeat = beat
        openPedals.delete(key)
      }
      const span: PedalSpan = { downBeat: beat, upBeat: null }
      sink.pedals.push(span)
      openPedals.set(key, span)
    } else if (type === 'stop') {
      const open = openPedals.get(key)
      if (open) {
        open.upBeat = beat
        openPedals.delete(key)
      }
    }
  }
}

function readTitle(root: Element): string {
  const work = findChild(root, 'work')
  const fromWork = work ? directText(work, 'work-title') : null
  if (fromWork) return fromWork
  const movement = directText(root, 'movement-title')
  return movement ?? 'Untitled'
}

interface MeasureShape {
  /** End of written content within the bar, in quarter-note beats. */
  contentEnd: number
  /** Signature length of the bar, in quarter-note beats. */
  signatureBeats: number
  implicit: boolean
}

/**
 * Measure lengths of one part: how far its written content reaches, and how
 * long its time signature says the bar is.
 */
function measureShapes(part: Element): MeasureShape[] {
  let divisions = 1
  let signature: TimeSignature = { beats: 4, beatType: 4 }
  const measures = [...part.children].filter((element) => element.localName === 'measure')
  return measures.map((measure) => {
    let cursor = 0
    let contentEnd = 0
    for (const element of measure.children) {
      if (element.localName === 'attributes') {
        const divisionText = directText(element, 'divisions')
        if (divisionText) divisions = Number(divisionText) || 1
        const time = findChild(element, 'time')
        if (time) {
          signature = {
            beats: Number(directText(time, 'beats') ?? 4) || 4,
            beatType: Number(directText(time, 'beat-type') ?? 4) || 4,
          }
        }
        continue
      }
      // A backup rewinds to the start of the measure, so the next voice's notes
      // advance the same cursor. The measure's content end is the furthest any
      // voice reaches, not the sum of every voice.
      if (element.localName === 'backup') {
        cursor -= Number(directText(element, 'duration') ?? 0) / divisions
        if (cursor < 0) cursor = 0
        continue
      }
      if (element.localName === 'forward') {
        cursor += Number(directText(element, 'duration') ?? 0) / divisions
        contentEnd = Math.max(contentEnd, cursor)
        continue
      }
      if (element.localName !== 'note') continue
      if (hasChild(element, 'grace')) continue
      if (hasChild(element, 'chord')) continue
      cursor += Number(directText(element, 'duration') ?? 0) / divisions
      contentEnd = Math.max(contentEnd, cursor)
    }
    return {
      contentEnd,
      signatureBeats: signature.beats * (4 / signature.beatType),
      implicit: measure.getAttribute('implicit') === 'yes',
    }
  })
}

/**
 * Partwise MusicXML → note model.
 * Rests are skipped, tied continuations extend the first note, staff 1 is the
 * right hand and staff 2 is the left. This is the only MusicXML reader; OSMD
 * is used later just to draw the page.
 *
 * OSMD engraves every part on one shared measure timeline: a bar is as long as
 * the longest part's bar. The parser mirrors that so a part whose bar content
 * differs (a pickup, an overfull bar) cannot drift its beats away from the
 * cursor's clock. Drift is what made eighth-note onsets land on the previous
 * beat in scores where the hands disagreed about a bar.
 */
export function parseMusicXml(xml: string): ParsedScore {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('That file is not valid XML.')
  }
  const root = doc.documentElement
  if (root.localName === 'score-timewise') {
    throw new Error('Timewise MusicXML is not supported. Export a partwise .musicxml file.')
  }
  if (root.localName !== 'score-partwise') {
    throw new Error('Choose a MusicXML score (.musicxml, .xml, or .mxl).')
  }

  const title = readTitle(root)
  const notes: ScoreNote[] = []
  const dynamics: DynamicMark[] = []
  const wedges: Wedge[] = []
  const pedals: PedalSpan[] = []
  const tempos: TempoMark[] = []
  let nextId = 1
  let timeSignature: TimeSignature = { beats: 4, beatType: 4 }
  let sawTime = false
  let totalBeats = 0
  let nextSlur = 1

  const parts = [...root.children].filter((element) => element.localName === 'part')
  const shapesByPart = parts.map((part) => measureShapes(part))

  // Shared bar starts: each bar is as long as the longest part's bar, and a bar
  // any part marks implicit is treated as a pickup (its written content only).
  const barCount = shapesByPart.reduce((max, list) => Math.max(max, list.length), 0)
  const barLengths: number[] = []
  const sharedStarts: number[] = []
  for (let index = 0; index < barCount; index += 1) {
    barLengths.push(barLength(shapesByPart, index))
    sharedStarts.push(index === 0 ? 0 : sharedStarts[index - 1] + barLengths[index - 1])
  }
  totalBeats = barCount === 0 ? 0 : sharedStarts[barCount - 1] + barLengths[barCount - 1]

  /** Hairpins and pedals left open per part, closed at the end of the score. */
  const openByPart: { wedges: Map<string, Wedge>; pedals: Map<string, PedalSpan> }[] = []

  parts.forEach((part, partIndex) => {
    let divisions = 1
    let partStaves = 1
    let signature: TimeSignature = { beats: 4, beatType: 4 }
    /** Sharps (positive) or flats (negative) in force, so ornaments stay diatonic. */
    let fifths = 0
    /**
     * Attacks waiting for their tie stop, keyed by staff, voice and pitch. One key can hold several
     * notes: an engraver may tie the same pitch twice in a bar and only close the first, and a stop then
     * belongs to the note it follows, not to whichever start was written last.
     */
    const openTies = new Map<string, ScoreNote[]>()
    const openSlurs = new Map<string, number>()
    const openWedges = new Map<string, Wedge>()
    const openPedals = new Map<string, PedalSpan>()
    openByPart.push({ wedges: openWedges, pedals: openPedals })
    /** Grace pitches waiting for the next real note, keyed by staff and voice. */
    const pendingGraces = new Map<string, number[]>()
    const measures = [...part.children].filter((element) => element.localName === 'measure')
    const firstRaw = measures[0]?.getAttribute('number')
    const firstNumber = firstRaw == null ? Number.NaN : Number(firstRaw)
    const endingOffset = Number.isFinite(firstNumber) && firstNumber === 0 ? 0 : 1

    measures.forEach((measure, measureIndex) => {
      let local = 0
      let lastStart = 0
      const rawNumber = measure.getAttribute('number')
      const parsedNumber = rawNumber == null ? Number.NaN : Number(rawNumber)
      // "X1" is an alternate ending. OSMD numbers that bar by its position, not by a printed number.
      const measureNumber = Number.isFinite(parsedNumber) ? parsedNumber : measureIndex + endingOffset
      const measureStart = sharedStarts[measureIndex] ?? 0
      const sink = { dynamics, wedges, pedals, tempos }

      for (const element of measure.children) {
        if (element.localName === 'attributes') {
          const divisionText = directText(element, 'divisions')
          if (divisionText) divisions = Number(divisionText) || 1
          const stavesText = directText(element, 'staves')
          if (stavesText) partStaves = Number(stavesText) || 1
          const key = findChild(element, 'key')
          if (key) {
            const fifthsText = directText(key, 'fifths')
            if (fifthsText != null) {
              const parsed = Number(fifthsText)
              if (Number.isFinite(parsed)) fifths = parsed
            }
          }
          const time = findChild(element, 'time')
          if (time) {
            signature = {
              beats: Number(directText(time, 'beats') ?? 4) || 4,
              beatType: Number(directText(time, 'beat-type') ?? 4) || 4,
            }
            if (!sawTime) {
              timeSignature = signature
              sawTime = true
            }
          }
          continue
        }

        if (element.localName === 'direction') {
          readDirection(element, measureStart + local, sink, openWedges, openPedals)
          continue
        }

        if (element.localName === 'backup') {
          local -= Number(directText(element, 'duration') ?? 0) / divisions
          if (local < 0) local = 0
          continue
        }

        if (element.localName === 'forward') {
          local += Number(directText(element, 'duration') ?? 0) / divisions
          continue
        }

        if (element.localName !== 'note') continue

        const staffText = directText(element, 'staff')
        const staff = staffText ? Number(staffText) : null
        const voice = directText(element, 'voice') ?? '1'
        const grace = hasChild(element, 'grace')

        if (grace) {
          // A grace note has no duration and does not move the cursor. Collect it
          // so the next real attack can play it just ahead of its beat.
          if (hasChild(element, 'rest') || hasChild(element, 'unpitched') || hasChild(element, 'cue')) continue
          const gracePitch = readPitch(element)
          if (gracePitch == null) continue
          const key = `${staff ?? partIndex}|${voice}`
          const list = pendingGraces.get(key) ?? []
          list.push(gracePitch)
          pendingGraces.set(key, list)
          continue
        }

        const chord = hasChild(element, 'chord')
        const duration = Number(directText(element, 'duration') ?? 0) / divisions
        const start = chord ? lastStart : local
        if (!chord) {
          lastStart = local
          local += duration
        }

        if (hasChild(element, 'rest') || hasChild(element, 'unpitched') || hasChild(element, 'cue')) {
          continue
        }

        const pitch = readPitch(element)
        if (pitch == null) continue
        const hand = handFor(staff, partIndex, partStaves)
        const ties = tieFlags(element)
        const staffKey = staff ?? (partIndex === 0 ? 1 : 2)
        const tieKey = `${staffKey}|${voice}|${pitch}`
        // A tie stop with no voice (or the wrong voice) still continues the open
        // attack of that pitch. It is not a new note the player has to strike.
        // A stop closes the earliest attack still waiting: the note it follows is written
        // before the stop, and taking the latest one would hand a later tie the wrong start.
        const openKey = ties.stop
          ? openTies.has(tieKey)
            ? tieKey
            : [...openTies.keys()].find((key) => key.endsWith(`|${pitch}`) && key.startsWith(`${staffKey}|`))
          : undefined

        if (ties.stop && openKey) {
          const waiting = openTies.get(openKey)
          const existing = waiting?.shift()
          if (existing) {
            existing.duration += duration
            // A tie continues the same sound, so it keeps the first attack's marks.
            if (readFermata(element)) existing.fermata = true
          }
          if (!ties.start) {
            if (waiting && waiting.length > 0) openTies.set(openKey, waiting)
            else openTies.delete(openKey)
          }
          continue
        }

        const slurs = slurEvents(element)
        const slurKey = `${staffKey}|${voice}`
        let slurId: number | undefined
        for (const number of slurs.starts) {
          slurId = nextSlur++
          openSlurs.set(`${slurKey}|${number}`, slurId)
        }
        for (const number of slurs.stops) {
          const key = `${slurKey}|${number}`
          const open = openSlurs.get(key)
          if (open != null) {
            slurId = open
            openSlurs.delete(key)
          }
        }

        const graceKey = `${staff ?? partIndex}|${voice}`
        const graces = pendingGraces.get(graceKey)
        if (graces && !chord) pendingGraces.delete(graceKey)

        const note: ScoreNote = {
          id: `n${nextId++}`,
          pitch,
          beat: measureStart + start,
          duration,
          hand,
          measure: measureNumber,
          voice,
          localBeat: start,
        }
        if (staff != null) note.staff = staff
        const articulation = readArticulation(element)
        if (articulation) note.articulation = articulation
        if (slurId != null) note.slur = slurId
        if (readFermata(element)) note.fermata = true
        if (graces && graces.length > 0 && !chord) note.graces = [...graces]
        const ornament = readOrnament(element, pitch, fifths)
        if (ornament) note.ornament = ornament
        notes.push(note)
        if (ties.start) openTies.set(tieKey, [...(openTies.get(tieKey) ?? []), note])
      }
    })
  })

  // A hairpin or pedal still open at the end holds to the last written beat.
  for (const part of openByPart) {
    for (const wedge of part.wedges.values()) wedge.endBeat = totalBeats
    for (const pedal of part.pedals.values()) pedal.upBeat = totalBeats
  }

  dynamics.sort((a, b) => a.beat - b.beat)
  wedges.sort((a, b) => a.startBeat - b.startBeat)
  pedals.sort((a, b) => a.downBeat - b.downBeat)
  tempos.sort((a, b) => a.beat - b.beat)

  return { title, notes, timeSignature, totalBeats, dynamics, wedges, pedals, tempos }
}

/** Length of the shared bar `index`, in quarter-note beats. */
function barLength(shapesByPart: MeasureShape[][], index: number): number {
  let content = 0
  let signature = 0
  let implicit = false
  for (const list of shapesByPart) {
    const shape = list[index]
    if (!shape) continue
    content = Math.max(content, shape.contentEnd)
    signature = Math.max(signature, shape.signatureBeats)
    implicit = implicit || shape.implicit
  }
  return implicit ? content : Math.max(content, signature)
}

export function quarterBeatsPerMeasure(time: TimeSignature): number {
  return time.beats * (4 / time.beatType)
}
