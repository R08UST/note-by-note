import type { Hand, ScoreNote } from '../judge/types'
import { noteName } from '../score/pitch'

/**
 * Touch analysis for technique drills: how even, how level, and how joined a line was.
 * The judge only says whether a note was right and on time. Scales and arpeggios are
 * practised for evenness, so this looks at neighbours instead of at single notes.
 */

/** One judged key press. Times are performance.now() milliseconds. */
export interface Touch {
  noteId: string
  onMs: number
  velocity: number
  /** When the key came up. Missing if it was still down when the run ended. */
  offMs?: number
}

export interface CrossingReport {
  count: number
  /** How much later than the player's own pulse the note after a crossing arrived, on average. */
  extraMs: number
  /** Velocity of the note after a crossing minus that hand's mean. */
  velocityDelta: number
  /** The crossing that arrived latest, such as "E4→F4". */
  worst: string | null
}

export interface FingerLoudness {
  hand: Hand
  finger: number
  mean: number
  count: number
  /** Mean velocity of the whole hand in this run. */
  handMean: number
}

export interface TouchReport {
  /** Spread of neighbour intervals around the player's own pulse, in percent. */
  unevenPct: number | null
  intervals: number
  /** False when every press had the same velocity, as with the computer keyboard. */
  hasVelocity: boolean
  velocityMean: number | null
  velocitySpread: number | null
  fingers: FingerLoudness[]
  weakFinger: FingerLoudness | null
  strongFinger: FingerLoudness | null
  crossings: CrossingReport | null
  /** Neighbour pairs where the key came up clearly before the next one went down. */
  detached: number
  /** Neighbour pairs where the release was seen. */
  joins: number
  tips: string[]
}

export const UNEVEN_TIP_PCT = 8
export const CROSSING_TIP_MS = 25
export const CROSSING_TIP_VELOCITY = 12
export const FINGER_TIP_VELOCITY = 10
export const DETACH_MS = 40
const MIN_INTERVALS = 4
const MIN_FINGER_SAMPLES = 3

/**
 * A thumb crossing: the thumb passes under, or a finger passes over the thumb.
 * Right hand fingers count up with pitch, left hand fingers count down, so a step whose
 * finger order runs against that is a crossing.
 */
export function isCrossing(hand: Hand, a: { pitch: number; finger?: number }, b: { pitch: number; finger?: number }): boolean {
  if (a.finger == null || b.finger == null || a.finger === b.finger) return false
  if (a.finger !== 1 && b.finger !== 1) return false
  const pitchDir = Math.sign(b.pitch - a.pitch)
  if (pitchDir === 0) return false
  const fingerDir = Math.sign(b.finger - a.finger)
  return hand === 'R' ? fingerDir === -pitchDir : fingerDir === pitchDir
}

interface Step {
  hand: Hand
  a: ScoreNote
  b: ScoreNote
  ta: Touch
  tb: Touch
  beats: number
  crossing: boolean
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function spread(values: readonly number[]): number | null {
  if (values.length < 2) return values.length === 1 ? 0 : null
  const center = mean(values) ?? 0
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1))
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((x, y) => x - y)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] ?? null : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** Neighbouring single notes in each hand that were both played. Chords are left out. */
function steps(notes: readonly ScoreNote[], touches: ReadonlyMap<string, Touch>): Step[] {
  const found: Step[] = []
  for (const hand of ['R', 'L'] as const) {
    const byBeat = new Map<number, ScoreNote[]>()
    for (const note of notes) {
      if (note.hand !== hand) continue
      const key = Math.round(note.beat * 1000)
      byBeat.set(key, [...(byBeat.get(key) ?? []), note])
    }
    const groups = [...byBeat.entries()].sort((x, y) => x[0] - y[0]).map(([, group]) => group)
    for (let index = 1; index < groups.length; index += 1) {
      const prev = groups[index - 1]
      const next = groups[index]
      if (prev?.length !== 1 || next?.length !== 1) continue
      const a = prev[0]
      const b = next[0]
      if (!a || !b) continue
      const ta = touches.get(a.id)
      const tb = touches.get(b.id)
      const beats = b.beat - a.beat
      if (!ta || !tb || beats <= 0 || tb.onMs <= ta.onMs) continue
      found.push({ hand, a, b, ta, tb, beats, crossing: isCrossing(hand, a, b) })
    }
  }
  return found
}

