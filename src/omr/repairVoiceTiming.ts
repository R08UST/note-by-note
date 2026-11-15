/**
 * Re-time each voice of homr's MusicXML from its own note lengths.
 *
 * homr writes a grand staff column by column: a right-hand note, a `<backup>`,
 * the left-hand note under it, another `<backup>`, and so on. When one hand
 * holds a note across the other hand's next onset, it sometimes leaves out the
 * backup that should come back to that onset, so every later note in the bar
 * lands late and the bar runs past its metre. The durations themselves are
 * usually right: summing each voice on its own puts its notes where they were
 * printed. On Luv Letter that is what was wrong with most overfull bars.
 *
 * A bar is rewritten only when it is overfull and every voice, timed on its
 * own, fits inside the metre. Anything else is left exactly as homr wrote it.
 */
export function repairVoiceTiming(xml: string): { xml: string; repaired: number[] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const repaired: number[] = []
  for (const part of doc.getElementsByTagName('part')) {
    let divisions = 0
    let barQuarters = 0
    let index = 0
    for (const measure of [...part.children]) {
      if (measure.localName !== 'measure') continue
      index += 1
      for (const attributes of childrenNamed(measure, 'attributes')) {
        divisions = numberIn(attributes, 'divisions') ?? divisions
        const beats = numberIn(attributes, 'beats')
        const beatType = numberIn(attributes, 'beat-type')
        if (beats != null && beatType) barQuarters = (beats * 4) / beatType
      }
      const bar = barQuarters * divisions
      if (bar > 0 && rewriteMeasure(measure, bar)) {
        repaired.push(Number.parseInt(measure.getAttribute('number') ?? '', 10) || index)
      }
    }
  }
  if (repaired.length === 0) return { xml, repaired }
  return { xml: new XMLSerializer().serializeToString(doc), repaired }
}

/** Returns true when the measure was rewritten. */
function rewriteMeasure(measure: Element, bar: number): boolean {
  const children = [...measure.children]
  // Only what homr emits is understood; a bar with anything else is left alone.
  if (children.some((child) => child.localName === 'forward')) return false
  // Re-timing bars that already fit was measured on Luv Letter and changed nothing.
  if (soundingEnd(children) <= bar + 1e-6) return false

  const head: Element[] = []
  const tail: Element[] = []
  const voices = new Map<string, { length: number; items: Element[] }>()
  let pending: Element[] = []
  let current: { length: number; items: Element[] } | null = null
  for (const child of children) {
    const name = child.localName
    if (name === 'backup') continue
    if (name === 'note') {
      if (hasChild(child, 'chord') && current) {
        current.items.push(...pending, child)
        pending = []
        continue
      }
      const voice = textIn(child, 'voice') ?? '1'
      let line = voices.get(voice)
      if (!line) {
        line = { length: 0, items: [] }
        voices.set(voice, line)
      }
      line.items.push(...pending, child)
      pending = []
      if (!hasChild(child, 'grace')) line.length += numberIn(child, 'duration') ?? 0
      current = line
    } else if (name === 'barline' && child.getAttribute('location') !== 'left') {
      tail.push(child)
    } else if (voices.size === 0 && (name === 'attributes' || name === 'print' || name === 'barline')) {
      head.push(child)
    } else {
      // Directions and the like stay just before the note that followed them.
      pending.push(child)
    }
  }
  if (voices.size === 0) return false
  // A voice that is too long on its own has a wrong duration, not a lost backup.
  if ([...voices.values()].some((line) => line.length > bar + 1e-6)) return false

  const document = measure.ownerDocument
  for (const child of children) measure.removeChild(child)
  for (const child of head) measure.appendChild(child)
  let previous: number | null = null
  for (const line of voices.values()) {
    if (previous != null) {
      const backup = document.createElement('backup')
      const duration = document.createElement('duration')
      duration.textContent = String(previous)
      backup.appendChild(duration)
      measure.appendChild(backup)
    }
    for (const item of line.items) measure.appendChild(item)
    previous = line.length
  }
  for (const child of pending) measure.appendChild(child)
  for (const child of tail) measure.appendChild(child)
  return true
}

/** Where the last sounding note ends, following homr's own backups. */
function soundingEnd(children: Element[]): number {
  let cursor = 0
  let end = 0
  for (const child of children) {
    if (child.localName === 'note') {
      if (hasChild(child, 'grace') || hasChild(child, 'chord')) continue
      cursor += numberIn(child, 'duration') ?? 0
      if (!hasChild(child, 'rest')) end = Math.max(end, cursor)
    } else if (child.localName === 'backup') {
      cursor -= numberIn(child, 'duration') ?? 0
    }
  }
  return end
}

function childrenNamed(element: Element, name: string): Element[] {
  return [...element.children].filter((child) => child.localName === name)
}

function hasChild(element: Element, name: string): boolean {
  return childrenNamed(element, name).length > 0
}

function textIn(element: Element, name: string): string | null {
  return element.getElementsByTagName(name)[0]?.textContent?.trim() || null
}

function numberIn(element: Element, name: string): number | null {
  const value = textIn(element, name)
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
