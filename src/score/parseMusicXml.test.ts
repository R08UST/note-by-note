import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { normalizeForOsmd, unpackMxl } from './mxl'
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
  it('keeps a measure numbered 0', () => {
    const parsed = parseMusicXml(score(measure(0, attributes + pitched('G', 4, 1)) + measure(1, pitched('C', 4, 1))))
    expect(parsed.notes.map((note) => note.measure)).toEqual([0, 1])
  })

  it('maps middle C to MIDI 60 and keeps the measure', () => {
    const parsed = parseMusicXml(score(measure(1, attributes + pitched('C', 4, 1))))
    expect(parsed.notes).toEqual([
      { id: 'n1', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1, voice: '1', localBeat: 0 },
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

  it('merges a tie stop that forgot its voice', () => {
    const start = `<note><pitch><step>F</step><octave>2</octave></pitch><duration>2</duration><voice>2</voice><tie type="start"/><type>half</type></note>`
    const stop = `<note><pitch><step>F</step><octave>2</octave></pitch><duration>2</duration><tie type="stop"/><type>half</type></note>`
    const parsed = parseMusicXml(score(measure(1, attributes + start) + measure(2, stop)))
    expect(parsed.notes).toHaveLength(1)
    expect(parsed.notes[0]).toMatchObject({ pitch: 41, duration: 4, measure: 1 })
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

  it('gives every part the longest bar when the parts disagree', () => {
    // The left hand's first bar is overfull by a quarter. OSMD engraves that bar
    // one quarter longer for both hands, so the right hand's second bar starts a
    // quarter late too. Beats must follow that shared clock, or eighth notes land
    // on the previous beat once the hands drift apart.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Right</part-name></score-part>
    <score-part id="P2"><part-name>Left</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">${attributes}${pitched('C', 4, 4)}</measure>
    <measure number="2">${pitched('D', 4, 4)}</measure>
  </part>
  <part id="P2">
    <measure number="1">${attributes}${pitched('C', 3, 4)}${pitched('E', 3, 1)}</measure>
    <measure number="2">${pitched('F', 3, 4)}</measure>
  </part>
</score-partwise>`
    const parsed = parseMusicXml(xml)
    const byPitch = new Map(parsed.notes.map((note) => [note.pitch, note.beat]))
    expect(byPitch.get(60)).toBe(0)    // C4, right hand bar 1
    expect(byPitch.get(62)).toBe(5)    // D4, right hand bar 2: the shared first bar is 5 beats
    expect(byPitch.get(48)).toBe(0)    // C3, left hand bar 1
    expect(byPitch.get(52)).toBe(4)    // E3, left hand bar 1, the overfull extra quarter
    expect(byPitch.get(53)).toBe(5)    // F3, left hand bar 2: both hands share the same clock
    expect(parsed.totalBeats).toBe(9)  // 5 + 4
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

describe('printed expression', () => {
  const direction = (body: string) => `<direction placement="below"><direction-type>${body}</direction-type></direction>`

  it('reads printed dynamics as velocity', () => {
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            direction('<dynamics><f/></dynamics>') +
            pitched('C', 4, 1) +
            direction('<dynamics><pp/></dynamics>') +
            pitched('D', 4, 1),
        ),
      ),
    )
    expect(parsed.dynamics).toEqual([
      { beat: 0, velocity: 96, staff: undefined },
      { beat: 1, velocity: 33, staff: undefined },
    ])
  })

  it('reads a sound dynamics value against mf = 90', () => {
    const parsed = parseMusicXml(
      score(measure(1, attributes + `<direction><sound dynamics="45"/></direction>` + pitched('C', 4, 1))),
    )
    expect(parsed.dynamics[0].velocity).toBe(40)
  })

  it('pairs a crescendo with its stop', () => {
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            direction('<wedge type="crescendo"/>') +
            pitched('C', 4, 1) +
            pitched('D', 4, 1) +
            direction('<wedge type="stop"/>') +
            pitched('E', 4, 1),
        ),
      ),
    )
    expect(parsed.wedges).toEqual([{ startBeat: 0, endBeat: 2, direction: 'crescendo', staff: undefined }])
  })

  it('closes a hairpin that never stopped at the end of the piece', () => {
    const parsed = parseMusicXml(
      score(measure(1, attributes + direction('<wedge type="diminuendo"/>') + pitched('C', 4, 1))),
    )
    expect(parsed.wedges[0]).toMatchObject({ startBeat: 0, endBeat: 4, direction: 'diminuendo' })
  })

  it('reads a pedal down and up', () => {
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            direction('<pedal type="start" line="yes"/>') +
            pitched('C', 3, 1) +
            pitched('D', 3, 1) +
            direction('<pedal type="stop" line="yes"/>') +
            pitched('E', 3, 1),
        ),
      ),
    )
    expect(parsed.pedals).toEqual([{ downBeat: 0, upBeat: 2 }])
  })

  it('treats a pedal change as a lift and a new press on the same beat', () => {
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            direction('<pedal type="start"/>') +
            pitched('C', 3, 1) +
            direction('<pedal type="change"/>') +
            pitched('D', 3, 1),
        ),
      ),
    )
    expect(parsed.pedals).toEqual([
      { downBeat: 0, upBeat: 1 },
      { downBeat: 1, upBeat: 4 },
    ])
  })

  it('reads a printed tempo', () => {
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            `<direction><sound tempo="120"/></direction>` +
            pitched('C', 4, 1) +
            `<direction><sound tempo="60"/></direction>` +
            pitched('D', 4, 1),
        ),
      ),
    )
    expect(parsed.tempos).toEqual([
      { beat: 0, bpm: 120 },
      { beat: 1, bpm: 60 },
    ])
  })

  it('converts a metronome mark to quarter notes per minute', () => {
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            direction('<metronome><beat-unit>half</beat-unit><per-minute>60</per-minute></metronome>') +
            pitched('C', 4, 1),
        ),
      ),
    )
    expect(parsed.tempos[0]).toEqual({ beat: 0, bpm: 120 })
  })

  it('keeps an articulation on its note', () => {
    const mark = (name: string) => `<notations><articulations><${name}/></articulations></notations>`
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            `<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${mark('staccato')}</note>` +
            `<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${mark('accent')}</note>` +
            `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${mark('strongaccent')}</note>`,
        ),
      ),
    )
    expect(parsed.notes.map((note) => note.articulation)).toEqual(['staccato', 'accent', 'marcato'])
  })

  it('numbers the notes under one slur', () => {
    const slur = (type: string) => `<notations><slur type="${type}" number="1"/></notations>`
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            `<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${slur('start')}</note>` +
            `<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${slur('stop')}</note>` +
            pitched('E', 4, 1),
        ),
      ),
    )
    expect(parsed.notes.map((note) => note.slur)).toEqual([1, 1, undefined])
  })

  it('marks a fermata and holds it through a tie', () => {
    const start = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/><type>half</type><notations><fermata type="upright"/></notations></note>`
    const stop = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="stop"/><type>half</type></note>`
    const parsed = parseMusicXml(score(measure(1, attributes + start + stop)))
    expect(parsed.notes).toHaveLength(1)
    expect(parsed.notes[0]).toMatchObject({ pitch: 60, duration: 4, fermata: true })
  })

  it('hangs grace notes on the note they lean on', () => {
    const grace = (step: string) =>
      `<note><grace/><pitch><step>${step}</step><octave>4</octave></pitch><type>16th</type></note>`
    const parsed = parseMusicXml(score(measure(1, attributes + grace('D') + grace('E') + pitched('F', 4, 1))))
    expect(parsed.notes).toHaveLength(1)
    expect(parsed.notes[0]).toMatchObject({ pitch: 65, beat: 0, graces: [62, 64] })
  })

  it('reads a printed ornament with its diatonic neighbours', () => {
    const mark = (name: string) => `<notations><ornaments><${name}/></ornaments></notations>`
    const parsed = parseMusicXml(
      score(
        measure(
          1,
          attributes +
            `<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${mark('trill-mark')}</note>` +
            `<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${mark('mordent')}</note>` +
            `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${mark('inverted-mordent')}</note>` +
            `<note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type>${mark('turn')}</note>`,
        ),
      ),
    )
    expect(parsed.notes.map((note) => note.ornament?.kind)).toEqual([
      'trill',
      'mordent',
      'inverted-mordent',
      'turn',
    ])
    expect(parsed.notes[0].ornament).toEqual({ kind: 'trill', upper: 62, lower: 59 })
  })

  it('keeps an ornament diatonic in the key signature', () => {
    const gMajor = `<attributes>
      <divisions>1</divisions>
      <key><fifths>1</fifths></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
    </attributes>`
    const trill = `<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><type>quarter</type><notations><ornaments><trill-mark/></ornaments></notations></note>`
    const parsed = parseMusicXml(score(measure(1, gMajor + trill)))
    // F sharp trills to G, not to G sharp.
    expect(parsed.notes[0].ornament).toMatchObject({ upper: 67, lower: 64 })
  })

  it('leaves every expression list empty when the score prints none', () => {
    const parsed = parseMusicXml(BUNDLED_PIECES[0].xml)
    expect(parsed.dynamics).toEqual([])
    expect(parsed.wedges).toEqual([])
    expect(parsed.pedals).toEqual([])
    expect(parsed.tempos).toEqual([])
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

describe('normalizeForOsmd', () => {
  it('adds the direction-type that bare tempo directions omit', () => {
    const bare = '<direction placement="above"><staff>1</staff><sound tempo="60"/></direction>'
    expect(normalizeForOsmd(bare)).toBe(
      '<direction placement="above"><direction-type/><staff>1</staff><sound tempo="60"/></direction>',
    )
  })

  it('is idempotent and leaves typed directions alone', () => {
    const bare = '<direction><sound tempo="60"/></direction>'
    const fixed = normalizeForOsmd(bare)
    expect(normalizeForOsmd(fixed)).toBe(fixed)
    const typed = '<direction><direction-type><dynamics><f/></dynamics></direction-type></direction>'
    expect(normalizeForOsmd(typed)).toBe(typed)
    expect(normalizeForOsmd('<direction/>')).toBe('<direction/>')
  })

  it('keeps the tempo the parser reads', () => {
    const xml = score(
      measure(
        1,
        attributes + '<direction placement="above"><staff>1</staff><sound tempo="60"/></direction>' + pitched('C', 4, 1),
      ),
    )
    const parsed = parseMusicXml(normalizeForOsmd(xml))
    expect(parsed.tempos).toEqual([{ beat: 0, bpm: 60 }])
    expect(parsed.notes).toHaveLength(1)
  })

  it('untie a grace note so the printed note keeps its head', () => {
    const grace =
      '<note><grace/><pitch><step>E</step><octave>6</octave></pitch><tie type="start"/><voice>1</voice><type>32nd</type>' +
      '<notations><tied type="start"/></notations></note>'
    const printed = '<note><chord/><pitch><step>E</step><octave>6</octave></pitch><duration>1</duration><tie type="stop"/>' +
      '<voice>1</voice><type>quarter</type><notations><tied type="stop"/></notations></note>'
    const fixed = normalizeForOsmd(grace + printed)
    const [graceBlock] = fixed.split('</note>')
    expect(graceBlock).not.toContain('<tie')
    expect(graceBlock).not.toContain('<tied')
    expect(graceBlock).toContain('<grace/>')
    // The printed note is a chord tone of the same pitch, so its own tie stop stays.
    expect(fixed).toContain('<tie type="stop"/>')
  })

  it('keeps a tie between two printed notes', () => {
    const tied = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/>` +
      `<type>quarter</type><notations><tied type="start"/></notations></note>` +
      `<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/>` +
      `<type>quarter</type><notations><tied type="stop"/></notations></note>`
    expect(normalizeForOsmd(tied)).toBe(tied)
  })

  it('splits a rest longer than its bar, which OSMD would clamp to one bar', () => {
    const long = '<note><rest/><duration>6</duration><voice>2</voice><type>half</type><staff>2</staff></note>'
    const fixed = normalizeForOsmd(score(measure(1, attributes + long)))
    // The printed rest keeps its marks and becomes a whole note; the extra rests are hidden.
    expect(fixed).toContain('<duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff>')
    expect(fixed).toContain('<note print-object="no"><rest/><duration>2</duration><voice>2</voice><type>half</type><staff>2</staff></note>')
  })

  it('leaves a rest that fits its bar alone', () => {
    const fits = '<note><rest/><duration>4</duration><voice>2</voice><type>whole</type></note>'
    expect(normalizeForOsmd(score(measure(1, attributes + fits)))).toBe(score(measure(1, attributes + fits)))
  })
})
