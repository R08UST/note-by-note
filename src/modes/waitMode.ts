import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'

/** Optional marks the player may leave out. A grace note is optional in rhythm mode but waited for here. */
function isFree(note: ScoreNote): boolean {
  return Boolean(note.optional) && !note.fromGrace
}

function groupByOnset(notes: ScoreNote[]): ScoreNote[][] {
  // Sort by anchorBeat first so a grace note always stays in front of its written note
  // and never slips ahead of a fast subdivision at the end of the previous measure.
  const sorted = [...notes].sort(
    (a, b) =>
      (a.anchorBeat ?? a.beat) - (b.anchorBeat ?? b.beat) ||
      a.beat - b.beat ||
      a.pitch - b.pitch ||
      a.id.localeCompare(b.id),
  )
  const groups: ScoreNote[][] = []
  for (const note of sorted) {
    const last = groups[groups.length - 1]
    if (!last || Math.abs(note.beat - last[0].beat) > 1e-3 || note.measure !== last[0].measure) groups.push([note])
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
  /** Optional ornament and tremolo strikes accepted out of turn without blocking the cursor. */
  private readonly optionalMarks: ScoreNote[]
  private readonly resetOnError: boolean
  private readonly measureStart: number[]
  private index = 0
  private readonly hit = new Set<string>()
  private readonly _judgements: Judgement[] = []
  private readonly _hitTimes = new Map<string, number>()
  /** Note ids whose hit was dropped by the last error reset, so the view can uncolor them. */
  private resetIds: string[] = []

  constructor(notes: ScoreNote[], options: WaitModeOptions = {}) {
    const playable: ScoreNote[] = []
    const optional: ScoreNote[] = []
    for (const note of notes) {
      if (isFree(note)) optional.push(note)
      else playable.push(note)
    }
    this.groups = groupByOnset(playable)
    this.optionalMarks = optional.sort((a, b) => a.beat - b.beat || a.pitch - b.pitch || a.id.localeCompare(b.id))
    this.resetOnError = options.resetOnError ?? false
    this.measureStart = measureStarts(this.groups)
  }

  get judgements(): readonly Judgement[] {
    return this._judgements
  }

  /** Real event time (ms) of the latest hit on each written note, so the report can find hesitations. */
  get hitTimes(): ReadonlyMap<string, number> {
    return this._hitTimes
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
    const first = this.groups[this.index]?.[0]
    if (!first) return null
    // A grace strike sits a hair before its written note. The line holds on the
    // written notehead so the player can see which note the grace belongs to.
    return first.anchorBeat ?? first.beat
  }

  currentNotes(): ScoreNote[] {
    const group = this.groups[this.index]
    if (!group) return []
    return group.filter((note) => !this.hit.has(note.id))
  }

  /**
   * The group is finished once every note in it is hit. Optional ornament strikes
   * live outside `groups`, so every entry here is a written note or grace note that
   * the cursor waits for.
   */
  private groupDone(group: ScoreNote[]): boolean {
    return group.every((note) => this.hit.has(note.id))
  }

  push(event: PlayedEvent): Judgement[] {
    if (event.type !== 'on') return []
    if (this.done()) {
      const extra: Judgement = { pitch: event.pitch, result: 'extra' }
      this._judgements.push(extra)
      return [extra]
    }
    // Prefer the attack the cursor stands on. A strike a printed mark added can land
    // anywhere around the cursor: a mordent's lead-ins sit several groups before the
    // written note the line stands on, and a trill's alternations walk across the whole
    // note. Only the optional ones are accepted out of turn, so a written note is never
    // consumed by a key meant for another beat.
    const match = this.matchIn(this.groups[this.index], event.pitch) ?? this.matchMark(event.pitch)
    if (match) {
      this.hit.add(match.id)
      if (!match.optional) this._hitTimes.set(match.id, event.timeMs)
      const judgement: Judgement = { noteId: match.id, pitch: event.pitch, result: 'hit' }
      this._judgements.push(judgement)
      this.advancePastFinished()
      return [judgement]
    }
    // A tone already struck here is the same key pressed again, not a slip. A chord
    // is often played one hand first and both hands after, and that second press of
    // a tone still down must not drop the hits and send the line back a measure.
    if (this.struckOnCurrentAttack(event.pitch)) return []
    const measure = this.groups[this.index]?.[0]?.measure
    const wrong: Judgement = { pitch: event.pitch, result: 'wrong', ...(measure != null && { measure }) }
    this._judgements.push(wrong)
    if (this.resetOnError) this.rewindToMeasureStart()
    return [wrong]
  }

  private matchIn(group: ScoreNote[] | undefined, pitch: number): ScoreNote | undefined {
    return group?.find((note) => !this.hit.has(note.id) && note.pitch === pitch)
  }

  /**
   * Whether this pitch was already hit on the attack the cursor stands on, or on the
   * one it just left. When the chord completes on the last missing tone, the line
   * steps to the next attack before that same tone's key-up and re-strike arrive, so
   * both attacks count as "already played" instead of a wrong note.
   */
  private struckOnCurrentAttack(pitch: number): boolean {
    for (const group of [this.groups[this.index], this.groups[this.index - 1]]) {
      if (group?.some((note) => note.pitch === pitch && this.hit.has(note.id))) return true
    }
    return false
  }

  /**
   * A strike a printed mark added, anywhere in the score.
   *
   * These strikes are optional, so the cursor never waits on one and the line has
   * usually moved past the group it sits in by the time the player strikes it: a
   * mordent's lead-ins are several groups before the written note, and a trill's
   * alternations run across the whole note. Matching one is a hit and skipping one is
   * never a miss, so taking one wherever it is played cannot consume a written note
   * out of turn. A grace note is left out, because wait mode reads that small
   * notehead in its own order.
   */
  private matchMark(pitch: number): ScoreNote | undefined {
    return this.optionalMarks.find((note) => !this.hit.has(note.id) && note.pitch === pitch)
  }

  /** Step forward over every group whose required notes are all hit. */
  private advancePastFinished(): void {
    while (this.index < this.groups.length && this.groupDone(this.groups[this.index])) this.index += 1
  }

  advanceTo(_timeMs: number): Judgement[] {
    return []
  }

  /** Skip ahead one attack without marking the current one missed. */
  advance(): void {
    if (this.index < this.groups.length - 1) this.index += 1
    this.advancePastFinished()
  }

  /** Move to the previous attack. Hits on the attack you leave are dropped, so the report only keeps what you replay. */
  retreat(): void {
    const current = this.groups[this.index]
    // Nothing hit in the group the cursor stands on yet, so it is already the
    // attack to replay and stepping back would skip a group for nothing.
    if (this.index > 0 && current?.every((note) => !this.hit.has(note.id))) {
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
    const currentMeasure = this.groups[start]?.[0]?.measure
    if (currentMeasure != null) {
      const firstNote = this.groups[start][0]
      const firstBeat = firstNote.anchorBeat ?? firstNote.beat
      let nextGroup = start + 1
      while (nextGroup < this.groups.length && this.measureStart[nextGroup] === start) nextGroup += 1
      const nextNote = this.groups[nextGroup]?.[0]
      const nextBeat = nextNote ? (nextNote.anchorBeat ?? nextNote.beat) : Number.POSITIVE_INFINITY
      for (const note of this.optionalMarks) {
        if (
          note.measure === currentMeasure &&
          note.beat >= firstBeat - 0.5 &&
          note.beat < nextBeat &&
          this.hit.delete(note.id)
        ) {
          ids.add(note.id)
        }
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
