import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../score/parseMusicXml'
import { overfullMeasures } from './overfullMeasures'
import { repairVoiceTiming } from './repairVoiceTiming'

const note = (step: string, octave: number, duration: number, voice: string, staff: number, extra = '') =>
  `<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`
const backup = (duration: number) => `<backup><duration>${duration}</duration></backup>`

const score = (measures: string) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`

// 2/4, divisions 2: an eighth is 1, a quarter 2, the bar 4.
const attributes =
  '<attributes><divisions>2</divisions><time><beats>2</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>'

const onsets = (xml: string) =>
  parseMusicXml(xml)
    .notes.map((n) => `${n.staff}:${n.pitch}@${n.localBeat}`)
    .sort()

describe('repairVoiceTiming', () => {
  it('re-times a bar where homr lost a backup under a held note', () => {
    // Right hand: C5 eighth, E5 quarter, C5 eighth. Left hand: four eighths.
    // homr wrote the left-hand note at beat 1 without backing up under the held E5.
    const broken = score(`<measure number="1">${attributes}
      ${note('C', 5, 1, '1', 1)}${backup(1)}${note('C', 3, 1, '5', 2)}
      ${note('E', 5, 2, '1', 1)}${note('D', 3, 1, '5', 2)}
      ${note('C', 5, 1, '1', 1)}${backup(1)}${note('E', 3, 1, '5', 2)}${note('F', 3, 1, '5', 2)}
    </measure>`)
    expect(overfullMeasures(broken)).toEqual([1])

    const { xml, repaired } = repairVoiceTiming(broken)
    expect(repaired).toEqual([1])
    expect(overfullMeasures(xml)).toEqual([])
    expect(onsets(xml)).toEqual(
      ['1:72@0', '1:76@0.5', '1:72@1.5', '2:48@0', '2:50@0.5', '2:52@1', '2:53@1.5'].sort(),
    )
  })

  it('keeps chord tones with their note and the barline at the end', () => {
    const broken = score(`<measure number="1">${attributes}
      ${note('C', 5, 2, '1', 1)}${note('E', 5, 2, '1', 1, '<chord/>')}${note('C', 3, 2, '5', 2)}
      ${note('D', 5, 2, '1', 1)}${backup(2)}${note('D', 3, 2, '5', 2)}
      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>`)
    const { xml, repaired } = repairVoiceTiming(broken)
    expect(repaired).toEqual([1])
    expect(onsets(xml)).toEqual(['1:72@0', '1:76@0', '1:74@1', '2:48@0', '2:50@1'].sort())
    const measure = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('measure')[0]
    expect(measure?.lastElementChild?.localName).toBe('barline')
  })

  it('leaves a bar alone when it fits, or when one voice is too long by itself', () => {
    const fits = score(`<measure number="1">${attributes}
      ${note('C', 5, 4, '1', 1)}${backup(4)}${note('C', 3, 4, '5', 2)}</measure>`)
    expect(repairVoiceTiming(fits)).toEqual({ xml: fits, repaired: [] })

    const tooLong = score(`<measure number="1">${attributes}
      ${note('C', 5, 4, '1', 1)}${note('D', 5, 2, '1', 1)}${backup(6)}${note('C', 3, 4, '5', 2)}</measure>`)
    expect(repairVoiceTiming(tooLong)).toEqual({ xml: tooLong, repaired: [] })
  })
})
