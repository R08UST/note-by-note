import { OTHER_COMPOSERS, SHELF_MIN_PIECES, composerName, composerSortKey } from './composers'

export interface CatalogPiece {
  id: string
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  /** Graded repertoire is the default. Etudes are 练习曲. Method books are 教材. */
  category?: 'etude' | 'method'
  /** Shelf name, for example 拜厄 Op.101. */
  book?: string
  number?: number
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

export const LEVEL_ORDER: CatalogPiece['level'][] = ['L1', 'L2', 'L3', 'L4', 'L5']

/** 一个作曲家分组内的排序方式。 */
export type CatalogSort = 'level' | 'length' | 'alpha'

export interface CatalogQuery {
  level: CatalogPiece['level'] | 'all'
  hands: CatalogPiece['hands'] | 'all'
  text: string
  /** 'all' 是默认：独奏曲、教材、练习曲混在同一个列表里，靠 type 过滤。 */
  category?: 'all' | 'graded' | 'etude' | 'method'
  sort?: CatalogSort
}

export function pieceTitle(piece: CatalogPiece): string {
  const zh = piece.title_zh?.trim()
  if (zh) return zh
  const original = piece.title?.trim()
  if (original) return original
  return titleFromId(piece.id)
}

const ID_PREFIX = /^(noc|os|mutopia|etude|method|mut|demo|saved)-/
const ID_SUFFIX = /^(trad|anon)-/

/** 没有标题的谱子（目前只有两首民歌）从 id 拼一个可读名字，避免卡片空白。 */
export function titleFromId(id: string): string {
  const bare = id.replace(ID_PREFIX, '').replace(ID_SUFFIX, '')
  return bare
    .split('-')
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ')
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
  const category = query.category ?? 'all'
  return pieces.filter((piece) => {
    if (category === 'etude' && piece.category !== 'etude') return false
    if (category === 'method' && piece.category !== 'method') return false
    if (category === 'graded' && (piece.category === 'etude' || piece.category === 'method')) return false
    if (query.level !== 'all' && piece.level !== query.level) return false
    if (query.hands !== 'all' && piece.hands !== query.hands) return false
    if (!needle) return true
    const haystack = [piece.title, piece.title_zh ?? '', piece.composer, composerName(piece.composer), piece.book ?? '']
      .join('\n')
      .toLowerCase()
    return haystack.includes(needle)
  })
}

export interface ComposerShelf {
  /** 显示用的分组名，例如 Johann Sebastian Bach 或 其他作曲家。 */
  name: string
  /** 标准名，用于排序与选中判断。 */
  composer: string
  pieces: CatalogPiece[]
}

const LEVEL_RANK = new Map(LEVEL_ORDER.map((level, index) => [level, index]))

/** 同一本书里的曲子按编号排，否则「No. 10」会跑到「No. 2」前面。 */
function byBookThenNumber(a: CatalogPiece, b: CatalogPiece): number {
  if (a.book && a.book === b.book) return (a.number ?? 0) - (b.number ?? 0)
  return (a.book ?? '').localeCompare(b.book ?? '')
}

function byLevel(a: CatalogPiece, b: CatalogPiece): number {
  return (LEVEL_RANK.get(a.level) ?? 0) - (LEVEL_RANK.get(b.level) ?? 0)
}

function byTitle(a: CatalogPiece, b: CatalogPiece): number {
  return pieceTitle(a).localeCompare(pieceTitle(b), 'zh-Hans-CN')
}

export function sortPieces(pieces: readonly CatalogPiece[], sort: CatalogSort): CatalogPiece[] {
  const ordered = pieces.slice()
  if (sort === 'alpha') {
    ordered.sort((a, b) => byBookThenNumber(a, b) || byTitle(a, b))
  } else if (sort === 'length') {
    ordered.sort((a, b) => a.measures - b.measures || byLevel(a, b) || byTitle(a, b))
  } else {
    ordered.sort((a, b) => byLevel(a, b) || byBookThenNumber(a, b) || byTitle(a, b))
  }
  return ordered
}

/**
 * 按作曲家分组成可折叠的书架。少于 SHELF_MIN_PIECES 首的作曲家并进「其他作曲家」，
 * 否则会有几十个只有一首曲子的分组。
 */
export function groupByComposer(pieces: readonly CatalogPiece[], sort: CatalogSort = 'level'): ComposerShelf[] {
  const buckets = new Map<string, CatalogPiece[]>()
  for (const piece of pieces) {
    const name = composerName(piece.composer)
    const bucket = buckets.get(name)
    if (bucket) bucket.push(piece)
    else buckets.set(name, [piece])
  }

  const shelves: ComposerShelf[] = []
  const minor: CatalogPiece[] = []
  for (const [name, bucket] of buckets) {
    if (bucket.length < SHELF_MIN_PIECES) minor.push(...bucket)
    else shelves.push({ name, composer: name, pieces: sortPieces(bucket, sort) })
  }
  if (minor.length > 0) {
    shelves.push({ name: OTHER_COMPOSERS, composer: OTHER_COMPOSERS, pieces: sortPieces(minor, sort) })
  }

  shelves.sort((a, b) => {
    if (a.name === OTHER_COMPOSERS) return 1
    if (b.name === OTHER_COMPOSERS) return -1
    return composerSortKey(a.name).localeCompare(composerSortKey(b.name)) || a.name.localeCompare(b.name)
  })
  return shelves
}
