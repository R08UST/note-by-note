import { describe, expect, it } from 'vitest'
import {
  buildWarp,
  compilePerformance,
  midiVelocityAt,
  tempoPlanFor,
  velocityGain,
} from './performance'
import type { ScoreNote } from '../judge/types'

function note(over: Partial<ScoreNote> = {}): ScoreNote {
  return { id: `n${Math.random()}`, pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1, ...over }
}

describe('velocity', () => {
  it('keeps quiet dynamics quieter than loud ones', () => {
    expect(velocityGain(16)).toBeLessThan(velocityGain(49))
    expect(velocityGain(49)).toBeLessThan(velocityGain(80))
    expect(velocityGain(80)).toBeLessThan(velocityGain(112))
    expect(velocityGain(127)).toBeLessThanOrEqual(1)
    expect(velocityGain(1)).toBeGreaterThan(0)
  })

  it('reads the last dynamic before a note', () => {
    const dynamics = [
      { beat: 0, velocity: 49 },
      { beat: 4, velocity: 96 },
    ]
    expect(midiVelocityAt(2, undefined, { dynamics })).toBe(49)
    expect(midiVelocityAt(4, undefined, { dynamics })).toBe(96)
    expect(midiVelocityAt(6, undefined, { dynamics })).toBe(96)
  })

  it('falls back to mf when the score prints nothing', () => {
    expect(midiVelocityAt(0, undefined, {})).toBe(80)
  })

  it('keeps a dynamic printed on one staff off the other', () => {
    const dynamics = [{ beat: 0, velocity: 33, staff: 2 }]
    expect(midiVelocityAt(0, 2, { dynamics })).toBe(33)
    expect(midiVelocityAt(0, 1, { dynamics })).toBe(80)
  })

  it('ramps a hairpin from its dynamic to the next one', () => {
    const dynamics = [
      { beat: 0, velocity: 49 },
      { beat: 4, velocity: 96 },
    ]
    const wedges = [{ startBeat: 0, endBeat: 4, direction: 'crescendo' as const }]
    const start = midiVelocityAt(0, undefined, { dynamics, wedges })
    const middle = midiVelocityAt(2, undefined, { dynamics, wedges })
    const end = midiVelocityAt(4, undefined, { dynamics, wedges })
    expect(start).toBe(49)
    expect(middle).toBeGreaterThan(start)
    expect(middle).toBeLessThan(end)
    expect(end).toBe(96)
  })

  it('moves a hairpin that never resolves by a fixed step', () => {
    const dynamics = [{ beat: 0, velocity: 49 }]
    const wedges = [{ startBeat: 0, endBeat: 4, direction: 'diminuendo' as const }]
    expect(midiVelocityAt(4, undefined, { dynamics, wedges })).toBeLessThan(49)
  })
})

