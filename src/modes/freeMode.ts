import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'

/** Grace and ornament strikes stay optional so they never block free-tempo flow. */
function isOptionalMark(note: ScoreNote): boolean {
  return Boolean(note.optional)
}

function groupByOnset(notes: ScoreNote[]): ScoreNote[][] {
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

/** Short window inside which a repeated press of an already-hit chord tone is treated as bounce. */
const BOUNCE_MS = 80
/** Window inside which a stray key on a partially hit chord stays on the chord instead of advancing. */
const CHORD_SETTLE_MS = 60
/** Window after completing a chord in which a lingering re-strike of its tone is ignored. */
const PREV_CHORD_BOUNCE_MS = 120
/** Maximum number of attacks ahead that score following may jump to recover from slips. */
const MAX_LOOKAHEAD = 4

/**
 * Free-tempo mode: the player sets their own pace with no fixed clock or metronome.
 * Unlike wait mode, a slip or missed chord tone does not freeze the cursor: playing
 * an upcoming attack advances past the missed notes and keeps recording real timestamps
 * so fluency and proportional rhythm stability can be evaluated afterwards.
 */
export class FreeMode {
  private readonly groups: ScoreNote[][]
  private readonly optionalMarks: ScoreNote[]
  private index = 0
  private readonly hit = new Set<string>()
  private readonly _hitTimes = new Map<string, number>()
  private readonly _judgements: Judgement[] = []
  private wrongsAtCurrent = 0

  constructor(notes: ScoreNote[]) {
    const playable: ScoreNote[] = []
    const optional: ScoreNote[] = []
    for (const note of notes) {
      if (isOptionalMark(note)) optional.push(note)
      else playable.push(note)
    }
    this.groups = groupByOnset(playable)
    this.optionalMarks = optional.sort((a, b) => a.beat - b.beat || a.pitch - b.pitch || a.id.localeCompare(b.id))
  }

  get judgements(): readonly Judgement[] {
    return this._judgements
  }

  /** Real event timestamps (ms) recorded for each hit written note. */
  get hitTimes(): ReadonlyMap<string, number> {
    return this._hitTimes
  }

  done(): boolean {
    return this.index >= this.groups.length
  }

  cursorBeat(): number | null {
    const first = this.groups[this.index]?.[0]
    if (!first) return null
    return first.anchorBeat ?? first.beat
  }

  currentNotes(): ScoreNote[] {
    const group = this.groups[this.index]
    if (!group) return []
    return group.filter((note) => !this.hit.has(note.id))
  }

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

    const currentGroup = this.groups[this.index]
    const currentBeat = currentGroup[0].beat

    // 1. Prefer an unhit note on the current attack.
    const direct = this.matchIn(currentGroup, event.pitch)
    if (direct) {
      this.recordHit(direct, event.timeMs)
      const judgement: Judgement = { noteId: direct.id, pitch: event.pitch, result: 'hit' }
      this._judgements.push(judgement)
      this.advancePastFinished()
      return [judgement]
    }

    // 2. Ignore an immediate key bounce of a pitch already hit in the current chord.
    if (this.recentHitIn(currentGroup, event.pitch, event.timeMs, BOUNCE_MS)) return []

    // 3. Optional lead-in or grace strike sitting at or before the current beat.
    const leadIn = this.matchOptional(event.pitch, currentBeat - 1.5, currentBeat + 0.25)
    if (leadIn) {
      this.hit.add(leadIn.id)
      const judgement: Judgement = { noteId: leadIn.id, pitch: event.pitch, result: 'hit' }
      this._judgements.push(judgement)
      return [judgement]
    }

    // 4. Non-blocking lookahead: allow advancing past a missed note or incomplete chord.
    const inChordSettle = this.isSettlingChord(currentGroup, event.timeMs)
    if (!inChordSettle) {
      const maxOffset = Math.min(MAX_LOOKAHEAD, 1 + this.wrongsAtCurrent)
      for (let offset = 1; offset <= maxOffset; offset += 1) {
        const targetGroup = this.groups[this.index + offset]
        if (!targetGroup) break
        const ahead = this.matchIn(targetGroup, event.pitch)
        if (!ahead) continue
        const produced: Judgement[] = []
        for (let skipped = this.index; skipped < this.index + offset; skipped += 1) {
          for (const missed of this.groups[skipped]) {
            if (this.hit.has(missed.id)) continue
            const miss: Judgement = { noteId: missed.id, pitch: missed.pitch, result: 'miss' }
            this._judgements.push(miss)
            produced.push(miss)
          }
        }
        this.index += offset
        this.wrongsAtCurrent = 0
        this.recordHit(ahead, event.timeMs)
        const hit: Judgement = { noteId: ahead.id, pitch: event.pitch, result: 'hit' }
        this._judgements.push(hit)
        produced.push(hit)
        this.advancePastFinished()
        return produced
      }
    }

    // 5. Ignore a lingering re-strike from the chord that was just completed or is being held.
    if (
      this.recentHitIn(currentGroup, event.pitch, event.timeMs, PREV_CHORD_BOUNCE_MS) ||
      this.recentHitIn(this.groups[this.index - 1], event.pitch, event.timeMs, PREV_CHORD_BOUNCE_MS)
    ) {
      return []
    }

    // 6. Trailing optional mark (e.g. trill alternation across the previous written note).
    const trailing = this.matchOptional(event.pitch, currentBeat - 4, currentBeat + 0.5)
    if (trailing) {
      this.hit.add(trailing.id)
      const judgement: Judgement = { noteId: trailing.id, pitch: event.pitch, result: 'hit' }
      this._judgements.push(judgement)
      return [judgement]
    }

    // 7. Otherwise flag a wrong key on the current measure without rewinding.
    const measure = currentGroup[0]?.measure
    const wrong: Judgement = { pitch: event.pitch, result: 'wrong', ...(measure != null && { measure }) }
    this._judgements.push(wrong)
    this.wrongsAtCurrent += 1
    return [wrong]
  }

  private recordHit(note: ScoreNote, timeMs: number): void {
    this.hit.add(note.id)
    this._hitTimes.set(note.id, timeMs)
  }

  private matchIn(group: ScoreNote[] | undefined, pitch: number): ScoreNote | undefined {
    return group?.find((note) => !this.hit.has(note.id) && note.pitch === pitch)
  }

  private matchOptional(pitch: number, minBeat: number, maxBeat: number): ScoreNote | undefined {
    return this.optionalMarks.find(
      (note) => !this.hit.has(note.id) && note.pitch === pitch && note.beat >= minBeat && note.beat <= maxBeat,
    )
  }

  private recentHitIn(group: ScoreNote[] | undefined, pitch: number, timeMs: number, windowMs: number): boolean {
    if (!group) return false
    return group.some((note) => {
      if (note.pitch !== pitch || !this.hit.has(note.id)) return false
      const prev = this._hitTimes.get(note.id)
      return prev != null && Math.abs(timeMs - prev) < windowMs
    })
  }

  /** True when the player just struck part of a multi-note chord and is still landing the rest of it. */
  private isSettlingChord(group: ScoreNote[], timeMs: number): boolean {
    if (group.length <= 1) return false
    let latest = Number.NEGATIVE_INFINITY
    for (const note of group) {
      if (!this.hit.has(note.id)) continue
      const t = this._hitTimes.get(note.id)
      if (t != null && t > latest) latest = t
    }
    return latest !== Number.NEGATIVE_INFINITY && timeMs - latest < CHORD_SETTLE_MS
  }

  private advancePastFinished(): void {
    const start = this.index
    while (this.index < this.groups.length && this.groupDone(this.groups[this.index])) this.index += 1
    if (this.index !== start) this.wrongsAtCurrent = 0
  }

  advanceTo(_timeMs: number): Judgement[] {
    return []
  }

  /** Skip ahead one attack without marking the current one missed. */
  advance(): void {
    if (this.index < this.groups.length - 1) {
      this.index += 1
      this.wrongsAtCurrent = 0
    }
    this.advancePastFinished()
  }

  /** Move to the previous attack and drop its hits and timestamps so the player can replay it. */
  retreat(): void {
    const current = this.groups[this.index]
    if (this.index > 0 && current?.every((note) => !this.hit.has(note.id))) {
      this.index -= 1
    }
    const group = this.groups[this.index]
    if (!group) return
    this.wrongsAtCurrent = 0
    const ids = new Set(group.map((note) => note.id))
    for (const note of group) {
      this.hit.delete(note.id)
      this._hitTimes.delete(note.id)
    }
    for (let index = this._judgements.length - 1; index >= 0; index -= 1) {
      const item = this._judgements[index]
      if (item?.noteId && ids.has(item.noteId)) this._judgements.splice(index, 1)
    }
  }
}
