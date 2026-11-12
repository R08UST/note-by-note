import { describe, expect, it } from 'vitest'
import { musicalTime } from '../audio/engine'
import { parseMusicXml } from './parseMusicXml'

/**
 * A bar of C major with 32nds and a 32nd triplet. Divisions 8 means a quarter
 * note is 8 units, so a 32nd is 1 unit and a 32nd-triplet is 2/3 unit (MusicXML
 * writes the actual played duration, so the raw value is already tuplet-correct).
 */
const divisions = 8
function note(step: string, octave: number, duration: number): string {
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration></note>`
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>${divisions}</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      ${note('C', 4, 1)}${note('D', 4, 1)}${note('E', 4, 1)}${note('F', 4, 1)}
      ${note('G', 4, 8)}
      ${note('A', 4, 4)}
      ${note('B', 4, 2)}${note('C', 5, 2)}
      ${note('D', 5, 1)}${note('E', 5, 1)}${note('F', 5, 1)}${note('G', 5, 1)}
      ${note('A', 5, 8)}
    </measure>
  </part>
</score-partwise>`

describe('32nd notes reach playback unquantized', () => {
  it('parses 32nds onto the 1/8-beat grid and schedules them there', () => {
    const score = parseMusicXml(xml)
    const beats = score.notes.map((n) => n.beat)

    // Four 32nds fill a half beat: 0, 0.125, 0.25, 0.375.
    expect(beats.slice(0, 4)).toEqual([0, 0.125, 0.25, 0.375])

    // Their Tone transport strings must land between sixteenths, not snap.
    expect(musicalTime(beats[1])).toBe('0:0:0.5')
    expect(musicalTime(beats[3])).toBe('0:0:1.5')
  })

  it('keeps a 32nd triplet on its own grid', () => {
    const triplet = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>24</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>32nd</normal-type></time-modification>
      </note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>32nd</normal-type></time-modification>
      </note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>32nd</normal-type></time-modification>
      </note>
    </measure>
  </part>
</score-partwise>`
    const score = parseMusicXml(triplet)
    const beats = score.notes.map((n) => n.beat)
    // 2/24 = 1/12 beat apart.
    expect(beats[0]).toBeCloseTo(0)
    expect(beats[1]).toBeCloseTo(1 / 12)
    expect(beats[2]).toBeCloseTo(2 / 12)
    // Never snapped onto the sixteenth grid.
    expect(musicalTime(beats[1])).toBe('0:0:0.333')
  })
})
