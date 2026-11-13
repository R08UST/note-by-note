import type { Hand, ScoreNote } from '../judge/types'
import type { TimeSignature } from '../score/parseMusicXml'

/** A quarter note is 12 ticks, so eighths, sixteenths, and eighth triplets stay on integers. */
export const TICKS = 12

export interface WrittenNote {
  /** MIDI pitch. Null is a rest. */
  pitch: number | null
  ticks: number
  hand: Hand
  measure: number
  /** Sound with the previous note instead of after it. */
  chord?: boolean
  /** Eighth-note triplet. Three of these fill one quarter. */
  triplet?: 'start' | 'mid' | 'stop'
  tie?: 'start' | 'stop'
  /** Printed fingering. 1 is the thumb. */
  finger?: number
  /** Spelling override, so a raised leading tone stays a sharp in a flat key. */
  spelling?: { step: string; alter: number }
}

export interface WrittenScore {
  title: string
  fifths: number
  time: TimeSignature
  /** 1 = one staff, 2 = grand staff. */
  staves: 1 | 2
  clef: 'treble' | 'bass' | 'grand'
  notes: WrittenNote[]
}

const SHARP: Record<number, [string, number]> = {
  0: ['C', 0],
  1: ['C', 1],
  2: ['D', 0],
  3: ['D', 1],
  4: ['E', 0],
  5: ['F', 0],
  6: ['F', 1],
  7: ['G', 0],
  8: ['G', 1],
  9: ['A', 0],
  10: ['A', 1],
  11: ['B', 0],
}

const FLAT: Record<number, [string, number]> = {
  0: ['C', 0],
  1: ['D', -1],
  2: ['D', 0],
  3: ['E', -1],
  4: ['E', 0],
  5: ['F', 0],
  6: ['G', -1],
  7: ['G', 0],
  8: ['A', -1],
  9: ['A', 0],
  10: ['B', -1],
  11: ['B', 0],
}

export function spellPitch(midi: number, fifths: number): { step: string; alter: number; octave: number } {
  const pc = ((midi % 12) + 12) % 12
  const table = fifths < 0 ? FLAT : SHARP
  const [step, alter] = table[pc] ?? ['C', 0]
  return { step, alter, octave: Math.floor(midi / 12) - 1 }
}

function typeOf(ticks: number, triplet: boolean): { type: string; dotted: boolean } {
  if (triplet) return { type: 'eighth', dotted: false }
  const table: Record<number, { type: string; dotted: boolean }> = {
    48: { type: 'whole', dotted: false },
    36: { type: 'half', dotted: true },
    24: { type: 'half', dotted: false },
    18: { type: 'quarter', dotted: true },
    12: { type: 'quarter', dotted: false },
    9: { type: 'eighth', dotted: true },
    6: { type: 'eighth', dotted: false },
    3: { type: '16th', dotted: false },
  }
  return table[ticks] ?? { type: 'quarter', dotted: false }
}

function noteXml(note: WrittenNote, fifths: number, staff: number | null): string {
  const { type, dotted } = typeOf(note.ticks, note.triplet != null)
  const head =
    note.pitch == null
      ? '<rest/>'
      : (() => {
          const fallback = spellPitch(note.pitch, fifths)
          const spelled = note.spelling ?? fallback
          const octave = note.spelling ? Math.floor(note.pitch / 12) - 1 : fallback.octave
          const alter = spelled.alter === 0 ? '' : `<alter>${spelled.alter}</alter>`
          return `<pitch><step>${spelled.step}</step>${alter}<octave>${octave}</octave></pitch>`
        })()
  const chord = note.chord ? '<chord/>' : ''
  const triplet =
    note.triplet == null
      ? ''
      : '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'
  const tie = note.tie ? `<tie type="${note.tie}"/>` : ''
  const notations: string[] = []
  if (note.tie) notations.push(`<tied type="${note.tie}"/>`)
  if (note.triplet === 'start') notations.push('<tuplet type="start" bracket="yes"/>')
  if (note.triplet === 'stop') notations.push('<tuplet type="stop"/>')
  if (note.finger != null && note.pitch != null) notations.push(`<technical><fingering>${note.finger}</fingering></technical>`)
  const notationXml = notations.length > 0 ? `<notations>${notations.join('')}</notations>` : ''
  const staffXml = staff == null ? '' : `<staff>${staff}</staff>`
  const voice = staff === 2 ? 2 : 1
  return `<note>${chord}${head}<duration>${note.ticks}</duration>${tie}<voice>${voice}</voice><type>${type}</type>${dotted ? '<dot/>' : ''}${triplet}${staffXml}${notationXml}</note>`
}

