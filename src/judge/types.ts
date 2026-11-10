export type Hand = 'L' | 'R'

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
  /** Quarter notes from the start of this measure. */
  localBeat?: number
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
