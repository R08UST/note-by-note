import { describe, expect, it } from 'vitest'
import { WaitMode } from '../modes/waitMode'
import { CHORD_LEVELS, FINGER_LEVELS, SCALE_LEVELS, scaleShape } from './technique'

describe('scale syllabus', () => {
  it('prints the standard C major and F major fingerings', () => {
    const c = scaleShape('C', 1, 'R')
    expect(c.pitches.slice(0, 8)).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
    expect(c.fingers.slice(0, 8)).toEqual([1, 2, 3, 1, 2, 3, 4, 5])
    expect(c.fingers.slice(8)).toEqual([4, 3, 2, 1, 3, 2, 1])
    expect(scaleShape('F', 1, 'R').fingers.slice(0, 8)).toEqual([1, 2, 3, 4, 1, 2, 3, 4])
  })

  it('raises the 7th of a harmonic minor and keeps the natural form', () => {
    const level = SCALE_LEVELS[3]
    const harmonic = level?.items.find((item) => item.title.startsWith('d 和声'))
    const natural = level?.items.find((item) => item.title.startsWith('a 小调'))
    const harmonicA = level?.items.find((item) => item.title.startsWith('a 和声'))
    expect(harmonic?.notes.some((note) => note.pitch === 73)).toBe(true)
    expect(harmonic?.xml).toContain('<step>C</step><alter>1</alter>')
    expect(natural?.notes.some((note) => note.pitch === 79)).toBe(true)
    expect(natural?.notes.some((note) => note.pitch === 80)).toBe(false)
    expect(harmonicA?.notes.some((note) => note.pitch === 80)).toBe(true)
  })

  it('starts contrary motion on one shared tonic', () => {
    const item = SCALE_LEVELS[4]?.items[0]
    const opening = item?.notes.filter((note) => note.beat === 0) ?? []
    expect(opening.map((note) => note.pitch)).toEqual([60])
    const next = item?.notes.filter((note) => note.beat === 1).map((note) => note.pitch).sort()
    expect(next).toEqual([59, 62])
  })

  it('writes fingering into the MusicXML', () => {
    expect(SCALE_LEVELS[0]?.items[0]?.xml).toContain('<fingering>1</fingering>')
  })

  it('gives every level at least three items and a cited source', () => {
    for (const level of SCALE_LEVELS) {
      expect(level.items.length).toBeGreaterThanOrEqual(3)
      expect(level.source.length).toBeGreaterThan(8)
    }
  })
})

describe('chord syllabus', () => {
  it('stacks a root-position triad and a I–IV–V–I cadence', () => {
    const tonic = CHORD_LEVELS[0]?.items[0]
    expect(tonic?.notes.map((note) => note.pitch).sort()).toEqual([60, 64, 67])
    expect(new Set(tonic?.notes.map((note) => note.beat)).size).toBe(1)
    const cadence = CHORD_LEVELS[6]?.items[0]
    const beats = [...new Set(cadence?.notes.map((note) => note.beat) ?? [])].sort((a, b) => a - b)
    expect(beats).toEqual([0, 1, 2, 3])
    const bass = beats.map((beat) => Math.min(...(cadence?.notes.filter((note) => note.beat === beat).map((note) => note.pitch) ?? [])))
    expect(bass).toEqual([60, 60, 59, 60])
  })

  it('breaks a fifth and then an octave arpeggio', () => {
    const broken = CHORD_LEVELS[2]?.items[0]
    expect(broken?.notes.map((note) => note.pitch)).toEqual([60, 64, 67, 64, 60])
    const arpeggio = CHORD_LEVELS[4]?.items[0]
    expect(arpeggio?.notes.map((note) => note.pitch).slice(0, 4)).toEqual([67, 71, 74, 79])
  })

  it('reports a missing chord tone instead of moving on', () => {
    const triad = CHORD_LEVELS[0]?.items[0]
    const mode = new WaitMode(triad?.notes ?? [])
    mode.push({ pitch: 60, velocity: 80, timeMs: 0, type: 'on' })
    mode.push({ pitch: 64, velocity: 80, timeMs: 10, type: 'on' })
    expect(mode.done()).toBe(false)
    const wrong = mode.push({ pitch: 63, velocity: 80, timeMs: 20, type: 'on' })
    expect(wrong[0]?.result).toBe('wrong')
    expect(mode.done()).toBe(false)
    mode.push({ pitch: 67, velocity: 80, timeMs: 30, type: 'on' })
    expect(mode.done()).toBe(true)
  })
})

describe('finger drills', () => {
  it('moves Hanon No. 1 up by step and mirrors the fingers on the way down', () => {
    const right = FINGER_LEVELS[3]?.items[0]?.notes ?? []
    expect(right.slice(0, 8).map((note) => note.pitch)).toEqual([60, 64, 65, 67, 69, 67, 65, 64])
    expect(right.slice(0, 8).map((note) => note.finger)).toEqual([1, 2, 3, 4, 5, 4, 3, 2])
    expect(right.slice(8, 10).map((note) => note.pitch)).toEqual([62, 65])
    expect(right[56]?.finger).toBe(5)
    expect(right.at(-1)?.pitch).toBe(60)
    // Eighths: one group per bar, and the closing C lands on the next downbeat.
    expect(right[8]?.beat).toBe(4)
    expect(right.at(-1)?.beat).toBe(56)
    const left = FINGER_LEVELS[3]?.items[1]?.notes ?? []
    expect(left.slice(0, 8).map((note) => note.finger)).toEqual([5, 4, 3, 2, 1, 2, 3, 4])
  })

  it('keeps five-finger lines under one hand position', () => {
    const five = FINGER_LEVELS[0]?.items[1]?.notes ?? []
    expect(five.map((note) => note.pitch)).toEqual([48, 50, 52, 53, 55, 53, 52, 50, 48])
    expect(five.map((note) => note.finger)).toEqual([5, 4, 3, 2, 1, 2, 3, 4, 5])
  })

  it('re-times a scale into dotted pairs that fill whole bars', () => {
    const dotted = SCALE_LEVELS[7]?.items[1]?.notes ?? []
    expect(dotted.slice(0, 3).map((note) => note.duration)).toEqual([0.75, 0.25, 0.75])
    expect(dotted.at(-1)?.beat).toBe(7)
  })
})
