import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { mapNotesToHeads, type GraphicHead } from '../score/mapNotes'
import { parseMusicXml } from '../score/parseMusicXml'
import { exerciseFromBank, type BankFile } from './bank'
import { generateRhythmLine, generateSight } from './generate'
import { techLevels } from './technique'

/**
 * The sheet view finds the cursor step by pairing every judged attack with the
 * notehead drawn for it. A generated note without a voice and a bar-relative
 * time never pairs, so the cursor stays parked at the first bar while the music
 * runs. This test plays OSMD's part with the parser's own reading of the XML.
 */
function headsDrawnFrom(xml: string): GraphicHead[] {
  return parseMusicXml(xml).notes.map((note, index) => ({
    key: `g${index}`,
    pitch: note.pitch,
    measure: note.measure,
    voice: note.voice ?? '',
    localBeat: note.localBeat ?? note.beat,
    hand: note.hand,
    grace: false,
    cue: false,
    tieTails: [],
  }))
}

function expectEveryAttackDrawn(built: { xml: string; notes: ScoreNote[] }) {
  expect(built.notes.length).toBeGreaterThan(0)
  const map = mapNotesToHeads(built.notes, headsDrawnFrom(built.xml))
  expect(map.unmatched).toEqual([])
  expect(map.matched).toBe(built.notes.length)
}

describe('training sheet', () => {
  it('gives every note a voice and a bar-relative time', () => {
    for (const note of generateSight({ level: 3, seed: 5, hand: 'both' }).notes) {
      expect(note.voice).toBeTruthy()
      expect(note.localBeat).toBeTypeOf('number')
      expect(note.localBeat ?? -1).toBeGreaterThanOrEqual(0)
    }
  })

  it('pairs a two-hand sight phrase', () => {
    expectEveryAttackDrawn(generateSight({ level: 3, seed: 5, hand: 'both' }))
  })

  it('pairs a one-hand sight phrase that runs past the first bar', () => {
    expectEveryAttackDrawn(generateSight({ level: 5, seed: 2, hand: 'L' }))
  })

  it('pairs a rhythm line', () => {
    expectEveryAttackDrawn(generateRhythmLine(3, 7))
  })

  it('pairs a scale drill', () => {
    const item = techLevels('scale')[0]?.items[0]
    if (!item) throw new Error('no scale drill')
    expectEveryAttackDrawn(item)
  })

  it('pairs a two-staff chord drill', () => {
    const item = techLevels('chord')[0]?.items[0]
    if (!item) throw new Error('no chord drill')
    expectEveryAttackDrawn(item)
  })

  it('cuts a stored bar that runs past its last beat into the next bar', () => {
    const item = {
      id: 'test',
      fifths: 0,
      beats: 4,
      beatType: 4,
      source: '',
      // Five quarter notes under measure 1: one beat too many for the bar.
      notes: Array.from({ length: 5 }, (_, index) => ({ p: 60 + index, t: 12, h: 'R' as const, m: 1 })),
    }
    const built = exerciseFromBank(item, 'test', 'R')
    expect(built.notes.map((note) => note.measure)).toEqual([1, 1, 1, 1, 2])
    expect(built.notes.map((note) => note.beat)).toEqual([0, 1, 2, 3, 4])
    expect(built.notes.at(-1)?.localBeat).toBe(0)
  })

  it('keeps every beat in one bar across the stored sight bank', () => {
    // The bank stores a whole phrase under one measure number in places. Laying
    // that out by the number made the next bar start before the first ended, so
    // wait mode asked for the second bar's notes while the player was in the first.
    for (const hand of ['r', 'l'] as const) {
      const file = JSON.parse(readFileSync(`src/train/banks/s3-${hand}.json`, 'utf8')) as BankFile
      for (const item of file.items) {
        const built = exerciseFromBank(item, item.id, hand === 'r' ? 'R' : 'L')
        const barsByBeat = new Map<number, Set<number>>()
        for (const note of built.notes) {
          const beat = Math.round(note.beat * 1000)
          const bar = barsByBeat.get(beat) ?? new Set<number>()
          bar.add(note.measure)
          barsByBeat.set(note.beat, bar)
        }
        for (const bar of barsByBeat.values()) expect(bar.size).toBe(1)
        for (const note of built.notes) expect(note.localBeat ?? 0).toBeLessThan(4)
      }
    }
  })
})
