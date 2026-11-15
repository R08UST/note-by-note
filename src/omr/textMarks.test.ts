import { describe, expect, it } from 'vitest'
import { dynamicOf, marksOf, playableTexts, tempoOf, writeTextsIntoMusicXml, type ReadText } from './textMarks'

function text(value: string, staff = 0, x0 = 0.1): ReadText {
  return { score: 0.99, staff, text: value, x0, x1: x0 + 0.05, y0: 0.1, y1: 0.12 }
}

/** Two parts, so a letter can be shown to land in the one it was read above. */
const TWO_PARTS = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name /></score-part>
    <score-part id="P2"><part-name /></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
  </part>
</score-partwise>`

describe('tempoOf', () => {
  it('reads the number after a note sign', () => {
    expect(tempoOf('♩=96')).toBe(96)
    expect(tempoOf('♩ = 120')).toBe(120)
    expect(tempoOf('q=88')).toBe(88)
  })

  it('reads nothing from a bare number, which is usually a bar or a fingering', () => {
    expect(tempoOf('3')).toBeNull()
    expect(tempoOf('96')).toBeNull()
  })
})

describe('dynamicOf', () => {
  it('keeps a dynamic letter on its own', () => {
    expect(dynamicOf('ff')).toBe('ff')
    expect(dynamicOf('pp')).toBe('pp')
    expect(dynamicOf('sfz')).toBe('sfz')
    expect(dynamicOf('mf')).toBe('mf')
    expect(dynamicOf(' f ')).toBe('f')
  })

  it('drops a word that merely starts like one', () => {
    expect(dynamicOf('finger')).toBeNull()
    expect(dynamicOf('finale')).toBeNull()
    expect(dynamicOf('fp')).toBe('fp')
  })
})

describe('playableTexts', () => {
  it('keeps a tempo and a dynamic and drops the title, which is already the work title', () => {
    const kept = playableTexts([text('Andante'), text('♩=96'), text('mf'), text('Page 2')])
    expect(kept.map((item) => item.text)).toEqual(['♩=96', 'mf'])
  })

  it('keeps the clearest of two readings of the same letter', () => {
    const kept = playableTexts([text('♩=96', 0, 0.5), text('♩=96', 1, 0.5)])
    expect(kept).toHaveLength(2)
  })
})

describe('marksOf', () => {
  it('answers the tempo a page prints and every dynamic it prints, once each', () => {
    const marks = marksOf([text('♩=96'), text('mf'), text('mf'), text('pp')])
    expect(marks.tempo).toBe(96)
    expect(marks.dynamics).toEqual(['mf', 'pp'])
  })

  it('answers no tempo when the page prints none', () => {
    expect(marksOf([text('mf')]).tempo).toBeNull()
  })
})

describe('writeTextsIntoMusicXml', () => {
  it('writes a tempo into the first measure of the part whose staff it was read above', () => {
    const xml = writeTextsIntoMusicXml(TWO_PARTS, [text('♩=96', 1)], 2)
    expect(xml).toContain('<direction')
    expect(xml).toContain('<words font-weight="bold">♩=96</words>')
    // The direction sits in the second part, ahead of its first note.
    const second = xml.slice(xml.lastIndexOf('<part id="P2"'))
    expect(second).toContain('<direction')
    const first = xml.slice(xml.indexOf('<part id="P1"'), xml.indexOf('<part id="P2"'))
    expect(first).not.toContain('<direction')
  })

  it('writes nothing that would sound, so the part plays as it did', () => {
    const xml = writeTextsIntoMusicXml(TWO_PARTS, [text('mf')], 2)
    expect(xml).not.toContain('<sound')
    expect(xml).not.toContain('<metronome')
    expect(xml).not.toContain('<dynamics>')
    expect(xml).toContain('<words font-weight="bold">mf</words>')
  })

  it('leaves the score alone when a page prints no playable letter', () => {
    expect(writeTextsIntoMusicXml(TWO_PARTS, [text('Allegro')], 2)).toBe(TWO_PARTS)
  })

  it('leaves the score alone when no part could hold the letter', () => {
    expect(writeTextsIntoMusicXml(TWO_PARTS, [text('mf', 0)], 0)).toBe(TWO_PARTS)
  })

  it('keeps the letters in the order they are printed', () => {
    const xml = writeTextsIntoMusicXml(TWO_PARTS, [text('pp', 0, 0.8), text('♩=60', 0, 0.1)], 2)
    expect(xml.indexOf('♩=60')).toBeLessThan(xml.indexOf('pp'))
  })

  it('survives a score that is not partwise MusicXML', () => {
    const timewise = '<score-timewise><measure><part /></measure></score-timewise>'
    expect(writeTextsIntoMusicXml(timewise, [text('mf')], 1)).toBe(timewise)
    expect(writeTextsIntoMusicXml('not xml at all', [text('mf')], 1)).toBe('not xml at all')
  })
})