export function quarterBeats(time: TimeSignature): number {
  return time.beats * (4 / time.beatType)
}

export function measureTicks(time: TimeSignature): number {
  return Math.round(quarterBeats(time) * TICKS)
}

function attributes(score: WrittenScore): string {
  const clefs =
    score.clef === 'grand'
      ? '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>'
      : score.clef === 'bass'
        ? '<clef><sign>F</sign><line>4</line></clef>'
        : '<clef><sign>G</sign><line>2</line></clef>'
  return `<attributes><divisions>${TICKS}</divisions><key><fifths>${score.fifths}</fifths></key><time><beats>${score.time.beats}</beats><beat-type>${score.time.beatType}</beat-type></time>${clefs}</attributes>`
}

/** MusicXML plus the attacks a player must play. Rests and tie endings are not attacks. */
export function materialize(score: WrittenScore): { xml: string; notes: ScoreNote[] } {
  const perMeasure = measureTicks(score.time)
  const measures = new Map<number, WrittenNote[]>()
  for (const note of score.notes) {
    const list = measures.get(note.measure) ?? []
    list.push(note)
    measures.set(note.measure, list)
  }
  const numbers = [...measures.keys()].sort((a, b) => a - b)
  const attacks: ScoreNote[] = []
  let nextId = 1
  let measureStart = 0
  const bodies: string[] = []
  numbers.forEach((number, index) => {
    const notes = measures.get(number) ?? []
    const right = notes.filter((note) => note.hand === 'R')
    const left = notes.filter((note) => note.hand === 'L')
    const chunks: string[] = []
    if (index === 0) chunks.push(attributes(score))
    const writeStaff = (staffNotes: WrittenNote[], staff: number | null, hand: Hand) => {
      let local = 0
      let open: ScoreNote | null = null
      staffNotes.forEach((note, index) => {
        chunks.push(noteXml(note, score.fifths, staff))
        if (note.pitch != null && note.tie !== 'stop') {
          const attack: ScoreNote = {
            id: `t${nextId++}`,
            pitch: note.pitch,
            beat: measureStart + local / TICKS,
            duration: note.ticks / TICKS,
            hand,
            measure: number,
          }
          if (note.finger != null) attack.finger = note.finger
          attacks.push(attack)
          open = note.tie === 'start' ? attack : null
        } else if (note.tie === 'stop' && open && note.pitch === open.pitch) {
          open.duration += note.ticks / TICKS
          open = null
        }
        const next = staffNotes[index + 1]
        if (!next?.chord) local += note.ticks
      })
      if (local < perMeasure) chunks.push(noteXml({ pitch: null, ticks: perMeasure - local, hand, measure: number }, score.fifths, staff))
    }
    if (score.staves === 1) {
      const only = score.clef === 'bass' ? left.length > 0 ? left : right : right.length > 0 ? right : left
      const hand: Hand = only[0]?.hand ?? 'R'
      writeStaff(only, null, hand)
    } else {
      writeStaff(right, 1, 'R')
      chunks.push(`<backup><duration>${perMeasure}</duration></backup>`)
      writeStaff(left, 2, 'L')
    }
    bodies.push(`<measure number="${number}">${chunks.join('')}</measure>`)
    measureStart += perMeasure / TICKS
  })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${escapeXml(score.title)}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${bodies.join('')}</part>
</score-partwise>`
  return { xml, notes: attacks }
}

function escapeXml(value: string): string {
  return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char)
}

export function ticksOfHand(notes: readonly WrittenNote[], measure: number, hand: Hand): number {
  return notes.filter((note) => note.measure === measure && note.hand === hand).reduce((sum, note) => sum + note.ticks, 0)
}
