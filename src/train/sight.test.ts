import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../score/parseMusicXml'
import { SIGHT_LEVELS } from './curriculum'
import { cellSpans, generateFlash, generateSight } from './generate'

describe('sight generator', () => {
  it('builds S1 from quarter and half cells inside C–E and ends V–I on the tonic', () => {
    const exercise = generateSight({ level: 1, seed: 1, hand: 'R' })
    expect(exercise.chords.at(-2)).toBe(5)
    expect(exercise.chords.at(-1)).toBe(1)
    expect(exercise.source).toContain('RCM Prep A')
    for (const note of exercise.notes) {
      expect(note.pitch).toBeGreaterThanOrEqual(60)
      expect(note.pitch).toBeLessThanOrEqual(64)
      expect([0.5, 1, 2]).toContain(note.duration)
    }
    expect(exercise.notes.at(-1)?.pitch).toBe(60)
    const parsed = parseMusicXml(exercise.xml)
    expect(parsed.notes.map((note) => note.pitch)).toEqual(exercise.notes.map((note) => note.pitch))
  })

  it('keeps every level inside its cell bank and repeats a seed', () => {
    for (const level of SIGHT_LEVELS) {
      const exercise = generateSight({ level: level.id, seed: 3, hand: 'R' })
      const allowed = new Set(cellSpans(level.id, 'sight'))
      for (const note of exercise.notes.filter((item) => item.hand === 'R')) {
        const ticks = Math.round(note.duration * 12)
        expect([...allowed].some((span) => ticks % span === 0)).toBe(true)
      }
      expect(exercise.chords.at(-1)).toBe(1)
    }
    expect(generateSight({ level: 4, seed: 8 }).xml).toBe(generateSight({ level: 4, seed: 8 }).xml)
  })

  it('puts flashcards in the level range', () => {
    const card = generateFlash({ level: 1, seed: 2, hand: 'R' })
    expect(card.notes).toHaveLength(1)
    expect(card.notes[0]?.pitch).toBeGreaterThanOrEqual(60)
    expect(card.notes[0]?.pitch).toBeLessThanOrEqual(64)
  })
})
