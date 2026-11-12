import type { Hand, ScoreNote } from '../judge/types'
import { pitchToMidi } from './pitch'

export interface TimeSignature {
  beats: number
  beatType: number
}

export interface ParsedScore {
  title: string
  notes: ScoreNote[]
  timeSignature: TimeSignature
  /** Length of the piece in quarter-note beats. */
  totalBeats: number
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

function handFor(staff: number | null, partIndex: number, partStaves: number): Hand {
  if (partStaves >= 2) return (staff ?? 1) <= 1 ? 'R' : 'L'
  if (staff != null && staff >= 2) return 'L'
  return partIndex === 0 ? 'R' : 'L'
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
  let nextId = 1
  let timeSignature: TimeSignature = { beats: 4, beatType: 4 }
  let sawTime = false
  let totalBeats = 0

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

  parts.forEach((part, partIndex) => {
    let divisions = 1
    let partStaves = 1
    let signature: TimeSignature = { beats: 4, beatType: 4 }
    const openTies = new Map<string, ScoreNote>()
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

      for (const element of measure.children) {
        if (element.localName === 'attributes') {
          const divisionText = directText(element, 'divisions')
          if (divisionText) divisions = Number(divisionText) || 1
          const stavesText = directText(element, 'staves')
          if (stavesText) partStaves = Number(stavesText) || 1
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
        if (hasChild(element, 'grace')) continue

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
        const staffText = directText(element, 'staff')
        const staff = staffText ? Number(staffText) : null
        const voice = directText(element, 'voice') ?? '1'
        const hand = handFor(staff, partIndex, partStaves)
        const ties = tieFlags(element)
        const staffKey = staff ?? (partIndex === 0 ? 1 : 2)
        const tieKey = `${staffKey}|${voice}|${pitch}`
        // A tie stop with no voice (or the wrong voice) still continues the open
        // attack of that pitch. It is not a new note the player has to strike.
        const openKey = ties.stop
          ? openTies.has(tieKey)
            ? tieKey
            : [...openTies.keys()].reverse().find((key) => key.endsWith(`|${pitch}`) && key.startsWith(`${staffKey}|`))
          : undefined

        if (ties.stop && openKey) {
          const existing = openTies.get(openKey)
          if (existing) existing.duration += duration
          if (!ties.start) openTies.delete(openKey)
          continue
        }

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
        notes.push(note)
        if (ties.start) openTies.set(tieKey, note)
      }
    })
  })

  return { title, notes, timeSignature, totalBeats }
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
