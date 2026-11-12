import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'

function groupByOnset(notes: ScoreNote[]): ScoreNote[][] {
  const sorted = [...notes].sort((a, b) => a.beat - b.beat || a.pitch - b.pitch || a.id.localeCompare(b.id))
  const groups: ScoreNote[][] = []
  for (const note of sorted) {
    const last = groups[groups.length - 1]
    if (!last || Math.abs(note.beat - last[0].beat) > 1e-3) groups.push([note])
    else last.push(note)
  }
  return groups
}

/** For each attack, the index of the first attack in the same measure. */
function measureStarts(groups: readonly ScoreNote[][]): number[] {
  const starts: number[] = []
  let start = 0
  let measure = groups[0]?.[0]?.measure ?? Number.NaN
  for (let index = 0; index < groups.length; index += 1) {
    const current = groups[index][0]?.measure ?? Number.NaN
    if (current !== measure) {
      measure = current
      start = index
    }
    starts.push(start)
  }
  return starts
}

export interface WaitModeOptions {
  /** On a wrong pitch, drop the current measure's hits and rewind to its first attack. */
  resetOnError?: boolean
}

/**
 * Wait mode: the cursor holds on the current attack until every pitch is played.
 * A wrong pitch is flagged and does not consume the written note, so the player
 * can try again. Timing is not scored.
 */
export class WaitMode {
  private readonly groups: ScoreNote[][]
  private readonly resetOnError: boolean
  private readonly measureStart: number[]
  private index = 0
  private readonly hit = new Set<string>()
  private readonly _judgements: Judgement[] = []
  /** Note ids whose hit was dropped by the last error reset, so the view can uncolor them. */
  private resetIds: string[] = []

  constructor(notes: ScoreNote[], options: WaitModeOptions = {}) {
    this.groups = groupByOnset(notes)
    this.resetOnError = options.resetOnError ?? false
    this.measureStart = measureStarts(this.groups)
  }

  get judgements(): readonly Judgement[] {
    return this._judgements
  }

  /** Ids un-hit by the most recent error reset. Cleared once read. */
  consumeReset(): string[] {
    const ids = this.resetIds
    this.resetIds = []
    return ids
  }

  done(): boolean {
    return this.index >= this.groups.length
  }

  cursorBeat(): number | null {
    return this.groups[this.index]?.[0]?.beat ?? null
  }

  currentNotes(): ScoreNote[] {
    const group = this.groups[this.index]
    if (!group) return []
    return group.filter((note) => !this.hit.has(note.id))
  }

  push(event: PlayedEvent): Judgement[] {
    if (event.type !== 'on') return []
    if (this.done()) {
      const extra: Judgement = { pitch: event.pitch, result: 'extra' }
      this._judgements.push(extra)
      return [extra]
    }
    const match = this.groups[this.index].find((note) => !this.hit.has(note.id) && note.pitch === event.pitch)
    if (match) {
      this.hit.add(match.id)
      const judgement: Judgement = { noteId: match.id, pitch: event.pitch, result: 'hit' }
      this._judgements.push(judgement)
      if (this.groups[this.index].every((note) => this.hit.has(note.id))) this.index += 1
      return [judgement]
    }
    const wrong: Judgement = { pitch: event.pitch, result: 'wrong' }
    this._judgements.push(wrong)
    if (this.resetOnError) this.rewindToMeasureStart()
    return [wrong]
  }

  advanceTo(_timeMs: number): Judgement[] {
    return []
  }

  /** Skip ahead one attack without marking the current one missed. */
  advance(): void {
    if (this.index < this.groups.length - 1) this.index += 1
  }

  /** Move to the previous attack. Hits on the attack you leave are dropped, so the report only keeps what you replay. */
  retreat(): void {
    if (this.index > 0 && this.groups[this.index]?.every((note) => !this.hit.has(note.id))) {
      this.index -= 1
    }
    const group = this.groups[this.index]
    if (!group) return
    const ids = new Set(group.map((note) => note.id))
    for (const note of group) this.hit.delete(note.id)
    for (let index = this._judgements.length - 1; index >= 0; index -= 1) {
      const item = this._judgements[index]
      if (item?.noteId && ids.has(item.noteId)) this._judgements.splice(index, 1)
    }
  }

  /**
   * Rewind to the first attack of the current measure. Hits made in the measure
   * are dropped so the player replays it. The wrong pitch itself stays recorded.
   */
  private rewindToMeasureStart(): void {
    const start = this.measureStart[this.index]
    if (start == null) return
    const ids = new Set<string>()
    for (let group = start; group <= this.index; group += 1) {
      for (const note of this.groups[group]) {
        if (this.hit.delete(note.id)) ids.add(note.id)
      }
    }
    if (ids.size === 0 && start === this.index) return
    for (let index = this._judgements.length - 1; index >= 0; index -= 1) {
      const item = this._judgements[index]
      if (item?.noteId && ids.has(item.noteId)) this._judgements.splice(index, 1)
    }
    this.index = start
    for (const id of ids) this.resetIds.push(id)
  }
}