export function analyzeTouch(notes: readonly ScoreNote[], played: readonly Touch[]): TouchReport {
  const touches = new Map<string, Touch>()
  for (const touch of played) if (!touches.has(touch.noteId)) touches.set(touch.noteId, touch)
  const byId = new Map(notes.map((note) => [note.id, note]))
  const all = steps(notes, touches)

  // Timing: each interval against the player's own pulse, so a slow but steady scale is even.
  const msPerBeat = all.map((step) => (step.tb.onMs - step.ta.onMs) / step.beats)
  const pulse = median(msPerBeat)
  const ratios = pulse ? msPerBeat.map((value) => value / pulse) : []
  const ratioSpread = ratios.length >= MIN_INTERVALS ? spread(ratios) : null
  const unevenPct = ratioSpread == null ? null : ratioSpread * 100

  // Loudness.
  const velocities = [...touches.values()].map((touch) => touch.velocity)
  const hasVelocity = new Set(velocities).size > 1
  const handMean = new Map<Hand, number>()
  for (const hand of ['R', 'L'] as const) {
    const values = [...touches.values()].filter((touch) => byId.get(touch.noteId)?.hand === hand).map((touch) => touch.velocity)
    const value = mean(values)
    if (value != null) handMean.set(hand, value)
  }
  const fingerRows = new Map<string, { hand: Hand; finger: number; values: number[] }>()
  for (const touch of touches.values()) {
    const note = byId.get(touch.noteId)
    if (!note || note.finger == null) continue
    const key = `${note.hand}${note.finger}`
    const row = fingerRows.get(key) ?? { hand: note.hand, finger: note.finger, values: [] }
    row.values.push(touch.velocity)
    fingerRows.set(key, row)
  }
  const fingers: FingerLoudness[] = hasVelocity
    ? [...fingerRows.values()]
        .filter((row) => row.values.length >= MIN_FINGER_SAMPLES)
        .map((row) => ({ hand: row.hand, finger: row.finger, mean: mean(row.values) ?? 0, count: row.values.length, handMean: handMean.get(row.hand) ?? 0 }))
        .sort((x, y) => (x.hand === y.hand ? x.finger - y.finger : x.hand === 'R' ? -1 : 1))
    : []
  let weakFinger: FingerLoudness | null = null
  let strongFinger: FingerLoudness | null = null
  for (const row of fingers) {
    const delta = row.mean - row.handMean
    if (delta <= -FINGER_TIP_VELOCITY && (!weakFinger || delta < weakFinger.mean - weakFinger.handMean)) weakFinger = row
    if (delta >= FINGER_TIP_VELOCITY && (!strongFinger || delta > strongFinger.mean - strongFinger.handMean)) strongFinger = row
  }

  // Crossings: compare with the ordinary steps of the same run.
  let crossings: CrossingReport | null = null
  const plainRatios = ratios.filter((_, index) => !all[index]?.crossing)
  const plain = mean(plainRatios) ?? 1
  const crossIndexes = all.map((step, index) => (step.crossing ? index : -1)).filter((index) => index >= 0)
  if (pulse && crossIndexes.length > 0 && plainRatios.length > 0) {
    let worst: { label: string; extra: number } | null = null
    const extras: number[] = []
    const deltas: number[] = []
    for (const index of crossIndexes) {
      const step = all[index]
      const ratio = ratios[index]
      if (!step || ratio == null) continue
      const extra = (ratio - plain) * pulse * step.beats
      extras.push(extra)
      if (hasVelocity) deltas.push(step.tb.velocity - (handMean.get(step.hand) ?? step.tb.velocity))
      if (!worst || extra > worst.extra) worst = { label: `${noteName(step.a.pitch)}→${noteName(step.b.pitch)}`, extra }
    }
    crossings = {
      count: extras.length,
      extraMs: mean(extras) ?? 0,
      velocityDelta: mean(deltas) ?? 0,
      worst: worst && worst.extra > 0 ? worst.label : null,
    }
  }

  // Legato: did the key come up before the next one went down?
  let detached = 0
  let joins = 0
  for (const step of all) {
    if (step.ta.offMs == null) continue
    joins += 1
    if (step.tb.onMs - step.ta.offMs > DETACH_MS) detached += 1
  }

  const report: TouchReport = {
    unevenPct,
    intervals: ratios.length,
    hasVelocity,
    velocityMean: hasVelocity ? mean(velocities) : null,
    velocitySpread: hasVelocity ? spread(velocities) : null,
    fingers,
    weakFinger,
    strongFinger,
    crossings,
    detached,
    joins,
    tips: [],
  }
  report.tips = touchTips(report)
  return report
}

