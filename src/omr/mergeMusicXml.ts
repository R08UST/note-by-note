export interface PageScore {
  label: string
  xml: string
}

interface Carry {
  divisions: string | null
  fifths: string | null
  beats: string | null
  beatType: string | null
  clefs: string
  staves: string | null
}

const EMPTY: Carry = {
  divisions: null,
  fifths: null,
  beats: null,
  beatType: null,
  clefs: '',
  staves: null,
}

function elements(parent: Element): Element[] {
  return [...parent.children]
}

function named(parent: Element, name: string): Element | null {
  return elements(parent).find((child) => child.localName === name) ?? null
}

function plain(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, '') ?? ''
  return text ? text : null
}

function textOf(parent: Element, name: string): string | null {
  return plain(named(parent, name)?.textContent)
}

function clefKey(clef: Element): string {
  const number = clef.getAttribute('number') ?? '1'
  return `${number}:${textOf(clef, 'sign') ?? ''}:${textOf(clef, 'line') ?? ''}`
}

function same(left: string | null, right: string | null): boolean {
  return left != null && left === right
}

/** Drop attribute children that only repeat the running signature. */
function pruneAttributes(attributes: Element, carry: Carry): Carry {
  const next = { ...carry }
  for (const child of elements(attributes)) {
    if (child.localName === 'divisions') {
      const value = plain(child.textContent)
      if (same(value, carry.divisions)) child.remove()
      else if (value) next.divisions = value
    } else if (child.localName === 'key') {
      const fifths = textOf(child, 'fifths')
      if (same(fifths, carry.fifths)) child.remove()
      else if (fifths) next.fifths = fifths
    } else if (child.localName === 'time') {
      const beats = textOf(child, 'beats')
      const beatType = textOf(child, 'beat-type')
      if (same(beats, carry.beats) && same(beatType, carry.beatType)) child.remove()
      else {
        if (beats) next.beats = beats
        if (beatType) next.beatType = beatType
      }
    } else if (child.localName === 'staves') {
      const value = plain(child.textContent)
      if (same(value, carry.staves)) child.remove()
      else if (value) next.staves = value
    }
  }
  const clefs = elements(attributes).filter((child) => child.localName === 'clef')
  if (clefs.length > 0) {
    const signature = clefs.map(clefKey).join(',')
    if (signature === carry.clefs) {
      for (const clef of clefs) clef.remove()
    } else {
      next.clefs = signature
    }
  }
  if (elements(attributes).length === 0) attributes.remove()
  return next
}

function remember(attributes: Element, carry: Carry): Carry {
  const next = { ...carry }
  const divisions = textOf(attributes, 'divisions')
  if (divisions) next.divisions = divisions
  const key = named(attributes, 'key')
  const fifths = key ? textOf(key, 'fifths') : null
  if (fifths) next.fifths = fifths
  const time = named(attributes, 'time')
  if (time) {
    const beats = textOf(time, 'beats')
    const beatType = textOf(time, 'beat-type')
    if (beats) next.beats = beats
    if (beatType) next.beatType = beatType
  }
  const clefs = elements(attributes).filter((child) => child.localName === 'clef')
  if (clefs.length > 0) next.clefs = clefs.map(clefKey).join(',')
  const staves = textOf(attributes, 'staves')
  if (staves) next.staves = staves
  return next
}

function partsOf(root: Element): Element[] {
  return elements(root).filter((child) => child.localName === 'part')
}

function measuresOf(part: Element): Element[] {
  return elements(part).filter((child) => child.localName === 'measure')
}

/**
 * Join one partwise MusicXML score per page.
 * Measures stay in page order and are renumbered from 1 inside each part.
 * A later page keeps key, time, or clef markup only when it differs from the
 * signature already in force.
 */
export function mergeMusicXml(pages: readonly PageScore[]): string {
  const docs = pages.map((page) => new DOMParser().parseFromString(page.xml, 'application/xml'))
  const usable = docs.filter((doc) => doc.documentElement.localName === 'score-partwise')
  const base = usable[0]
  if (!base) throw new Error('None of the pages is a partwise MusicXML score.')
  const root = base.documentElement
  const baseParts = partsOf(root)
  if (baseParts.length === 0) throw new Error('The first page has no parts.')

  for (const part of baseParts) {
    const own = measuresOf(part)
    for (const measure of own) measure.remove()
    let carry: Carry = { ...EMPTY }
    let number = 0
    const append = (measure: Element, doc: Document) => {
      number += 1
      const copy = doc === base ? measure : base.importNode(measure, true)
      copy.setAttribute('number', String(number))
      if (number > 1) copy.removeAttribute('implicit')
      const attributes = named(copy, 'attributes')
      if (attributes) {
        carry = number === 1 ? remember(attributes, carry) : pruneAttributes(attributes, carry)
      }
      part.append(copy)
    }
    for (const measure of own) append(measure, base)
    const partIndex = baseParts.indexOf(part)
    const partId = part.getAttribute('id')
    for (const doc of usable.slice(1)) {
      const others = partsOf(doc.documentElement)
      const match = others.find((item) => partId != null && item.getAttribute('id') === partId) ?? others[partIndex]
      if (!match) continue
      for (const measure of measuresOf(match)) append(measure, doc)
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${root.outerHTML}`
}

/** 1-based page numbers from a range such as "1-3, 5". Empty means every page. */
export function pageRange(spec: string, count: number): number[] {
  const trimmed = spec.trim()
  if (!trimmed) return Array.from({ length: count }, (_, index) => index + 1)
  const chosen = new Set<number>()
  for (const chunk of trimmed.split(/[,，]/)) {
    const piece = chunk.trim()
    if (!piece) continue
    const range = piece.split(/[-–]/).map((part) => Number(part.trim()))
    const start = range[0]
    const end = range.length > 1 ? range[1] : range[0]
    if (start == null || end == null || !Number.isInteger(start) || !Number.isInteger(end)) continue
    const low = Math.min(start, end)
    const high = Math.max(start, end)
    for (let page = low; page <= high; page += 1) {
      if (page >= 1 && page <= count) chosen.add(page)
    }
  }
  return [...chosen].sort((a, b) => a - b)
}