describe('compilePerformance', () => {
  it('plays a flat mf when the score has no expression at all', () => {
    const performed = compilePerformance([note()])
    expect(performed).toHaveLength(1)
    expect(performed[0].midi).toBe(80)
    expect(performed[0].velocity).toBeCloseTo(velocityGain(80))
  })

  it('shortens a staccato and holds a tenuto', () => {
    const [staccato] = compilePerformance([note({ articulation: 'staccato' })])
    const [tenuto] = compilePerformance([note({ articulation: 'tenuto' })])
    expect(staccato.gate).toBeLessThan(tenuto.gate)
    expect(staccato.gate).toBeLessThan(0.6)
  })

  it('lifts an accent above the surrounding dynamic', () => {
    const dynamics = [{ beat: 0, velocity: 80 }]
    const [plain] = compilePerformance([note()], { dynamics })
    const [accented] = compilePerformance([note({ articulation: 'accent' })], { dynamics })
    expect(accented.midi).toBeGreaterThan(plain.midi)
  })

  it('holds a slurred note until the next note under the same slur', () => {
    const notes = [
      note({ beat: 0, duration: 1, pitch: 60, slur: 1 }),
      note({ beat: 2, duration: 1, pitch: 62, slur: 1 }),
    ]
    const performed = compilePerformance(notes)
    expect(performed[0].gate).toBeGreaterThan(1.5)
    expect(performed[1].gate).toBeLessThan(1.5)
  })

  it('stretches a fermata past the written value', () => {
    const [held] = compilePerformance([note({ fermata: true })])
    const [plain] = compilePerformance([note()])
    expect(held.gate).toBeGreaterThan(plain.gate)
  })

  it('keeps the sustain pedal ringing after the key comes up', () => {
    const notes = [note({ beat: 0, duration: 0.5, pitch: 48, articulation: 'tenuto' })]
    const pedals = [{ downBeat: 0, upBeat: 3 }]
    const [dry] = compilePerformance(notes)
    const [wet] = compilePerformance(notes, { pedals })
    expect(wet.gate).toBeGreaterThan(dry.gate)
    expect(wet.gate).toBeCloseTo(3)
  })

  it('still lifts a staccato under the pedal', () => {
    const notes = [note({ beat: 0, duration: 0.5, pitch: 48, articulation: 'staccato' })]
    const pedals = [{ downBeat: 0, upBeat: 3 }]
    const [short] = compilePerformance(notes, { pedals })
    expect(short.gate).toBeLessThan(0.5)
  })

  it('never holds a note through its own repeat', () => {
    const notes = [
      note({ beat: 0, duration: 1, pitch: 60, articulation: 'tenuto' }),
      note({ beat: 1, duration: 1, pitch: 60, articulation: 'tenuto' }),
    ]
    const [first] = compilePerformance(notes)
    expect(first.gate).toBeLessThan(1)
  })

  it('carries grace notes through to playback', () => {
    const [performed] = compilePerformance([note({ graces: [62, 64] })])
    expect(performed.extras?.map((extra) => extra.pitch)).toEqual([62, 64])
    expect(performed.extras?.every((extra) => extra.offset < 0)).toBe(true)
  })

  it('plays a trill as an alternation with the upper neighbour', () => {
    const [performed] = compilePerformance([
      note({ pitch: 60, duration: 2, ornament: { kind: 'trill', upper: 62, lower: 59 } }),
    ])
    const extras = performed.extras ?? []
    expect(extras.length).toBeGreaterThan(2)
    // It has to go back and forth, not just hammer the upper note.
    expect(new Set(extras.map((extra) => extra.pitch))).toEqual(new Set([60, 62]))
    expect(extras.every((extra) => extra.pitch === 60 || extra.pitch === 62)).toBe(true)
    expect(extras.some((extra) => extra.offset > 0)).toBe(true)
    // The written key comes up early so the alternation is actually heard.
    expect(performed.gate).toBeLessThan(0.2)
  })

  it('plays a mordent as a single lower flick before the beat', () => {
    const [performed] = compilePerformance([
      note({ pitch: 60, ornament: { kind: 'mordent', upper: 62, lower: 59 } }),
    ])
    const extras = performed.extras ?? []
    expect(extras.every((extra) => extra.offset < 0)).toBe(true)
    expect(extras.map((extra) => extra.pitch)).toEqual([60, 59])
  })

  it('plays an inverted mordent with the upper neighbour', () => {
    const [performed] = compilePerformance([
      note({ pitch: 60, ornament: { kind: 'inverted-mordent', upper: 62, lower: 59 } }),
    ])
    expect((performed.extras ?? []).map((extra) => extra.pitch)).toEqual([60, 62])
  })

  it('plays a turn as upper, main, lower', () => {
    const [performed] = compilePerformance([
      note({ pitch: 60, ornament: { kind: 'turn', upper: 62, lower: 59 } }),
    ])
    expect((performed.extras ?? []).map((extra) => extra.pitch)).toEqual([62, 60, 59])
  })

  it('plays a schleifer as lower neighbour then the written note', () => {
    const [performed] = compilePerformance([
      note({ pitch: 60, ornament: { kind: 'schleifer', upper: 62, lower: 59 } }),
    ])
    expect((performed.extras ?? []).map((extra) => extra.pitch)).toEqual([59, 60])
  })

  it('keeps a trill going past its note when a wavy line continues it', () => {
    const short = compilePerformance([note({ pitch: 60, duration: 1, ornament: { kind: 'trill', upper: 62, lower: 59 } })])
    const long = compilePerformance([
      note({ pitch: 60, duration: 1, ornament: { kind: 'trill', upper: 62, lower: 59, span: 4 } }),
    ])
    const shortSpan = Math.max(...(short[0].extras ?? []).map((extra) => extra.offset))
    const longSpan = Math.max(...(long[0].extras ?? []).map((extra) => extra.offset))
    expect(longSpan).toBeGreaterThan(shortSpan)
  })

  it('shakes a single-note tremolo on its own pitch', () => {
    const [performed] = compilePerformance([
      note({ pitch: 60, duration: 1, tremolo: { strokes: 2, kind: 'single' } }),
    ])
    const extras = performed.extras ?? []
    expect(extras.length).toBeGreaterThan(2)
    expect(extras.every((extra) => extra.pitch === 60)).toBe(true)
    expect(extras.every((extra) => extra.offset > 0)).toBe(true)
  })

  it('shakes a two-note tremolo between both written pitches', () => {
    const performed = compilePerformance([
      note({ pitch: 60, duration: 1, tremolo: { strokes: 3, kind: 'between', partner: 67, span: 2, role: 'primary' } }),
      note({ pitch: 67, beat: 1, duration: 1, tremolo: { strokes: 3, kind: 'between', partner: 60, span: 2, role: 'answer' } }),
    ])
    const extras = performed[0].extras ?? []
    expect(new Set(extras.map((extra) => extra.pitch))).toEqual(new Set([60, 67]))
    // The partner's own written attack would strike it twice, so it stays silent.
    expect(performed[1].silent).toBe(true)
    expect(performed[1].extras).toBeUndefined()
  })

  it('rolls a chord instead of striking every tone at once', () => {
    const performed = compilePerformance([
      note({ pitch: 48, beat: 0, arpeggio: { index: 0, count: 3, direction: 'up' } }),
      note({ pitch: 55, beat: 0, arpeggio: { index: 1, count: 3, direction: 'up' } }),
      note({ pitch: 64, beat: 0, arpeggio: { index: 2, count: 3, direction: 'up' } }),
    ])
    const offsets = performed.map((entry) => entry.offset ?? 0)
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBeGreaterThan(offsets[0])
    expect(offsets[2]).toBeGreaterThan(offsets[1])
    // The score highlight stays on the written beat, so only the strike is spread.
    expect(performed.map((entry) => entry.beat)).toEqual([0, 0, 0])
    expect(offsets[2]).toBeLessThan(0.5)
  })

  it('lifts the key early on a printed breath mark', () => {
    const [plain] = compilePerformance([note({ duration: 2 })])
    const [breathed] = compilePerformance([note({ duration: 2, breath: true })])
    expect(breathed.gate).toBeLessThan(plain.gate)
    expect(breathed.gate).toBeGreaterThan(0)
  })

  it('lets a dynamic printed on one note outrank the dynamic in force', () => {
    const dynamics = [{ beat: 0, velocity: 49 }]
    const [printed] = compilePerformance([note({ dynamics: 112 })], { dynamics })
    const [inherited] = compilePerformance([note()], { dynamics })
    expect(printed.midi).toBe(112)
    expect(inherited.midi).toBe(49)
  })

  it('keeps a staccatissimo shorter than a staccato', () => {
    const [short] = compilePerformance([note({ articulation: 'staccatissimo' })])
    const [staccato] = compilePerformance([note({ articulation: 'staccato' })])
    expect(short.gate).toBeLessThan(staccato.gate)
    expect(short.midi).toBeLessThan(staccato.midi)
  })

  it('keeps the pedal of one staff off the other', () => {
    const pedals = [{ downBeat: 0, upBeat: 4, staff: 2 }]
    const [right] = compilePerformance([note({ pitch: 72, staff: 1, duration: 1 })], { pedals })
    const [left] = compilePerformance([note({ pitch: 48, staff: 2, duration: 1 })], { pedals })
    // The pedal is printed under the left hand, so only that hand is held.
    expect(left.gate).toBeGreaterThan(right.gate)
  })

  it('leaves a plain note without extras', () => {
    const [performed] = compilePerformance([note()])
    expect(performed.extras).toBeUndefined()
  })

  it('sorts notes by beat so the transport schedule stays ordered', () => {
    const performed = compilePerformance([note({ beat: 2 }), note({ beat: 0 }), note({ beat: 1 })])
    expect(performed.map((entry) => entry.beat)).toEqual([0, 1, 2])
  })
})

