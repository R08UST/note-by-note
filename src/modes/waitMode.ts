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

/**
 * Wait mode: the cursor holds on the current attack until every pitch is played.
 * A wrong pitch is flagged and does not consume the written note, so the player
 * can try again. Timing is not scored.
 */
export class WaitMode {
  private readonly groups: ScoreNote[][]
  private index = 0
  private readonly hit = new Set<string>()
  private readonly _judgements: Judgement[] = []

  constructor(notes: ScoreNote[]) {
    this.groups = groupByOnset(notes)
  }

  get judgements(): readonly Judgement[] {
    return this._judgements
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
    return [wrong]
  }

  advanceTo(_timeMs: number): Judgement[] {
    return []
  }
}
