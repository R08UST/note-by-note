import { unzipSync } from 'fflate'

function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data)
}

/** Unpack a compressed .mxl score to MusicXML text. */
export function unpackMxl(data: Uint8Array): string {
  const files = unzipSync(data)
  const container = files['META-INF/container.xml']
  if (container) {
    const path = decode(container).match(/full-path="([^"]+)"/)?.[1]
    if (path && files[path]) return decode(files[path])
  }
  const fallback = Object.entries(files).find(
    ([name]) => name.toLowerCase().endsWith('.xml') && !name.includes('META-INF'),
  )
  if (!fallback) throw new Error('The .mxl archive does not contain a score.')
  return decode(fallback[1])
}

/** Note types that are a quarter note or longer, so a beam cannot apply to them. */
const BEAMABLE_OR_LONGER = new Set(['quarter', 'half', 'whole', 'breve', 'long', 'maxima'])

/**
 * Rest lengths as a multiple of a quarter note, longest first. A span longer than a bar is
 * rewritten as several of these, because OSMD clamps a single rest to the bar length.
 */
const REST_SHAPES: { value: number; type: string; dots: number }[] = [
  { value: 4, type: 'whole', dots: 0 },
  { value: 3, type: 'half', dots: 1 },
  { value: 2, type: 'half', dots: 0 },
  { value: 1.5, type: 'quarter', dots: 1 },
  { value: 1, type: 'quarter', dots: 0 },
  { value: 0.75, type: 'eighth', dots: 1 },
  { value: 0.5, type: 'eighth', dots: 0 },
  { value: 0.375, type: '16th', dots: 1 },
  { value: 0.25, type: '16th', dots: 0 },
  { value: 0.125, type: '32nd', dots: 0 },
  { value: 0.0625, type: '64th', dots: 0 },
]

/**
 * Repair the four MusicXML mistakes OSMD cannot draw. A score is rejected as a whole when
 * the first two appear, which leaves the player with a blank sheet:
 *
 * - A `<direction>` without a `<direction-type>`, which some exporters write for a bare
 *   `<sound tempo>`. The measure is dropped and its notes with it.
 * - A `<beam>` on a quarter note or longer, which happens when a triplet quarter note is
 *   beamed. OSMD throws `Beams can only be applied to notes shorter than a quarter note`.
 *
 * The other two only lose a note or move it: a grace note that carries `<tie type="start">`
 * makes OSMD tie the printed note after it to that silent grace note, so the printed note is
 * drawn as a tie continuation and no longer has a head of its own; and a rest written longer
 * than its bar is read as a whole-bar rest, so every later note of that voice lands too early.
 * A grace note has no duration, so it cannot be tied to anything.
 *
 * None of these elements is read by `parseMusicXml`, so only the engraving changes:
 * OSMD falls back to its own beaming and draws the printed note as an ordinary attack, which
 * is what the printed score shows anyway.
 */
export function normalizeForOsmd(xml: string): string {
  const repaired = xml
    .replace(/<direction(\s[^>]*)?>(?!\s*<direction-type[\s>/])/g, (whole) => `${whole}<direction-type/>`)
    .replace(/<note\b[\s\S]*?<\/note>/g, (note) => {
      const untied = untieGrace(note)
      const type = untied.match(/<type>([^<]*)<\/type>/)?.[1]
      if (!type || !BEAMABLE_OR_LONGER.has(type) || !/<beam\b/.test(untied)) return untied
      return untied.replace(/\s*<beam\b[^>]*>[\s\S]*?<\/beam>|\s*<beam\b[^>]*\/>/g, '')
    })
  return splitOverlongRests(repaired)
}

/**
 * Split a rest that is longer than its bar. OSMD reads such a rest as a whole-bar rest and
 * advances the cursor by one bar instead of by the written length, so every later note in that
 * voice lands too early — in `noc-mozart-fantasy-in-d-minor-kv-397` a four-beat rest written in
 * a 2/4 bar pulled three notes two beats ahead of the clock the parser keeps. The extra rests are
 * hidden, so the page still shows the one rest the engraver printed.
 */
