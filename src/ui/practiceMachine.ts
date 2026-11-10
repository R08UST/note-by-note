export type PracticeStatus = 'idle' | 'countin' | 'playing' | 'finished'
export type PracticeRunMode = 'wait' | 'rhythm'

export type PracticeEvent =
  | { type: 'start'; mode: PracticeRunMode }
  | { type: 'seek'; mode: PracticeRunMode }
  | { type: 'loop'; mode: PracticeRunMode }
  | { type: 'countin-done' }
  | { type: 'finish' }

/**
 * Seeking and looping stay inside the run.
 * They never pass through idle, so the control bar does not flash back to Start.
 */
export function practiceTransition(status: PracticeStatus, event: PracticeEvent): PracticeStatus {
  if (event.type === 'seek' || event.type === 'loop') {
    if (status !== 'playing' && status !== 'countin') return status
    return event.mode === 'rhythm' ? 'countin' : 'playing'
  }
  if (event.type === 'start') {
    if (status === 'playing' || status === 'countin') return status
    return event.mode === 'rhythm' ? 'countin' : 'playing'
  }
  if (event.type === 'countin-done') return status === 'countin' ? 'playing' : status
  if (event.type === 'finish') {
    if (status === 'idle' || status === 'finished') return status
    return 'finished'
  }
  return status
}
