import { describe, expect, it } from 'vitest'
import { practiceTransition, type PracticeStatus } from './practiceMachine'

describe('practice run transitions', () => {
  it('never emits idle when seeking while a run is going', () => {
    let status: PracticeStatus = 'playing'
    const seen: PracticeStatus[] = []
    for (let step = 0; step < 10; step += 1) {
      status = practiceTransition(status, { type: 'seek', mode: 'wait' })
      seen.push(status)
    }
    expect(seen).toEqual(Array.from({ length: 10 }, () => 'playing'))
    expect(seen.includes('idle')).toBe(false)
    expect(seen.includes('finished')).toBe(false)

    status = 'playing'
    const rhythm: PracticeStatus[] = []
    for (let step = 0; step < 10; step += 1) {
      status = practiceTransition(status, { type: 'seek', mode: 'rhythm' })
      rhythm.push(status)
    }
    expect(rhythm.every((item) => item === 'countin')).toBe(true)
    expect(rhythm.includes('idle')).toBe(false)
  })

  it('keeps a stopped run stopped, and a loop stays inside the run', () => {
    expect(practiceTransition('idle', { type: 'seek', mode: 'wait' })).toBe('idle')
    expect(practiceTransition('finished', { type: 'seek', mode: 'rhythm' })).toBe('finished')
    expect(practiceTransition('playing', { type: 'loop', mode: 'wait' })).toBe('playing')
    expect(practiceTransition('playing', { type: 'loop', mode: 'rhythm' })).toBe('countin')
    expect(practiceTransition('countin', { type: 'countin-done' })).toBe('playing')
    expect(practiceTransition('playing', { type: 'finish' })).toBe('finished')
  })
})