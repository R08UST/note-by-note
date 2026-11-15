/**
 * Turning the letters homr read on a page into what a practice score shows.
 *
 * homr's MusicXML carries notes and bars alone; the chord and title OCR this
 * tab asks for answers the letters above each staff. Most of them are the
 * title again or a page number, but a tempo number and a dynamic are what a
 * beginner sets before they play, so those are written into the first measure
 * as a direction that prints without sounding: the part plays as it did, and
 * the letter shows where it was printed.
 */

/** A text homr read, in the shape of the server's OmrText: page-normalised. */
export interface ReadText {
  score: number
  staff: number
  text: string
  x0: number
  x1: number
  y0: number
  y1: number
}

/** A note sign and a number, as "♩=96" or "q = 96" prints them. A bare number is not a tempo. */
const TEMPO = /^(?:[♩♪♫q])\s*\.?\s*=\s*(\d{2,3})$/iu

/** A dynamic word on its own, and nothing longer: "f" is one, "fingering" is not. Longest first, so pp is not read as p. */
const DYNAMIC = /^(fff|ff|mp|mf|pp|fp|sfz|sf|f|p)$/

/** The letters that change how a piece is played, nothing else. */
export function playableTexts(texts: readonly ReadText[]): ReadText[] {
  return texts.filter((text) => tempoOf(text.text) != null || dynamicOf(text.text) != null)
}

/** The number printed after a note sign, as "♩=96" gives 96. */
export function tempoOf(value: string): number | null {
  const squeezed = value.replace(/\s+/gu, '')
  const match = TEMPO.exec(squeezed)
  if (!match) return null
  const beats = match[1] ?? match[2]
  return beats == null ? null : Number(beats)
}

/** The dynamic a letter prints, as "ff" gives ff, and null for any longer word. */
export function dynamicOf(value: string): string | null {
  const squeezed = value.trim().replace(/\s+/gu, '')
  return DYNAMIC.exec(squeezed)?.[1] ?? null
}

/**
 * Write each kept letter into the first measure of the part whose staff it was
 * read above, as a direction that prints.
 *
 * homr writes one part per voice from the top of the page down, so a letter
 * read above staff `n` belongs in part `n`; a page with fewer parts than
 * staves puts the last ones in the part that is left. A letter that belongs
 * to no part of the MusicXML is dropped rather than guessed at.
 */
export function writeTextsIntoMusicXml(xml: string, texts: readonly ReadText[], partCount: number): string {
  const kept = texts.filter((text) => tempoOf(text.text) != null || dynamicOf(text.text) != null)
  if (kept.length === 0 || partCount <= 0) return xml
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  if (root.localName !== 'score-partwise') return xml
  const parts = [...root.children].filter((child) => child.localName === 'part')
  if (parts.length === 0) return xml
  const byPart = new Map<number, ReadText[]>()
  for (const text of kept) {
    if (text.staff < 0) continue
    const index = Math.min(parts.length - 1, text.staff)
    const group = byPart.get(index) ?? []
    group.push(text)
    byPart.set(index, group)
  }
  let changed = false
  for (const [index, group] of byPart) {
    const part = parts[index]
    const measure = part && [...part.children].find((child) => child.localName === 'measure')
    if (!part || !measure) continue
    const ordered = [...group].sort((left, right) => left.x0 - right.x0)
    for (const text of ordered) {
      const direction = doc.createElement('direction')
      direction.setAttribute('placement', 'above')
      const directionType = doc.createElement('direction-type')
      const words = doc.createElement('words')
      words.setAttribute('font-weight', 'bold')
      words.textContent = text.text.trim()
      directionType.append(words)
      direction.append(directionType)
      const offset = doc.createElement('offset')
      offset.textContent = '0'
      direction.append(offset)
      const before = [...measure.children].find((child) => ['note', 'backup', 'forward', 'attributes'].includes(child.localName))
      if (before) measure.insertBefore(direction, before)
      else measure.append(direction)
      changed = true
    }
  }
  if (!changed) return xml
  if (!root.getAttribute('version')) root.setAttribute('version', '4.0')
  return `<?xml version="1.0" encoding="UTF-8"?>\n${root.outerHTML}`
}

/** The dynamics and the tempo the player would set from a page, for the tab to show. */
export function marksOf(texts: readonly ReadText[]): { dynamics: string[]; tempo: number | null } {
  const dynamics: string[] = []
  let tempo: number | null = null
  for (const text of texts) {
    const beats = tempoOf(text.text)
    if (beats != null) tempo ??= beats
    const dynamic = dynamicOf(text.text)
    if (dynamic && !dynamics.includes(dynamic)) dynamics.push(dynamic)
  }
  return { dynamics, tempo }
}
