export interface CatalogPiece {
  id: string
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
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
}

export function pieceTitle(piece: CatalogPiece): string {
  return piece.title_zh?.trim() || piece.title
}

export function needsAttribution(piece: CatalogPiece): boolean {
  return /CC\s*BY/i.test(piece.license)
}

export function filterCatalog(pieces: readonly CatalogPiece[], query: CatalogQuery): CatalogPiece[] {
  const needle = query.text.trim().toLowerCase()
  return pieces.filter((piece) => {
    if (query.level !== 'all' && piece.level !== query.level) return false
    if (query.hands !== 'all' && piece.hands !== query.hands) return false
    if (!needle) return true
    const haystack = [piece.title, piece.title_zh ?? '', piece.composer].join('\n').toLowerCase()
    return haystack.includes(needle)
  })
}
