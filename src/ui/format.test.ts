import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { describeNotes } from './format'

function note(pitch: number, hand: 'R' | 'L'): ScoreNote {
  return { id: `${hand}${pitch}`, pitch, beat: 0, duration: 1, hand, measure: 1 }
}

describe('describeNotes', () => {
  it('labels each tone with its hand', () => {
    expect(describeNotes([note(60, 'R')])).toBe('右·C4')
  })

  it('shows both hands on a chord, right hand first and low to high', () => {
    expect(describeNotes([note(48, 'L'), note(67, 'R'), note(60, 'R')])).toBe('右·C4 + 右·G4 + 左·C3')
  })

  it('is empty with no notes', () => {
    expect(describeNotes([])).toBe('')
  })
})
