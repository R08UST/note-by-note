import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../score/parseMusicXml'
import { tonicPc, generateFlash, generateSightPhrase, scalePitches, SIGHT_LEVELS } from './sight'
import { pickWeighted, mulberry32 } from './rng'

function sameAttacks(xml: string, notes: { pitch: number; beat: number; duration: number; hand: string }[]) {
  const parsed = parseMusicXml(xml)
  expect(parsed.notes.map((note) => [note.pitch, note.beat, note.duration, note.hand])).toEqual(
    notes.map((note) => [note.pitch, note.beat, note.duration, note.hand]),
  )
}

describe('sight generator', () => {
  it('keeps L1 on the treble C4–G4 quarters and cadences on C', () => {
    const exercise = generateSightPhrase({ level: 1, seed: 7 })
    expect(exercise.fifths).toBe(0)
    expect(exercise.notes.length).toBe(8)
    for (const note of exercise.notes) {
      expect(note.pitch).toBeGreaterThanOrEqual(60)
      expect(note.pitch).toBeLessThanOrEqual(67)
      expect(note.duration).toBe(1)
      expect(note.hand).toBe('R')
    }
    expect(exercise.notes[exercise.notes.length - 1]?.pitch).toBe(60)
    sameAttacks(exercise.xml, exercise.notes)
  })

  it('puts L2 in the bass C3–G3', () => {
    const exercise = generateSightPhrase({ level: 2, seed: 3 })
    expect(exercise.xml).toContain('<sign>F</sign>')
    for (const note of exercise.notes) {
      expect(note.pitch).toBeGreaterThanOrEqual(48)
      expect(note.pitch).toBeLessThanOrEqual(55)
    }
    sameAttacks(exercise.xml, exercise.notes)
  })

  it('stays inside the key and makes every hand fill the bar', () => {
    for (const level of SIGHT_LEVELS) {
      const exercise = generateSightPhrase({ level: level.id, seed: 11 })
      const scale = new Set(scalePitches(0, 127, exercise.fifths).map((pitch) => pitch % 12))
      for (const note of exercise.notes) expect(scale.has(((note.pitch % 12) + 12) % 12)).toBe(true)
      const hands = [...new Set(exercise.notes.map((note) => note.hand))]
      for (let measure = 1; measure <= level.bars; measure += 1) {
        if (level.texture === 'single') {
          const covered = exercise.notes.filter((note) => note.measure === measure).reduce((sum, note) => sum + note.duration, 0)
          if (level.rests) expect(covered).toBeGreaterThan(0)
          else expect(covered).toBeCloseTo(4)
          expect(covered).toBeLessThanOrEqual(4 + 1e-6)
        } else {
          for (const hand of hands) {
            const covered = exercise.notes
              .filter((note) => note.hand === hand && note.measure === measure)
              .reduce((sum, note) => sum + note.duration, 0)
            expect(covered).toBeCloseTo(4)
          }
        }
      }
      sameAttacks(exercise.xml, exercise.notes)
    }
  })

  it('uses only C, G, or F at L9', () => {
    const seen = new Set<number>()
    for (let seed = 1; seed <= 12; seed += 1) seen.add(generateSightPhrase({ level: 9, seed }).fifths)
    expect([...seen].sort()).toEqual([-1, 0, 1])
    const exercise = generateSightPhrase({ level: 9, seed: 4 })
    expect([-1, 0, 1]).toContain(exercise.fifths)
    expect(tonicPc(exercise.fifths)).toBe((((exercise.fifths * 7) % 12) + 12) % 12)
  })

  it('is deterministic for a seed', () => {
    const left = generateSightPhrase({ level: 8, seed: 99 })
    const right = generateSightPhrase({ level: 8, seed: 99 })
    expect(left.xml).toBe(right.xml)
    expect(generateSightPhrase({ level: 8, seed: 100 }).xml).not.toBe(left.xml)
  })

  it('aims flashcards at a weak pitch', () => {
    const weakness = new Map([[64, 1]])
    let hits = 0
    for (let seed = 1; seed <= 80; seed += 1) {
      const card = generateFlash({ level: 1, seed, weakness, focusWeak: true })
      expect(card.notes).toHaveLength(1)
      if (card.notes[0]?.pitch === 64) hits += 1
    }
    expect(hits).toBeGreaterThan(40)
  })
})

describe('pickWeighted', () => {
  it('follows the cumulative weight', () => {
    const items = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 3 },
    ]
    expect(pickWeighted(() => 0, items)).toBe('a')
    expect(pickWeighted(() => 0.9, items)).toBe('b')
    expect(mulberry32(1)()).toBe(mulberry32(1)())
  })
})
