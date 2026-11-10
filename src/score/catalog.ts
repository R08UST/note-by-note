export interface CatalogPiece {
  id: string
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  /** Graded repertoire is the default. Etudes are the 练习曲 shelf. */
  category?: 'etude'
  title: string
  title_zh: string | null
  composer: string
  license: string
  attribution: string
  source_url: string
  file: string
  hands: 'one' | 'two'
  measures: number
  key: string
  time: string
}

export interface CatalogFile {
  pieces: CatalogPiece[]
  dropped?: { id: string; error: string }[]
}

export interface CatalogQuery {
  level: CatalogPiece['level'] | 'all'
  hands: CatalogPiece['hands'] | 'all'
  text: string
  category?: 'all' | 'graded' | 'etude'
}

export function pieceTitle(piece: CatalogPiece): string {
  return piece.title_zh?.trim() || piece.title
}

export function nowPlayingLine(piece: {
  title: string
  titleZh: string | null
  composer: string
  level: string
}): string {
  const name = piece.titleZh?.trim() || piece.title
  return [name, piece.composer, piece.level].filter((part) => part.trim()).join(' · ')
}

const QUICK_PICK_IDS = ['os-twinkle-twinkle-little-star', 'demo-light-steps', 'demo-sunday-chords']

/** Three easy pieces for the empty practice stand. Falls back to the first L1 scores. */
export function quickPicks(pieces: readonly CatalogPiece[]): CatalogPiece[] {
  const picked: CatalogPiece[] = []
  for (const id of QUICK_PICK_IDS) {
    const piece = pieces.find((item) => item.id === id)
    if (piece) picked.push(piece)
  }
  for (const piece of pieces) {
    if (picked.length >= 3) break
    if (piece.level !== 'L1' || picked.some((item) => item.id === piece.id)) continue
    picked.push(piece)
  }
  return picked.slice(0, 3)
}

export function needsAttribution(piece: CatalogPiece): boolean {
  return /CC\s*BY/i.test(piece.license)
}

export function filterCatalog(pieces: readonly CatalogPiece[], query: CatalogQuery): CatalogPiece[] {
  const needle = query.text.trim().toLowerCase()
  return pieces.filter((piece) => {
    if (query.category === 'etude' && piece.category !== 'etude') return false
    if (query.category === 'graded' && piece.category === 'etude') return false
    if (query.category !== 'etude' && query.level !== 'all' && piece.level !== query.level) return false
    if (query.hands !== 'all' && piece.hands !== query.hands) return false
    if (!needle) return true
    const haystack = [piece.title, piece.title_zh ?? '', piece.composer].join('\n').toLowerCase()
    return haystack.includes(needle)
  })
}
