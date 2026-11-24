import { describe, expect, it } from 'vitest'
import { FINGER_LEVELS, SCALE_LEVELS, crossingSpot, fingerSpot } from './technique'
import { unevenTrend } from './touch'

describe('spot drills', () => {
  it('cuts one thumb crossing with a note either side and repeats it there and back', () => {
    const scale = SCALE_LEVELS[0]?.items[0]
    if (!scale) throw new Error('no C major scale')
    const e = scale.notes.find((note) => note.pitch === 64)
    const f = scale.notes.find((note) => note.pitch === 65)
    const spot = e && f ? crossingSpot(scale, e.id, f.id) : null
    expect(spot?.notes.slice(0, 6).map((note) => note.pitch)).toEqual([62, 64, 65, 67, 65, 64])
    expect(spot?.notes.slice(0, 4).map((note) => note.finger)).toEqual([2, 3, 1, 2])
    expect(spot?.notes.at(-1)?.pitch).toBe(62)
    expect(spot?.id).not.toBe(scale.id)
  })

  it('refuses two notes that are not neighbours', () => {
    const scale = SCALE_LEVELS[0]?.items[0]
    const [a, , c] = scale?.notes ?? []
    expect(scale && a && c ? crossingSpot(scale, a.id, c.id) : 'missing').toBeNull()
  })

  it('keeps the written spelling of a raised seventh', () => {
    const harmonic = SCALE_LEVELS[3]?.items.find((item) => item.title.startsWith('d 和声'))
    if (!harmonic) throw new Error('no d harmonic minor')
    const b = harmonic.notes.find((note) => note.pitch === 70)
    const cSharp = harmonic.notes.find((note) => note.pitch === 73)
    const pair = harmonic.notes.find((note) => note.pitch === 74)
    expect(b && cSharp && pair).toBeTruthy()
    const spot = fingerSpot(harmonic, 'R', cSharp?.finger ?? 0)
    expect(spot?.xml).toContain('<step>C</step><alter>1</alter>')
  })

  it('alternates a weak finger with its neighbour', () => {
    const five = FINGER_LEVELS[0]?.items[0]
    if (!five) throw new Error('no five-finger item')
    const spot = fingerSpot(five, 'R', 4)
    const fingers = spot?.notes.map((note) => note.finger) ?? []
    expect(fingers.length).toBe(17)
    expect(new Set(fingers)).toEqual(new Set([4, 3]))
    expect(fingers[0]).toBe(4)
  })
})

describe('unevenTrend', () => {
  it('lists one item oldest first and keeps the last few', () => {
    const runs = [
      { itemId: 'a', createdAt: 3, unevenPct: 9.4 },
      { itemId: 'b', createdAt: 2, unevenPct: 50 },
      { itemId: 'a', createdAt: 1, unevenPct: 14 },
      { itemId: 'a', createdAt: 2, unevenPct: null },
    ]
    expect(unevenTrend(runs, 'a')).toEqual([14, 9])
    expect(unevenTrend(runs, 'a', 1)).toEqual([9])
  })
})
