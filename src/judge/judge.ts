import {
  BEGINNER_TOLERANCE,
  type JudgeOptions,
  type Judgement,
  type PlayedEvent,
  type ScoreNote,
} from './types'

export interface NoteWindow {
  note: ScoreNote
  expectedMs: number
  earlyMs: number
  lateMs: number
}

export interface ResolvedJudgeOptions {
  bpm: number
  earlyMs: number
  lateMs: number
  chordSpreadMs: number
  neighborFraction: number
  latencyOffsetMs: number
}

/**
 * Narrowest a window may become once a close neighbour shrinks it. A window under
 * this is smaller than the jitter of a real key press and of the MIDI timestamp,
 * so a correctly played short note would be scored a miss for being short. Windows
 * may overlap at this width; the judge resolves that in time order, earliest first.
 */
export const MIN_WINDOW_MS = 60

export function resolveJudgeOptions(options: JudgeOptions): ResolvedJudgeOptions {
  if (!(options.bpm > 0)) throw new Error('BPM must be greater than zero')
  return {
    bpm: options.bpm,
    earlyMs: options.earlyMs ?? BEGINNER_TOLERANCE.earlyMs,
    lateMs: options.lateMs ?? BEGINNER_TOLERANCE.lateMs,
    chordSpreadMs: options.chordSpreadMs ?? BEGINNER_TOLERANCE.chordSpreadMs,
    neighborFraction: options.neighborFraction ?? BEGINNER_TOLERANCE.neighborFraction,
    latencyOffsetMs: options.latencyOffsetMs ?? 0,
  }
}

export function beatToMs(beat: number, bpm: number): number {
  return (beat * 60_000) / bpm
}

/** The window a neighbour gap allows, never narrower than `MIN_WINDOW_MS`. */
function neighborWindow(fraction: number, gap: number): number {
  return Math.max(MIN_WINDOW_MS, fraction * gap)
}

/**
 * Window around each note: the fixed early/late tolerance, tightened to
 * `neighborFraction` of the gap to the nearest note that is not part of the
 * same chord. Notes within `chordSpreadMs` share an attack and do not shrink
 * each other (so a chord rolled by ~50ms still fits).
 */
export function computeWindows(notes: ScoreNote[], options: JudgeOptions): NoteWindow[] {
  const resolved = resolveJudgeOptions(options)
  const ordered = notes.map((note, index) => ({
    note,
    index,
    expectedMs: beatToMs(note.beat, resolved.bpm),
  }))
  ordered.sort((a, b) => a.expectedMs - b.expectedMs || a.index - b.index)

  return ordered.map((entry, index) => {
    let prevGap = Number.POSITIVE_INFINITY
    for (let i = index - 1; i >= 0; i--) {
      const gap = entry.expectedMs - ordered[i].expectedMs
      if (gap > resolved.chordSpreadMs) {
        prevGap = gap
        break
      }
    }
    let nextGap = Number.POSITIVE_INFINITY
    for (let i = index + 1; i < ordered.length; i++) {
      const gap = ordered[i].expectedMs - entry.expectedMs
      if (gap > resolved.chordSpreadMs) {
        nextGap = gap
        break
      }
    }
    const earlyMs = Number.isFinite(prevGap)
      ? Math.min(resolved.earlyMs, neighborWindow(resolved.neighborFraction, prevGap))
      : resolved.earlyMs
    const lateMs = Number.isFinite(nextGap)
      ? Math.min(resolved.lateMs, neighborWindow(resolved.neighborFraction, nextGap))
      : resolved.lateMs
    return { note: entry.note, expectedMs: entry.expectedMs, earlyMs, lateMs }
  })
}

interface OpenNote extends NoteWindow {
  matched: boolean
}

/**
 * Pure rhythm judge. Feed note-on events in time order, and call `advanceTo`
 * with the score clock to close windows that have passed.
 */
export class Judge {
  private readonly options: ResolvedJudgeOptions
  private readonly open: OpenNote[]
  private readonly _judgements: Judgement[] = []

  constructor(notes: ScoreNote[], options: JudgeOptions) {
    this.options = resolveJudgeOptions(options)
    this.open = computeWindows(notes, options).map((window) => ({ ...window, matched: false }))
  }

  get judgements(): readonly Judgement[] {
    return this._judgements
  }

  /** Notes still waiting, at the earliest remaining attack (a chord stays together). */
  upcoming(): ScoreNote[] {
    const pending = this.open.filter((note) => !note.matched && !note.note.optional)
    if (pending.length === 0) return []
    const onset = pending[0].expectedMs
    return pending
      .filter((note) => note.expectedMs - onset <= this.options.chordSpreadMs)
      .map((note) => note.note)
  }

  /** Finished once every required strike is accounted for. An optional one may remain. */
  done(): boolean {
    return this.open.every((note) => note.matched || note.note.optional)
  }

  push(event: PlayedEvent): Judgement[] {
    if (event.type !== 'on') return []
    const timeMs = event.timeMs - this.options.latencyOffsetMs
    const produced = this.closeBefore(timeMs)

    const waiting = this.open.filter(
      (note) =>
        !note.matched &&
        timeMs >= note.expectedMs - note.earlyMs &&
        timeMs <= note.expectedMs + note.lateMs,
    )
    const samePitch = waiting.filter((note) => note.note.pitch === event.pitch)
    if (samePitch.length > 0) {
      const hit = samePitch[0]
      hit.matched = true
      produced.push({
        noteId: hit.note.id,
        pitch: event.pitch,
        result: 'hit',
        offsetMs: timeMs - hit.expectedMs,
      })
    } else if (waiting.length > 0) {
      const wrong = waiting[0]
      wrong.matched = true
      produced.push({
        noteId: wrong.note.id,
        pitch: event.pitch,
        result: 'wrong',
        offsetMs: timeMs - wrong.expectedMs,
      })
    } else {
      produced.push({ pitch: event.pitch, result: 'extra' })
    }

    this._judgements.push(...produced)
    return produced
  }

  /** Mark every still-open note whose late window ended before `timeMs` as a miss. */
  advanceTo(timeMs: number): Judgement[] {
    const produced = this.closeBefore(timeMs)
    this._judgements.push(...produced)
    return produced
  }

  private closeBefore(timeMs: number): Judgement[] {
    const produced: Judgement[] = []
    for (const note of this.open) {
      if (note.matched) continue
      // A strike a printed mark adds is never a miss: leaving it out is a valid
      // reading of the sheet, so its window simply lapses.
      if (note.note.optional && note.expectedMs + note.lateMs < timeMs) {
        note.matched = true
        continue
      }
      if (note.expectedMs + note.lateMs < timeMs) {
        note.matched = true
        produced.push({ noteId: note.note.id, pitch: note.note.pitch, result: 'miss' })
      }
    }
    return produced
  }
}

export function isOnTime(offsetMs: number, perfectMs: number = BEGINNER_TOLERANCE.perfectMs): boolean {
  return Math.abs(offsetMs) <= perfectMs
}