const HAND_NAME: Record<Hand, string> = { R: '右手', L: '左手' }

/** At most three things to work on, most useful first. */
export function touchTips(report: TouchReport): string[] {
  const tips: string[] = []
  const cross = report.crossings
  if (cross && cross.count >= 2 && cross.extraMs >= CROSSING_TIP_MS) {
    const where = cross.worst ? `，最明显在 ${cross.worst}` : ''
    tips.push(`穿指那一下平均慢 ${Math.round(cross.extraMs)} ms${where}。把穿指的两个音单独来回弹，大拇指提前移到下一个键上方。`)
  }
  if (report.unevenPct != null && report.unevenPct >= UNEVEN_TIP_PCT) {
    tips.push(`相邻音的间隔波动 ${Math.round(report.unevenPct)}%，还不够匀。降 8 拍，练到 5% 以内再加速。`)
  }
  if (cross && cross.count >= 2 && Math.abs(cross.velocityDelta) >= CROSSING_TIP_VELOCITY) {
    tips.push(`穿指后的那个音${cross.velocityDelta > 0 ? '偏重' : '偏轻'}，比这只手平均${cross.velocityDelta > 0 ? '重' : '轻'} ${Math.round(Math.abs(cross.velocityDelta))}。大拇指${cross.velocityDelta > 0 ? '别砸下去' : '要落实'}。`)
  }
  if (report.weakFinger) {
    const row = report.weakFinger
    tips.push(`${HAND_NAME[row.hand]} ${row.finger} 指偏轻：平均力度 ${Math.round(row.mean)}，这只手平均 ${Math.round(row.handMean)}。`)
  }
  if (report.strongFinger) {
    const row = report.strongFinger
    tips.push(`${HAND_NAME[row.hand]} ${row.finger} 指偏重：平均力度 ${Math.round(row.mean)}，这只手平均 ${Math.round(row.handMean)}。`)
  }
  if (report.joins >= 4 && report.detached / report.joins >= 0.25) {
    tips.push(`${report.detached}/${report.joins} 处在下一个音按下前就松开了，连奏断了。手指贴着键，等下一个音按下再抬。`)
  }
  return tips.slice(0, 3)
}

/** One line of numbers for the report. */
export function touchLine(report: TouchReport): string {
  const parts: string[] = []
  if (report.unevenPct != null) parts.push(`间隔波动 ${Math.round(report.unevenPct)}%`)
  if (report.hasVelocity && report.velocityMean != null) {
    parts.push(`力度 平均 ${Math.round(report.velocityMean)} ± ${Math.round(report.velocitySpread ?? 0)}`)
  } else if (report.intervals > 0) {
    parts.push('没有力度数据（电脑键盘或屏幕键盘）')
  }
  if (report.crossings && report.crossings.count > 0) {
    const ms = Math.round(report.crossings.extraMs)
    parts.push(`穿指 ${report.crossings.count} 处 ${ms >= 0 ? '慢' : '快'} ${Math.abs(ms)} ms`)
  }
  if (report.joins > 0) parts.push(`连奏断开 ${report.detached}/${report.joins}`)
  return parts.join(' · ')
}
