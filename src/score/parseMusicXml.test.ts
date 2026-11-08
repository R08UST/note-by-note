import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { unpackMxl } from './mxl'
import { parseMusicXml } from './parseMusicXml'
import { BUNDLED_PIECES } from './pieces'

function score(inner: string, title = 'Fixture'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${inner}</part>
</score-partwise>`
}

function measure(number: number, body: string, implicit = false): string {
  const flag = implicit ? ' implicit="yes"' : ''
  return `<measure number="${number}"${flag}>${body}</measure>`
}

const attributes = `<attributes>
  <divisions>1</divisions>
  <key><fifths>0</fifths></key>
  <time><beats>4</beats><beat-type>4</beat-type></time>
  <clef><sign>G</sign><line>2</line></clef>
</attributes>`

function pitched(step: string, octave: number, duration: number, extra = ''): string {
  const type = duration >= 4 ? 'whole' : duration === 2 ? 'half' : 'quarter'
  return `<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><type>${type}</type></note>`
}

describe('parseMusicXml', () => {
  it('maps middle C to MIDI 60 and keeps the measure', () => {
    const parsed = parseMusicXml(score(measure(1, attributes + pitched('C', 4, 1))))
    expect(parsed.notes).toEqual([
      { id: 'n1', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1 },
    ])
    expect(parsed.title).toBe('Fixture')
    expect(parsed.timeSignature).toEqual({ beats: 4, beatType: 4 })
  })

  it('applies accidentals', () => {
    const sharp = `<note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>`
    const flat = `<note><pitch><step>B</step><alter>-1</alter><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>`
    const parsed = parseMusicXml(score(measure(1, attributes + sharp + flat)))
    expect(parsed.notes.map((note) => note.pitch)).toEqual([61, 58])
    expect(parsed.notes[1].beat).toBe(1)
  })

  it('skips rests and grace notes but keeps the timeline', () => {
    const rest = `<note><rest/><duration>1</duration><type>quarter</type></note>`
    const grace = `<note><grace/><pitch><step>D</step><octave>4</octave></pitch><type>eighth</type></note>`
    const parsed = parseMusicXml(score(measure(1, attributes + rest + grace + pitched('E', 4, 1))))
    expect(parsed.notes).toHaveLength(1)
    expect(parsed.notes[0]).toMatchObject({ pitch: 64, beat: 1 })
  })

  it('merges a tied continuation into the first note', () => {
    const start = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/><type>half</type></note>`
    const stop = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="stop"/><type>half</type></note>`
    const parsed = parseMusicXml(score(measure(1, attributes + start + stop)))
    expect(parsed.notes).toEqual([
      expect.objectContaining({ pitch: 60, beat: 0, duration: 4 }),
    ])
  })

  it('shares a beat across chord tones', () => {
    const chord = (step: string, octave: number, first = false) =>
      `<note>${first ? '' : '<chord/>'}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><type>whole</type></note>`
    const parsed = parseMusicXml(score(measure(1, attributes + chord('C', 4, true) + chord('E', 4) + chord('G', 4))))
    expect(parsed.notes.map((note) => note.pitch)).toEqual([60, 64, 67])
    expect(new Set(parsed.notes.map((note) => note.beat))).toEqual(new Set([0]))
  })

  it('reads staff 1 as the right hand and staff 2 as the left, including backup', () => {
    const piano = `<attributes>
      <divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <staves>2</staves>
      <clef number="1"><sign>G</sign><line>2</line></clef>
      <clef number="2"><sign>F</sign><line>4</line></clef>
    </attributes>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note>`
    const parsed = parseMusicXml(score(measure(1, piano)))
    expect(parsed.notes).toEqual([
      expect.objectContaining({ pitch: 64, hand: 'R', beat: 0 }),
      expect.objectContaining({ pitch: 48, hand: 'L', beat: 0 }),
    ])
  })

  it('keeps a second part on the same timeline and treats it as the left hand', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Right</part-name></score-part>
    <score-part id="P2"><part-name>Left</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">${attributes}${pitched('C', 4, 1)}</measure></part>
  <part id="P2"><measure number="1">${attributes}${pitched('C', 3, 1)}</measure></part>
</score-partwise>`
    const parsed = parseMusicXml(xml)
    expect(parsed.notes.map((note) => ({ pitch: note.pitch, hand: note.hand, beat: note.beat }))).toEqual([
      { pitch: 60, hand: 'R', beat: 0 },
      { pitch: 48, hand: 'L', beat: 0 },
    ])
  })

  it('honours divisions and an implicit pickup measure', () => {
    const div = `<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`
    const quarter = `<note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>`
    const parsed = parseMusicXml(
      score(measure(1, div + quarter, true) + measure(2, quarter)),
    )
    expect(parsed.notes.map((note) => note.beat)).toEqual([0, 1])
    expect(parsed.notes[0].duration).toBeCloseTo(1)
  })

  it('parses the bundled pieces', () => {
    const twinkle = parseMusicXml(BUNDLED_PIECES[0].xml)
    expect(twinkle.notes[0]).toMatchObject({ pitch: 60, hand: 'R', beat: 0, measure: 1 })
    expect(twinkle.notes.every((note) => note.hand === 'R')).toBe(true)
    expect(twinkle.notes).toHaveLength(42)
    expect(twinkle.notes[1]).toMatchObject({ pitch: 60, beat: 1 })
    expect(twinkle.notes[4]).toMatchObject({ pitch: 69, beat: 4 })

    const steps = parseMusicXml(BUNDLED_PIECES[1].xml)
    expect(steps.notes.some((note) => note.hand === 'L')).toBe(true)
    expect(steps.notes.some((note) => note.hand === 'R')).toBe(true)
    expect(steps.notes.filter((note) => note.beat === 0).map((note) => note.pitch).sort()).toEqual([48, 64])

    const chords = parseMusicXml(BUNDLED_PIECES[2].xml)
    const opening = chords.notes.filter((note) => note.beat === 0).map((note) => note.pitch).sort((a, b) => a - b)
    expect(opening).toEqual([48, 60, 64, 67])
  })
})

describe('unpackMxl', () => {
  it('reads the score path from the container', () => {
    const xml = score(measure(1, attributes + pitched('C', 4, 1)))
    const packed = zipSync({
      'META-INF/container.xml': new TextEncoder().encode(
        '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>',
      ),
      'score.xml': new TextEncoder().encode(xml),
    })
    const parsed = parseMusicXml(unpackMxl(packed))
    expect(parsed.notes[0].pitch).toBe(60)
  })
})
