import { isOnTime } from '../judge/judge'
import { BEGINNER_TOLERANCE, type Judgement } from '../judge/types'
import { noteName } from '../score/pitch'

export function formatOffset(offsetMs: number): string {
  const rounded = Math.round(offsetMs)
  if (isOnTime(rounded)) return 'on time'
  if (rounded < 0) return `${Math.abs(rounded)} ms early`
  return `${rounded} ms late`
}

export function describeJudgement(judgement: Judgement): string {
  const name = noteName(judgement.pitch)
  if (judgement.result === 'hit') {
    return judgement.offsetMs == null ? `${name} hit` : `${name}, ${formatOffset(judgement.offsetMs)}`
  }
  if (judgement.result === 'wrong') return `${name} is not the written note`
  if (judgement.result === 'miss') return `Missed ${name}`
  return `${name} is extra`
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
