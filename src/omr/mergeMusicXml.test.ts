import { describe, expect, it } from 'vitest'
import { mergeMusicXml, pageRange } from './mergeMusicXml'

function score(measures: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`
}

const attributes = `<attributes>
  <divisions>1</divisions>
  <key><fifths>0</fifths></key>
  <time><beats>4</beats><beat-type>4</beat-type></time>
  <clef><sign>G</sign><line>2</line></clef>
</attributes>`

function measure(number: number, step: string, withAttributes = false, fifths?: number): string {
  const key = fifths == null ? attributes : attributes.replace('<fifths>0</fifths>', `<fifths>${fifths}</fifths>`)
  return `<measure number="${number}">${withAttributes ? key : ''}<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration></note></measure>`
}

describe('mergeMusicXml', () => {
  it('concatenates measures, renumbers them, and drops a repeated signature', () => {
    const merged = mergeMusicXml([
      { label: '1', xml: score(measure(1, 'C', true) + measure(2, 'D')) },
      { label: '2', xml: score(measure(1, 'E', true) + measure(2, 'F')) },
    ])
    const doc = new DOMParser().parseFromString(merged, 'application/xml')
    const measures = [...doc.getElementsByTagName('measure')]
    expect(measures.map((item) => item.getAttribute('number'))).toEqual(['1', '2', '3', '4'])
    expect(measures[0]?.getElementsByTagName('attributes').length).toBe(1)
    expect(measures[2]?.getElementsByTagName('attributes').length).toBe(0)
    expect(measures.map((item) => item.getElementsByTagName('step')[0]?.textContent)).toEqual(['C', 'D', 'E', 'F'])
  })

  it('keeps a key change on a later page', () => {
    const merged = mergeMusicXml([
      { label: '1', xml: score(measure(1, 'C', true)) },
      { label: '2', xml: score(measure(1, 'F', true, 1)) },
    ])
    const doc = new DOMParser().parseFromString(merged, 'application/xml')
    const measures = [...doc.getElementsByTagName('measure')]
    expect(measures[1]?.getElementsByTagName('fifths')[0]?.textContent).toBe('1')
    expect(measures[1]?.getElementsByTagName('clef').length).toBe(0)
    expect(measures[1]?.getElementsByTagName('time').length).toBe(0)
  })
})

describe('pageRange', () => {
  it('reads a range and treats an empty spec as every page', () => {
    expect(pageRange('1-3, 5', 6)).toEqual([1, 2, 3, 5])
    expect(pageRange('', 3)).toEqual([1, 2, 3])
    expect(pageRange('8-9', 4)).toEqual([])
  })
})
