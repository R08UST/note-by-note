import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { mapNotesToHeads, unmatchedSummary, type GraphicHead } from './mapNotes'

function note(partial: Partial<ScoreNote> & Pick<ScoreNote, 'id' | 'pitch'>): ScoreNote {
  return {
    beat: 0,
    duration: 1,
    hand: 'R',
    measure: 1,
    voice: '1',
    localBeat: 0,
    ...partial,
  }
}

function head(partial: Partial<GraphicHead> & Pick<GraphicHead, 'key' | 'pitch'>): GraphicHead {
  return {
    measure: 1,
    voice: '1',
    localBeat: 0,
    hand: 'R',
    grace: false,
    cue: false,
    tieTails: [],
    ...partial,
  }
}

describe('map notes onto the engraved heads', () => {
  it('keeps every chord tone and a second voice', () => {
    const notes = [
      note({ id: 'c', pitch: 60, voice: '1' }),
      note({ id: 'e', pitch: 64, voice: '1' }),
      note({ id: 'g', pitch: 67, voice: '1' }),
      note({ id: 'low', pitch: 48, voice: '2', hand: 'L' }),
    ]
    const heads = [
      head({ key: 'c', pitch: 60 }),
      head({ key: 'e', pitch: 64 }),
      head({ key: 'g', pitch: 67 }),
      head({ key: 'low', pitch: 48, voice: '2', hand: 'L' }),
    ]
    const mapped = mapNotesToHeads(notes, heads)
    expect(mapped.matched).toBe(4)
    expect(mapped.heads.get('low')).toEqual(['low'])
  })

  it('colors the tie start and the tied heads as one attack', () => {
    const mapped = mapNotesToHeads(
      [note({ id: 'held', pitch: 60, duration: 2 })],
      [head({ key: 'start', pitch: 60, tieTails: ['stop'] }), head({ key: 'stop', pitch: 60, localBeat: 1 })],
    )
    expect(mapped.matched).toBe(1)
    expect(mapped.heads.get('held')).toEqual(['start', 'stop'])
  })

  it('does not let a grace note or a cue note take the real note', () => {
    const mapped = mapNotesToHeads(
      [note({ id: 'main', pitch: 62 })],
      [head({ key: 'grace', pitch: 62, grace: true }), head({ key: 'cue', pitch: 62, cue: true }), head({ key: 'main', pitch: 62 })],
    )
    expect(mapped.heads.get('main')).toEqual(['main'])
  })

  it('uses a grace head only when the printed note is missing', () => {
    const mapped = mapNotesToHeads([note({ id: 'only', pitch: 62 })], [head({ key: 'grace', pitch: 62, grace: true })])
    expect(mapped.matched).toBe(1)
    expect(mapped.heads.get('only')).toEqual(['grace'])
  })

  it('matches a cross-staff note by voice and time when the hand changed', () => {
    const mapped = mapNotesToHeads(
      [note({ id: 'cross', pitch: 55, hand: 'R', voice: '1' })],
      [head({ key: 'drawn', pitch: 55, hand: 'L', voice: '1' })],
    )
    expect(mapped.matched).toBe(1)
  })

  it('explains a note the engraving does not have', () => {
    const mapped = mapNotesToHeads([note({ id: 'missing', pitch: 72, measure: 4, localBeat: 1 })], [head({ key: 'other', pitch: 60, measure: 4 })])
    expect(mapped.matched).toBe(0)
    expect(mapped.unmatched[0]?.reason).toBe('本小节没有这个音高')
    expect(unmatchedSummary(mapped.unmatched)).toBe('本小节没有这个音高 1')
  })
})
