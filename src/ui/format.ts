import { isOnTime } from '../judge/judge'
import { BEGINNER_TOLERANCE, type Judgement } from '../judge/types'
import type { ScoreNote } from '../judge/types'
import { noteName } from '../score/pitch'

/**
 * Note names of every tone with the hand that plays it, e.g. "右·C4 + 左·E4".
 * Right hand tones come first, each hand low-to-high.
 */
export function describeNotes(notes: readonly ScoreNote[]): string {
  if (notes.length === 0) return ''
  const order = { R: 0, L: 1 } as const
  return [...notes]
    .sort((a, b) => order[a.hand] - order[b.hand] || a.pitch - b.pitch)
    .map((note) => `${note.hand === 'R' ? '右' : '左'}·${noteName(note.pitch)}`)
    .join(' + ')
}

export function formatOffset(offsetMs: number): string {
  const rounded = Math.round(offsetMs)
  if (isOnTime(rounded)) return '准时'
  if (rounded < 0) return `抢了 ${Math.abs(rounded)} 毫秒`
  return `拖了 ${rounded} 毫秒`
}

export function describeJudgement(judgement: Judgement): string {
  const name = noteName(judgement.pitch)
  if (judgement.result === 'hit') {
    return judgement.offsetMs == null ? `${name} 弹对了` : `${name}，${formatOffset(judgement.offsetMs)}`
  }
  if (judgement.result === 'wrong') return `${name} 不是谱上的音`
  if (judgement.result === 'miss') return `错过了 ${name}`
  return `${name} 多弹了`
}

export type FeedbackTone = 'good' | 'warn' | 'bad' | 'idle'

export function judgementTone(judgement: Judgement): Exclude<FeedbackTone, 'idle'> {
  if (judgement.result === 'hit') {
    if (judgement.offsetMs == null || isOnTime(judgement.offsetMs)) return 'good'
    return 'warn'
  }
  if (judgement.result === 'extra') return 'warn'
  return 'bad'
}

export function scoreColor(judgement: Judgement): string {
  const tone = judgementTone(judgement)
  if (tone === 'good') return '#1f8a5b'
  if (tone === 'warn') return '#c9842a'
  return '#d4533a'
}

/** Position of an offset on the beginner window, from early (0) to late (100). */
export function meterPercent(offsetMs: number): number {
  const start = -BEGINNER_TOLERANCE.earlyMs
  const end = BEGINNER_TOLERANCE.lateMs
  const clamped = Math.min(end, Math.max(start, offsetMs))
  return ((clamped - start) / (end - start)) * 100
}

export const PERFECT_BAND = {
  start: meterPercent(-BEGINNER_TOLERANCE.perfectMs),
  end: meterPercent(BEGINNER_TOLERANCE.perfectMs),
}
