import { describe, expect, it } from 'vitest'
import { musicalTime, notesSounding } from './engine'

describe('listen playback timing', () => {
  it('maps quarter beats onto 4/4 transport time', () => {
    expect(musicalTime(0)).toBe('0:0:0')
    expect(musicalTime(1)).toBe('0:1:0')
    expect(musicalTime(4)).toBe('1:0:0')
    expect(musicalTime(4.5)).toBe('1:0:2')
  })

  it('keeps subdivisions finer than a sixteenth instead of snapping them', () => {
    // An eighth triplet sits a third of a beat in; a 32nd sits an eighth in.
    expect(musicalTime(1 / 3)).toBe('0:0:1.333')
    expect(musicalTime(1 / 8)).toBe('0:0:0.5')
    expect(musicalTime(1 + 1 / 6)).toBe('0:1:0.667')
  })

  it('keeps 32nds and 64ths on their own grid', () => {
    // 32nd = 1/8 beat = half a sixteenth.
    expect(musicalTime(1.25)).toBe('0:1:1')
    expect(musicalTime(3.75)).toBe('0:3:3')
    // A 64th is a quarter of a sixteenth.
    expect(musicalTime(0.0625)).toBe('0:0:0.25')
    expect(musicalTime(2 + 1 / 16)).toBe('0:2:0.25')
  })

  it('keeps left and right notes that are sounding at a beat', () => {
    const notes = [
      { pitch: 60, beat: 0, duration: 1, hand: 'R' as const },
      { pitch: 48, beat: 0, duration: 2, hand: 'L' as const },
      { pitch: 64, beat: 1, duration: 1, hand: 'R' as const },
    ]
    expect(notesSounding(notes, 0.2).map((note) => note.pitch)).toEqual([60, 48])
    expect(notesSounding(notes, 1.2).map((note) => note.hand)).toEqual(['L', 'R'])
  })
})