describe('tempo', () => {
  it('has no plan when the score never prints a tempo', () => {
    expect(tempoPlanFor([], 72)).toEqual([])
  })

  it('starts the plan at the tempo the player chose', () => {
    const plan = tempoPlanFor([{ beat: 0, bpm: 120 }, { beat: 8, bpm: 60 }], 60)
    expect(plan[0]).toEqual({ beat: 0, bpm: 60 })
    // The score halves its speed at beat 8, so the plan does too.
    expect(plan[1].bpm).toBeCloseTo(30)
  })

  it('keeps a first mark that arrives after the opening', () => {
    const plan = tempoPlanFor([{ beat: 4, bpm: 100 }], 80)
    expect(plan[0]).toEqual({ beat: 0, bpm: 80 })
    expect(plan[1]).toEqual({ beat: 4, bpm: 80 })
  })
})

describe('warp', () => {
  it('is the identity at a constant tempo', () => {
    const warp = buildWarp([], 90)
    expect(warp.toUnits(0)).toBe(0)
    expect(warp.toUnits(4)).toBeCloseTo(4)
    expect(warp.toBeat(4)).toBeCloseTo(4)
  })

  it('round-trips beats through a tempo change', () => {
    const warp = buildWarp([{ beat: 0, bpm: 60 }, { beat: 4, bpm: 120 }], 60)
    for (const beat of [0, 1, 3.5, 4, 5, 9]) {
      expect(warp.toBeat(warp.toUnits(beat))).toBeCloseTo(beat)
    }
  })

  it('gives a fast section fewer transport quarters than a slow one', () => {
    const warp = buildWarp([{ beat: 0, bpm: 60 }, { beat: 4, bpm: 120 }], 60)
    // Beats 0–4 at 60 bpm take four transport quarters; beats 4–8 at 120 take two.
    expect(warp.toUnits(4)).toBeCloseTo(4)
    expect(warp.toUnits(8)).toBeCloseTo(6)
  })
})