function splitOverlongRests(xml: string): string {
  let divisions = 1
  /** Bar length in divisions. */
  let bar = 4
  return xml.replace(/<measure\b[^>]*>[\s\S]*?<\/measure>/g, (measure) => {
    for (const attributes of measure.match(/<attributes\b[\s\S]*?<\/attributes>/g) ?? []) {
      const written = attributes.match(/<divisions>(\d+)<\/divisions>/)?.[1]
      if (written) divisions = Number(written) || 1
      const time = attributes.match(/<time\b[\s\S]*?<\/time>/)?.[0]
      if (!time) continue
      const beats = Number(time.match(/<beats>(\d+)<\/beats>/)?.[1] ?? 4) || 4
      const beatType = Number(time.match(/<beat-type>(\d+)<\/beat-type>/)?.[1] ?? 4) || 4
      bar = beats * (4 / beatType) * divisions
    }
    if (!(bar > 0)) return measure
    return measure.replace(/<note\b[\s\S]*?<\/note>/g, (note) => {
      if (!/<rest\b/.test(note) || /<chord\b/.test(note) || /<grace\b/.test(note)) return note
      const duration = Number(note.match(/<duration>(\d+)<\/duration>/)?.[1])
      if (!Number.isFinite(duration) || duration <= bar) return note
      return splitRest(note, duration, bar, divisions)
    })
  })
}

/** Rewrite one over-long rest as several rests, the first one keeping the printed rest's marks. */
function splitRest(note: string, duration: number, bar: number, divisions: number): string {
  const pieces: { length: number; shape?: (typeof REST_SHAPES)[number] }[] = []
  let left = duration
  while (left > 0) {
    const limit = Math.min(left, bar)
    const shape = REST_SHAPES.find((item) => Number.isInteger(item.value * divisions) && item.value * divisions <= limit)
    if (!shape) {
      pieces.push({ length: left })
      break
    }
    const length = shape.value * divisions
    pieces.push({ length, shape })
    left -= length
  }
  if (pieces.length < 2) return note
  const voice = note.match(/<voice>([^<]*)<\/voice>/)?.[1]
  const staff = note.match(/<staff>([^<]*)<\/staff>/)?.[1]
  const first = pieces[0].shape ? retype(note, pieces[0].length, pieces[0].shape) : note.replace(/<duration>\d+<\/duration>/, `<duration>${pieces[0].length}</duration>`)
  const rest = pieces
    .slice(1)
    .map((piece) => {
      const type = piece.shape ? `<type>${piece.shape.type}</type>${'<dot/>'.repeat(piece.shape.dots)}` : ''
      const voiceTag = voice == null ? '' : `<voice>${voice}</voice>`
      const staffTag = staff == null ? '' : `<staff>${staff}</staff>`
      return `<note print-object="no"><rest/><duration>${piece.length}</duration>${voiceTag}${type}${staffTag}</note>`
    })
    .join('')
  return first + rest
}

/** Give a rest the length and note type of one piece. */
function retype(note: string, length: number, shape: (typeof REST_SHAPES)[number]): string {
  const withDuration = note.replace(/<duration>\d+<\/duration>/, `<duration>${length}</duration>`)
  const dots = '<dot/>'.repeat(shape.dots)
  if (/<type>[^<]*<\/type>/.test(withDuration)) {
    const typed = withDuration.replace(/<type>[^<]*<\/type>(?:<dot\/>)*/, `<type>${shape.type}</type>${dots}`)
    if (dots && !/<dot\/>/.test(typed)) return typed.replace(`<type>${shape.type}</type>`, `<type>${shape.type}</type>${dots}`)
    return typed
  }
  return withDuration.replace(/(<rest\b[^>]*\/>|<rest>[\s\S]*?<\/rest>)/, `$1<type>${shape.type}</type>${dots}`)
}

/** Drop the tie marks of a grace note, which cannot be tied to a note with a duration. */
function untieGrace(note: string): string {
  if (!/<grace\s*\/>|<grace\b/.test(note) || !/<tie\b|<tied\b/.test(note)) return note
  return note
    .replace(/\s*<tie\b[^>]*\/>/g, '')
    .replace(/\s*<tied\b[^>]*\/>/g, '')
    .replace(/<notations>\s*<\/notations>/g, '')
}

export async function readScoreFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.mxl')) {
    return unpackMxl(new Uint8Array(await file.arrayBuffer()))
  }
  return file.text()
}
