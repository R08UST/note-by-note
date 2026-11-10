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

/**
 * Partwise MusicXML → note model.
 * Rests are skipped, tied continuations extend the first note, staff 1 is the
 * right hand and staff 2 is the left. This is the only MusicXML reader; OSMD
 * is used later just to draw the page.
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
  parts.forEach((part, partIndex) => {
    let divisions = 1
    let partStaves = 1
    let measureStart = 0
    let signature: TimeSignature = { beats: 4, beatType: 4 }
    const openTies = new Map<string, ScoreNote>()
    const measures = [...part.children].filter((element) => element.localName === 'measure')

    measures.forEach((measure, measureIndex) => {
      let local = 0
      let lastStart = 0
      let maxLocal = 0
      const rawNumber = measure.getAttribute('number')
      const parsedNumber = rawNumber == null ? Number.NaN : Number(rawNumber)
      const measureNumber = Number.isFinite(parsedNumber) ? parsedNumber : measureIndex + 1

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
          maxLocal = Math.max(maxLocal, local)
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
          maxLocal = Math.max(maxLocal, local)
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
        const tieKey = `${staff ?? (partIndex === 0 ? 1 : 2)}|${voice}|${pitch}`

        if (ties.stop && openTies.has(tieKey)) {
          const existing = openTies.get(tieKey)
          if (existing) existing.duration += duration
          if (!ties.start) openTies.delete(tieKey)
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

      const signatureBeats = signature.beats * (4 / signature.beatType)
      const implicit = measure.getAttribute('implicit') === 'yes'
      const length = implicit ? maxLocal : Math.max(maxLocal, signatureBeats)
      measureStart += length
    })

    totalBeats = Math.max(totalBeats, measureStart)
  })

  return { title, notes, timeSignature, totalBeats }
}

export function quarterBeatsPerMeasure(time: TimeSignature): number {
  return time.beats * (4 / time.beatType)
}
