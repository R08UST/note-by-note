import { describe, expect, it } from 'vitest'
import { overfullMeasures } from './overfullMeasures'

const note = (duration: number, extra = '') =>
  `<note>${extra}<pitch><step>C</step><octave>4</octave></pitch><duration>${duration}</duration></note>`

const score = (measures: string) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`

const attributes = '<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>'

describe('overfullMeasures', () => {
  it('flags only bars that run past the time signature', () => {
    const xml = score(`
      <measure number="1">${attributes}${note(2)}${note(2)}${note(2)}${note(2)}</measure>
      <measure number="2">${note(2)}${note(2)}${note(2)}${note(2)}${note(1)}</measure>
      <measure number="3">${note(4)}${note(4, '<chord/>')}${note(4)}<backup><duration>8</duration></backup>${note(8)}</measure>
      <measure number="4">${note(1, '<grace/>')}${note(8)}</measure>
      <measure number="5">${note(2)}</measure>
      <measure number="6">${note(4)}<backup><duration>2</duration></backup>${note(7)}</measure>
      <measure number="7">${note(4)}<backup><duration>2</duration></backup>${note(6)}</measure>`)
    expect(overfullMeasures(xml)).toEqual([2, 6])
  })

  it('follows a time signature change', () => {
    const threeFour = '<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>'
    const xml = score(`
      <measure number="1">${attributes}${note(8)}</measure>
      <measure number="2">${threeFour}${note(8)}</measure>`)
    expect(overfullMeasures(xml)).toEqual([2])
  })

  it('ignores a long trailing rest but not a note it pushes late', () => {
    const rest = (duration: number) => `<note><rest/><duration>${duration}</duration></note>`
    const xml = score(`
      <measure number="1">${attributes}${note(6)}${rest(4)}</measure>
      <measure number="2">${rest(4)}${note(6)}</measure>`)
    expect(overfullMeasures(xml)).toEqual([2])
  })

  it('keeps the metre when only divisions change', () => {
    const xml = score(`
      <measure number="1">${attributes}${note(8)}</measure>
      <measure number="2"><attributes><divisions>4</divisions></attributes>${note(16)}</measure>
      <measure number="3">${note(17)}</measure>`)
    expect(overfullMeasures(xml)).toEqual([3])
  })
})
