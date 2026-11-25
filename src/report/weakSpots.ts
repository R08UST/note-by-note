import type { Hand } from '../judge/types'
import type { FreeTempoMeasure } from './freeTempo'
import type { MeasureReport, RunSummary } from './summary'

export type WeakKind = 'stall' | 'wrong' | 'slow' | 'uneven' | 'timing'

export interface WeakSpot {
  measure: number
  /** The problem that weighs most in this measure. */
  kind: WeakKind
  /** Hand the main problem belongs to. Null when both hands share it or it cannot tell. */
  hand: Hand | null
  /** Short Chinese phrases, most important first. */
  reasons: string[]
  score: number
}

/** A measure this much slower than the run's own tempo counts as slowing down. */
export const SLOW_PCT = 15
/** A measure whose smooth steps deviate this much from the local pulse counts as uneven. */
export const UNEVEN_PCT = 20
/** Timed hits outside the perfect window, per measure, before timing counts as a weak spot. */
export const OFF_TIME_MIN = 2

const HAND_ZH: Record<Hand, string> = { L: '左手', R: '右手' }

interface Part {
  kind: WeakKind
  hand: Hand | null
  score: number
  text: string
}

function errorPart(m: MeasureReport): Part | null {
  if (m.errors <= 0) return null
  const left = m.left ?? 0
  const right = m.right ?? 0
  const hand: Hand | null = left > 0 && right === 0 ? 'L' : right > 0 && left === 0 ? 'R' : null
  const text = hand
    ? `${HAND_ZH[hand]}错 ${m.errors} 个音`
    : left > 0 && right > 0
      ? `错 ${m.errors} 个音（左 ${left} 右 ${right}）`
      : `错 ${m.errors} 个音`
  return { kind: 'wrong', hand, score: m.errors, text }
}

function stallPart(t: FreeTempoMeasure): Part | null {
  if (t.stalls <= 0) return null
  const where = t.pauseBeat != null ? `第 ${t.pauseBeat} 拍前` : ''
  const who = t.pauseHand ? `（${HAND_ZH[t.pauseHand]}）` : ''
  const more = t.stalls > 1 ? `，共卡 ${t.stalls} 次` : ''
  return {
    kind: 'stall',
    hand: t.pauseHand,
    score: t.stalls * 3 + t.pauseMs / 1000,
    text: `${where}${who}停了 ${(t.pauseMs / 1000).toFixed(1)} 秒${more}`,
  }
}

function timingPart(m: MeasureReport): Part | null {
  const off = m.offTime ?? 0
  if (off < OFF_TIME_MIN) return null
  const offset = m.meanOffsetMs ?? 0
  const lean = Math.abs(offset) >= 60 ? `，平均偏${offset > 0 ? '晚' : '早'} ${Math.round(Math.abs(offset))} ms` : ''
  return { kind: 'timing', hand: null, score: off * 0.7, text: `${off} 个音没踩准拍${lean}` }
}

/**
 * Rank the measures that most need practice in any mode. Wrong and missed notes count
 * everywhere; free-tempo runs add stalls, slowing down, and uneven rhythm; wait-mode runs
 * add where the player hesitated; rhythm-mode runs add notes that missed the beat.
 */
export function findWeakSpots(summary: RunSummary, limit = 5): WeakSpot[] {
  const tempo = summary.freeTempo ?? summary.flow
  const tempoBy = new Map(tempo?.perMeasure.map((item) => [item.measure, item]) ?? [])
  // Slowing down and uneven rhythm only mean something when the player sets a steady pace.
  const paced = Boolean(summary.freeTempo?.bpm)
  const spots: WeakSpot[] = []
  for (const m of summary.errorsPerMeasure) {
    const t = tempo?.bpm != null ? tempoBy.get(m.measure) : undefined
    const parts: Part[] = []
    const error = errorPart(m)
    if (error) parts.push(error)
    const stall = t && stallPart(t)
    if (stall) parts.push(stall)
    const slow = paced && t?.slowPct != null && t.slowPct >= SLOW_PCT
    if (slow) parts.push({ kind: 'slow', hand: null, score: (t?.slowPct ?? 0) / 10, text: `比平时慢 ${t?.slowPct}%` })
    // A tempo shift drags the local pulse behind it, so a slow measure also reads as uneven; count it once.
    if (paced && !slow && t?.unevenPct != null && t.unevenPct >= UNEVEN_PCT) {
      parts.push({ kind: 'uneven', hand: null, score: t.unevenPct / 15, text: `节奏不均 ${t.unevenPct}%` })
    }
    const timing = timingPart(m)
    if (timing) parts.push(timing)
    if (parts.length === 0) continue
    parts.sort((a, b) => b.score - a.score)
    spots.push({
      measure: m.measure,
      kind: parts[0].kind,
      hand: parts[0].hand,
      reasons: parts.map((part) => part.text),
      score: parts.reduce((sum, part) => sum + part.score, 0),
    })
  }
  return spots.sort((a, b) => b.score - a.score || a.measure - b.measure).slice(0, limit)
}

