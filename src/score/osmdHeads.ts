import type { GraphicalNote } from 'opensheetmusicdisplay'
import type { Hand } from '../judge/types'
import { osmdHalfToneToMidi } from './osmdPitch'
import type { GraphicHead } from './mapNotes'

interface FractionLike {
  RealValue: number
}

interface OsmdEntry {
  IsGrace: boolean
  Timestamp: FractionLike
  ParentVoice: { VoiceId: number }
  Notes: OsmdNote[]
}

interface OsmdNote {
  halfTone: number
  IsCueNote: boolean
  PrintObject: boolean
  isRest(): boolean
  NoteTie?: { StartNote: OsmdNote; Notes: OsmdNote[] }
  ParentVoiceEntry: OsmdEntry
  SourceMeasure: { MeasureNumber: number; MeasureNumberXML?: number }
  ParentStaff?: { Id: number }
}

export interface CollectedHeads {
  heads: GraphicHead[]
  graphics: Map<string, GraphicalNote>
}

function handOf(staffId: number | undefined): Hand | null {
  if (staffId == null) return null
  return staffId <= 1 ? 'R' : 'L'
}

function voiceOf(note: OsmdNote): string {
  return String(note.ParentVoiceEntry?.ParentVoice?.VoiceId ?? '')
}

/** Every drawn head in the sheet, including other voices, ties, grace notes and cue notes. */
export function collectHeads(
  sheet: {
    Instruments?: { Voices: { VoiceEntries: OsmdEntry[] }[] }[]
    SourceMeasures?: { MeasureNumberXML?: number }[]
  },
  gnote: (note: OsmdNote) => GraphicalNote | undefined,
): CollectedHeads {
  const heads: GraphicHead[] = []
  const graphics = new Map<string, GraphicalNote>()
  const keys = new Map<OsmdNote, string>()
  let next = 0
  const keyOf = (note: OsmdNote): string => {
    const existing = keys.get(note)
    if (existing) return existing
    const key = `g${next}`
    next += 1
    keys.set(note, key)
    const drawn = gnote(note)
    if (drawn) graphics.set(key, drawn)
    return key
  }

  // An alternate ending is written as `number="X1"`, which has no numeric form. The parser numbers
  // such a bar by its position, so OSMD's own counter (which skips a bar before the first ending and
  // then runs one behind) cannot be used: the same printed bar would get two different numbers and the
  // heads in it would never be found. Positions are mapped here the same way the parser maps them.
  const measures = sheet.SourceMeasures ?? []
  const firstRaw = measures[0]?.MeasureNumberXML
  const endingOffset = firstRaw != null && Number(firstRaw) === 0 ? 0 : 1
  const positions = new Map<object, number>()
  measures.forEach((measure, index) => positions.set(measure, index + endingOffset))
  const measureOf = (note: OsmdNote): number => {
    const source = note.SourceMeasure
    if (!source) return 0
    const written = source.MeasureNumberXML
    if (written != null && Number.isFinite(Number(written))) return Number(written)
    return positions.get(source) ?? source.MeasureNumber ?? 0
  }

  for (const instrument of sheet.Instruments ?? []) {
    for (const voice of instrument.Voices ?? []) {
      for (const entry of voice.VoiceEntries ?? []) {
        for (const note of entry.Notes ?? []) {
          if (!note || note.PrintObject === false || note.isRest()) continue
          const tie = note.NoteTie
          const voice = String(entry.ParentVoice?.VoiceId ?? '')
          // A tie continuation is not a separate attack, so only its start is a head. The one
          // exception is a tie that jumps voices: OSMD merges the two printed heads into one tie,
          // but the parser only joins a tie stop to a start in the same voice, so the printed
          // note would otherwise be a judged attack with no head to color.
          if (tie && tie.StartNote !== note && String(tie.StartNote?.ParentVoiceEntry?.ParentVoice?.VoiceId ?? '') === voice) continue
          const key = keyOf(note)
          const later = tie?.Notes ?? []
          const from = Math.max(0, later.indexOf(note) + 1)
          // Only the later heads of the same voice are this attack's continuation. A tie that
          // crosses into another voice is drawn as one tie by OSMD, but that voice's head is its
          // own printed note and has to stay free for it.
          const tails = later
            .slice(from)
            .filter((item) => item !== note && voiceOf(item) === voice)
            .map((item) => keyOf(item))
          heads.push({
            key,
            pitch: osmdHalfToneToMidi(note.halfTone),
            measure: measureOf(note),
            voice,
            localBeat: (entry.Timestamp?.RealValue ?? 0) * 4,
            hand: handOf(note.ParentStaff?.Id),
            grace: Boolean(entry.IsGrace),
            cue: Boolean(note.IsCueNote),
            tieTails: tails,
          })
        }
      }
    }
  }
  return { heads, graphics }
}
