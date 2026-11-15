/**
 * Measures whose notes run past the printed time signature.
 *
 * homr's most common slip is one misread duration (a sixteenth read as an
 * eighth), which pushes every later note in the bar late. The pitches stay
 * right, but the bar ends up longer than the metre allows. On Luv Letter, 26 of
 * homr's 45 wrong bars were overfull and no correct bar was, so this check
 * points the reader at the bars to fix without false alarms.
 *
 * Underfull bars are not flagged: pickups and final bars are short on purpose.
 */
export function overfullMeasures(xml: string): number[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const found = new Set<number>()
  for (const part of doc.getElementsByTagName('part')) {
    let divisions = 0
    let barQuarters = 0
    let index = 0
    for (const measure of part.children) {
      if (measure.localName !== 'measure') continue
      index += 1
      let cursor = 0
      let end = 0
      for (const child of measure.children) {
        const name = child.localName
        if (name === 'attributes') {
          divisions = numberIn(child, 'divisions') ?? divisions
          const beats = numberIn(child, 'beats')
          const beatType = numberIn(child, 'beat-type')
          // Divisions can change without the metre being repeated (homr does this per page).
          if (beats != null && beatType) barQuarters = (beats * 4) / beatType
        } else if (name === 'note') {
          if (hasChild(child, 'grace') || hasChild(child, 'chord')) continue
          cursor += numberIn(child, 'duration') ?? 0
          // A rest that runs long moves no note, so only sounding notes count toward the end.
          if (!hasChild(child, 'rest')) end = Math.max(end, cursor)
        } else if (name === 'backup') {
          cursor -= numberIn(child, 'duration') ?? 0
        } else if (name === 'forward') {
          cursor += numberIn(child, 'duration') ?? 0
        }
      }
      const barDivisions = barQuarters * divisions
      if (barDivisions > 0 && end > barDivisions + 1e-6) {
        found.add(Number.parseInt(measure.getAttribute('number') ?? '', 10) || index)
      }
    }
  }
  return [...found].sort((a, b) => a - b)
}

function hasChild(element: Element, name: string): boolean {
  for (const child of element.children) if (child.localName === name) return true
  return false
}

function numberIn(element: Element, name: string): number | null {
  const value = element.getElementsByTagName(name)[0]?.textContent?.trim()
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