const ADVICE: Record<WeakKind, string> = {
  stall: '卡顿最多：多半是读谱或找键跟不上。先用等待模式把这几小节弹熟，再回来连着弹。',
  wrong: '错音最多：先单手慢弹这几小节，看清每个音再合手。',
  slow: '一到这几小节就放慢：手指还不熟。单独循环它们，直到和前后一样快。',
  uneven: '节奏不均：长短音的比例没弹准。打开节拍器，用慢速跟拍练这几小节。',
  timing: '踩拍不准：把速度调慢 10–20 BPM，跟着节拍器循环这几小节。',
}

/** Wait mode already holds the cursor, so a hesitation there means the notes are not read yet. */
const WAIT_STALL = '停顿最多：这几小节的音还没认熟。先单手慢慢读谱，认清每个音再合手。'

/**
 * Practice tips for the run: one for the kind of problem that dominates the weak spots,
 * and one more when most of the trouble sits in one hand.
 */
export function weakSpotAdvice(summary: RunSummary, spots: readonly WeakSpot[]): string[] {
  const tips: string[] = []
  const weight = new Map<WeakKind, number>()
  for (const spot of spots) weight.set(spot.kind, (weight.get(spot.kind) ?? 0) + spot.score)
  const top = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (top) tips.push(top === 'stall' && summary.flow ? WAIT_STALL : ADVICE[top])

  let left = 0
  let right = 0
  for (const m of summary.errorsPerMeasure) {
    left += m.left ?? 0
    right += m.right ?? 0
  }
  for (const t of (summary.freeTempo ?? summary.flow)?.perMeasure ?? []) {
    if (t.pauseHand === 'L') left += t.stalls
    else if (t.pauseHand === 'R') right += t.stalls
  }
  const total = left + right
  if (total >= 4) {
    const weak: Hand | null = left / total >= 0.7 ? 'L' : right / total >= 0.7 ? 'R' : null
    if (weak) {
      tips.push(`${HAND_ZH[weak]}的问题占 ${Math.round(((weak === 'L' ? left : right) / total) * 100)}%：先只选${HAND_ZH[weak]}，把上面几小节单独练顺。`)
    }
  }
  return tips
}

/** What the history panel needs from a saved run. */
export interface WeakHistoryRun {
  /** Measures flagged as weak spots. Older runs fall back to measures with errors. */
  weakMeasures?: number[]
  errorsPerMeasure?: { measure: number; errors: number }[]
  measures?: { start: number; end: number }
}

function flagged(run: WeakHistoryRun): number[] {
  return run.weakMeasures ?? run.errorsPerMeasure?.filter((item) => item.errors > 0).map((item) => item.measure) ?? []
}

function covers(run: WeakHistoryRun, measure: number): boolean {
  if (run.measures) return measure >= run.measures.start && measure <= run.measures.end
  return run.errorsPerMeasure?.some((item) => item.measure === measure) ?? false
}

export interface MeasureHistory {
  /** Runs among the recent ones that flagged this measure. */
  flagged: number
  /** Recent runs that played this measure at all. */
  played: number
}

/**
 * For each measure, how many of the recent runs (newest first) that played it flagged it
 * as weak, so a spot that keeps coming back stands out from a one-off slip.
 */
export function weakHistory(runs: readonly WeakHistoryRun[], recent = 5): Map<number, MeasureHistory> {
  const out = new Map<number, MeasureHistory>()
  const window = runs.slice(0, recent)
  const measures = new Set(window.flatMap(flagged))
  for (const measure of measures) {
    const played = window.filter((run) => covers(run, measure))
    out.set(measure, { flagged: played.filter((run) => flagged(run).includes(measure)).length, played: played.length })
  }
  return out
}

/**
 * Measures that were weak in at least two of the earlier runs but are clean in the
 * newest one, so the player sees what practice has fixed.
 */
export function improvedMeasures(runs: readonly WeakHistoryRun[], recent = 5): number[] {
  const [latest, ...earlier] = runs.slice(0, recent)
  if (!latest || earlier.length === 0) return []
  const now = new Set(flagged(latest))
  const before = weakHistory(earlier, recent)
  return [...before.entries()]
    .filter(([measure, item]) => item.flagged >= 2 && covers(latest, measure) && !now.has(measure))
    .map(([measure]) => measure)
    .sort((a, b) => a - b)
}

export interface TroubleSpot extends MeasureHistory {
  measure: number
}

/**
 * Measures that keep going wrong across the recent saved runs, worst first, so practice
 * can start on them before playing the whole piece. With only one or two runs saved,
 * one flag is enough; after that a measure must come back at least twice.
 */
export function troubleSpots(runs: readonly WeakHistoryRun[], recent = 10, limit = 4): TroubleSpot[] {
  const window = runs.slice(0, recent)
  const min = window.length >= 3 ? 2 : 1
  return [...weakHistory(window, recent).entries()]
    .filter(([, item]) => item.flagged >= min)
    .map(([measure, item]) => ({ measure, ...item }))
    .sort((a, b) => b.flagged - a.flagged || b.flagged / b.played - a.flagged / a.played || a.measure - b.measure)
    .slice(0, limit)
}
