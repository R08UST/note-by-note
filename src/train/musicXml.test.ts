import { describe, expect, it } from 'vitest'
import type { ScoreNote } from '../judge/types'
import { mapNotesToHeads, type GraphicHead } from '../score/mapNotes'
import { parseMusicXml } from '../score/parseMusicXml'
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
})
