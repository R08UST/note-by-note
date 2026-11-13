export type Hand = 'L' | 'R'

/** A printed articulation. Accent and marcato also raise the loudness. */
export type Articulation = 'staccato' | 'tenuto' | 'accent' | 'marcato' | 'portato'

export type OrnamentKind = 'trill' | 'mordent' | 'inverted-mordent' | 'turn'

/** A printed ornament, with the neighbours the key signature makes diatonic. */
export interface Ornament {
  kind: OrnamentKind
  /** Scale step above the written pitch. */
  upper: number
  /** Scale step below the written pitch. */
  lower: number
}

/** A note the player is expected to strike. Time is in quarter-note beats from the start. */
export interface ScoreNote {
  id: string
  /** MIDI note number. Middle C (C4) is 60. */
  pitch: number
  beat: number
  /** Sounding length in quarter-note beats. Tied continuations are already merged in. */
  duration: number
  hand: Hand
  measure: number
  /** MusicXML voice number. Empty when the file did not say. */
  voice?: string
  /** MusicXML staff number, so a dynamic printed on one staff can stay on it. */
  staff?: number
  /** Quarter notes from the start of this measure. */
  localBeat?: number
  /** Printed articulation. Playback shortens staccato and lifts accent. */
  articulation?: Articulation
  /** Id of the slur this note sits under, so a slurred note can be held to the next. */
  slur?: number
  /** Printed fermata: the demo holds the note past its written value. */
  fermata?: boolean
  /** Grace notes printed just before this one, low to high. They are not judged. */
  graces?: number[]
  /** Printed ornament. The demo plays it out; judging ignores it. */
  ornament?: Ornament
}

export interface PlayedEvent {
  pitch: number
  velocity: number
  /** Milliseconds on the transport / score clock, not the moment the handler ran. */
  timeMs: number
  type: 'on' | 'off'
}

export type JudgementResult = 'hit' | 'wrong' | 'miss' | 'extra'

export interface Judgement {
  noteId?: string
  /** Played pitch for hit, wrong, and extra. Expected pitch for a miss. */
  pitch: number
  result: JudgementResult
  /** Played time minus expected time. Negative is early, positive is late. */
  offsetMs?: number
}

/** Beginner timing defaults used by the judge and the rhythm-mode copy. */
export const BEGINNER_TOLERANCE = {
  earlyMs: 200,
  lateMs: 250,
  perfectMs: 80,
  chordSpreadMs: 50,
  neighborFraction: 0.4,
} as const

export interface JudgeOptions {
  bpm: number
  earlyMs?: number
  lateMs?: number
  chordSpreadMs?: number
  neighborFraction?: number
  /** Subtracted from played event times. Positive means "the device timestamp arrives late". */
  latencyOffsetMs?: number
}
