import { describe, expect, it } from 'vitest'
import { musicalTime, notesSounding } from './engine'

describe('listen playback timing', () => {
  it('maps quarter beats onto 4/4 transport time', () => {
    expect(musicalTime(0)).toBe('0:0:0')
    expect(musicalTime(1)).toBe('0:1:0')
    expect(musicalTime(4)).toBe('1:0:0')
    expect(musicalTime(4.5)).toBe('1:0:2')
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