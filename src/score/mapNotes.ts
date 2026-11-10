import type { Hand, ScoreNote } from '../judge/types'

/** One drawn notehead. Tied notes are separate heads that share one judged attack. */
export interface GraphicHead {
  key: string
  pitch: number
  measure: number
  voice: string
  /** Quarter notes from the start of the measure. */
  localBeat: number
  hand: Hand | null
  grace: boolean
  cue: boolean
  /** Later heads of the same tie, in order. */
  tieTails: string[]
}

/** A judged note whose measure was never engraved, so the player cannot see it. */
export const UNDRAWN_MEASURE = '谱上没有这一小节'

export interface UnmatchedNote {
  id: string
  measure: number
  pitch: number
  voice: string
  reason: string
}

export interface NoteMap {
  /** Judged notes that have at least the tie-start head. */
  matched: number
  /** Judged note id → graphic keys to color, including tie tails. */
  heads: Map<string, string[]>
  unmatched: UnmatchedNote[]
}

function roundBeat(beat: number): number {
  // Snap to the nearest 64th note. That is finer than a triplet and absorbs
  // binary noise such as 3.0312499999999982 versus 3.03125.
  return Math.round(beat * 64)
}

function voiceOf(note: ScoreNote): string {
  return note.voice ?? ''
}

function localOf(note: ScoreNote): number {
  return roundBeat(note.localBeat ?? note.beat)
}

/**
 * Pair judged attacks with drawn heads by measure, voice, timestamp and pitch.
 * A second identical chord tone or voice keeps its own head. Tie tails are
 * colored with the attack, and a grace or cue head is only used when the
 * printed note is not on the beat.
 */
export function mapNotesToHeads(notes: readonly ScoreNote[], heads: readonly GraphicHead[]): NoteMap {
  const buckets = new Map<string, GraphicHead[]>()
  for (const head of heads) {
    const key = `${head.measure}|${head.voice}|${roundBeat(head.localBeat)}|${head.pitch}`
    const list = buckets.get(key) ?? []
    list.push(head)
    buckets.set(key, list)
  }
  const used = new Set<string>()
  const result: NoteMap = { matched: 0, heads: new Map(), unmatched: [] }

  const take = (head: GraphicHead | undefined): GraphicHead | undefined => {
    if (!head || used.has(head.key)) return undefined
    used.add(head.key)
    return head
  }

  for (const note of notes) {
    const voice = voiceOf(note)
    const exact = `${note.measure}|${voice}|${localOf(note)}|${note.pitch}`
    const pool = buckets.get(exact) ?? []
    let head = take(pool.find((item) => !item.grace && !item.cue && !used.has(item.key)))
    if (!head) head = take(pool.find((item) => !used.has(item.key)))
    if (!head && voice) {
      const anyVoice = heads.filter(
        (item) =>
          !used.has(item.key) &&
          item.measure === note.measure &&
          item.pitch === note.pitch &&
          roundBeat(item.localBeat) === localOf(note),
      )
      head = take(anyVoice.find((item) => !item.grace && !item.cue)) ?? take(anyVoice[0])
    }
    if (!head) {
      result.unmatched.push({
        id: note.id,
        measure: note.measure,
        pitch: note.pitch,
        voice,
        reason: reasonFor(note, heads),
      })
      continue
    }
    const keys = [head.key]
    for (const tail of head.tieTails) {
      if (used.has(tail)) continue
      used.add(tail)
      keys.push(tail)
    }
    result.heads.set(note.id, keys)
    result.matched += 1
  }
  return result
}

function reasonFor(note: ScoreNote, heads: readonly GraphicHead[]): string {
  const voice = voiceOf(note)
  const samePitch = heads.filter((head) => head.measure === note.measure && head.pitch === note.pitch)
  if (samePitch.length === 0) {
    const inMeasure = heads.some((head) => head.measure === note.measure)
    return inMeasure ? '本小节没有这个音高' : UNDRAWN_MEASURE
  }
  const sameTime = samePitch.filter((head) => roundBeat(head.localBeat) === localOf(note))
  if (sameTime.length === 0) return '时值对不上'
  if (voice && sameTime.every((head) => head.voice !== voice)) return '声部对不上'
  if (sameTime.every((head) => head.grace)) return '只有倚音，没有本音'
  if (sameTime.every((head) => head.cue)) return '只有提示音'
  return '同一个位置的音已经标过了'
}

export function unmatchedSummary(unmatched: readonly UnmatchedNote[]): string {
  const counts = new Map<string, number>()
  for (const item of unmatched) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason} ${count}`)
    .join('，')
}
