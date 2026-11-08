import { Judge } from '../judge/judge'
import type { JudgeOptions, Judgement, PlayedEvent, ScoreNote } from '../judge/types'

/** Rhythm mode: the score clock moves, and each note is judged inside its window. */
export class RhythmMode {
  private readonly judge: Judge

  constructor(notes: ScoreNote[], options: JudgeOptions) {
    this.judge = new Judge(notes, options)
  }

  get judgements(): readonly Judgement[] {
    return this.judge.judgements
  }

  done(): boolean {
    return this.judge.done()
  }

  currentNotes(): ScoreNote[] {
    return this.judge.upcoming()
  }

  cursorBeat(): number | null {
    return this.judge.upcoming()[0]?.beat ?? null
  }

  push(event: PlayedEvent): Judgement[] {
    return this.judge.push(event)
  }

  advanceTo(timeMs: number): Judgement[] {
    return this.judge.advanceTo(timeMs)
  }
}
