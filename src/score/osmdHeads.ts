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

/** Every drawn head in the sheet, including other voices, ties, grace notes and cue notes. */
export function collectHeads(sheet: { Instruments?: { Voices: { VoiceEntries: OsmdEntry[] }[] }[] }, gnote: (note: OsmdNote) => GraphicalNote | undefined): CollectedHeads {
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

  for (const instrument of sheet.Instruments ?? []) {
    for (const voice of instrument.Voices ?? []) {
      for (const entry of voice.VoiceEntries ?? []) {
        for (const note of entry.Notes ?? []) {
          if (!note || note.PrintObject === false || note.isRest()) continue
          const tie = note.NoteTie
          if (tie && tie.StartNote !== note) continue
          const key = keyOf(note)
          const tails = (tie?.Notes ?? []).filter((item) => item !== note).map((item) => keyOf(item))
          heads.push({
            key,
            pitch: osmdHalfToneToMidi(note.halfTone),
            measure: note.SourceMeasure?.MeasureNumberXML ?? note.SourceMeasure?.MeasureNumber ?? 0,
            voice: String(entry.ParentVoice?.VoiceId ?? ''),
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
