import { OTHER_COMPOSERS, SHELF_MIN_PIECES, composerName, composerSortKey, composerZh } from './composers'

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
  /** 'all' 是默认：独奏曲、流行、教材、练习曲混在同一个列表里，靠 type 过滤。 */
  category?: 'all' | 'graded' | 'popular' | 'etude' | 'method'
  sort?: CatalogSort
  /** 书架按作曲家分还是按程度分。 */
  group?: CatalogGroup
}

export type CatalogGroup = 'composer' | 'level'

/**
 * 流行、影视、动漫、游戏曲目：作曲仍受版权保护的那批。
 * ponytail: 从 license 文字推出来，以后要细分流派再给 manifest 加 genre 字段。
 */
export function isPopular(piece: CatalogPiece): boolean {
  return piece.license.includes('作曲仍受版权保护')
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

/**
 * 搜索用的折叠：去掉重音（Frédéric → frederic），标点变空格，字母和数字之间断开，
 * 这样「op149」「Op. 149」「第13首」都拆成同样的词。
 */
export function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)(?=\D)|(\D)(?=\d)/g, '$1$2 ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const HAN = /^\p{Script=Han}+$/u

interface Haystack {
  all: string
  words: string[]
  title: string
  titleWords: string[]
}

const haystacks = new WeakMap<CatalogPiece, Haystack>()

function haystackOf(piece: CatalogPiece): Haystack {
  let hay = haystacks.get(piece)
  if (!hay) {
    const all = foldSearch(
      [piece.title, piece.title_zh ?? '', piece.composer, composerName(piece.composer), composerZh(piece.composer), piece.book ?? '', piece.id].join(' '),
    )
    const title = foldSearch(`${pieceTitle(piece)} ${piece.title ?? ''}`)
    hay = { all, words: all.split(' '), title, titleWords: title.split(' ') }
    haystacks.set(piece, hay)
  }
  return hay
}

function searchTokens(text: string): string[] {
  return foldSearch(text).split(' ').filter(Boolean)
}

/**
 * 数字按词首匹配，「no 5」不会把第 15 首也算进来。中文没有空格，
 * 整串找不到时退回按相邻两字找，所以「巴赫小步舞曲」也能命中。
 */
function tokenHit(text: string, words: readonly string[], token: string): boolean {
  if (/^\d+$/.test(token)) return words.some((word) => word.startsWith(token))
  if (text.includes(token)) return true
  if (!HAN.test(token) || token.length < 3) return false
  for (let index = 0; index + 1 < token.length; index += 1) {
    if (!text.includes(token.slice(index, index + 2))) return false
  }
  return true
}

/** 词首命中：「ode」算不上「Melodie」的命中，但算「Ode to Joy」的。中文没有词，照旧按包含算。 */
function wordStartHit(text: string, words: readonly string[], token: string): boolean {
  if (/\p{Script=Han}/u.test(token)) return tokenHit(text, words, token)
  return words.some((word) => word.startsWith(token))
}

/** 每个词都要出现，但可以落在不同字段里，所以「bach minuet」能找到。 */
export function matchesSearch(piece: CatalogPiece, text: string): boolean {
  const tokens = searchTokens(text)
  if (tokens.length === 0) return true
  const hay = haystackOf(piece)
  return tokens.every((token) => tokenHit(hay.all, hay.words, token))
}

/** 给曲库以外的东西（我的曲谱）用同一套规则匹配。 */
export function matchesText(fields: string, text: string): boolean {
  const all = foldSearch(fields)
  const words = all.split(' ')
  return searchTokens(text).every((token) => tokenHit(all, words, token))
}

/**
 * 整名相同 > 标题开头 > 每个词都在标题词首 > 每个词都在标题里 > 每个词都在某个词首（作曲家、教材）
 * > 只是字母串碰上了。同档保持原顺序。
 */
export function rankSearch(pieces: readonly CatalogPiece[], text: string): CatalogPiece[] {
  const folded = foldSearch(text)
  const tokens = searchTokens(text)
  const rank = (piece: CatalogPiece) => {
    const hay = haystackOf(piece)
    if (foldSearch(pieceTitle(piece)) === folded) return 0
    if (hay.title.startsWith(folded)) return 1
    if (tokens.every((token) => wordStartHit(hay.title, hay.titleWords, token))) return 2
    if (tokens.every((token) => tokenHit(hay.title, hay.titleWords, token))) return 3
    if (tokens.every((token) => wordStartHit(hay.all, hay.words, token))) return 4
    return 5
  }
  return pieces
    .map((piece, index) => ({ piece, index, rank: rank(piece) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.piece)
}

export function filterCatalog(pieces: readonly CatalogPiece[], query: CatalogQuery): CatalogPiece[] {
  const category = query.category ?? 'all'
  return pieces.filter((piece) => {
    if (category === 'etude' && piece.category !== 'etude') return false
    if (category === 'method' && piece.category !== 'method') return false
    if (category === 'popular' && !isPopular(piece)) return false
    if (category === 'graded' && (piece.category != null || isPopular(piece))) return false
    if (query.level !== 'all' && piece.level !== query.level) return false
    if (query.hands !== 'all' && piece.hands !== query.hands) return false
    return matchesSearch(piece, query.text)
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

export const OTHER_POPULAR = '其他流行与影视游戏'

/**
 * 按作曲家分组成可折叠的书架。少于 SHELF_MIN_PIECES 首的作曲家并进「其他作曲家」，
 * 否则会有几十个只有一首曲子的分组。流行、影视、游戏的作曲家排在古典之后，
 * 零散的那些并进「其他流行与影视游戏」，不和古典的小作曲家混在一起。
 */
export function groupByComposer(pieces: readonly CatalogPiece[], sort: CatalogSort = 'level'): ComposerShelf[] {
  const buckets = new Map<string, CatalogPiece[]>()
  for (const piece of pieces) {
    const name = composerName(piece.composer)
    const bucket = buckets.get(name)
    if (bucket) bucket.push(piece)
    else buckets.set(name, [piece])
  }

  // tier：0 古典作曲家，1 流行作曲家，2 其他作曲家，3 其他流行。
  const shelves: { shelf: ComposerShelf; tier: number }[] = []
  const minor: CatalogPiece[] = []
  const minorPopular: CatalogPiece[] = []
  for (const [name, bucket] of buckets) {
    const popular = bucket.every(isPopular)
    if (bucket.length >= SHELF_MIN_PIECES) shelves.push({ shelf: { name, composer: name, pieces: sortPieces(bucket, sort) }, tier: popular ? 1 : 0 })
    else (popular ? minorPopular : minor).push(...bucket)
  }
  for (const [name, bucket, tier] of [
    [OTHER_COMPOSERS, minor, 2],
    [OTHER_POPULAR, minorPopular, 3],
  ] as const) {
    if (bucket.length > 0) shelves.push({ shelf: { name, composer: name, pieces: sortPieces(bucket, sort) }, tier })
  }

  shelves.sort(
    (a, b) =>
      a.tier - b.tier ||
      composerSortKey(a.shelf.name).localeCompare(composerSortKey(b.shelf.name)) ||
      a.shelf.name.localeCompare(b.shelf.name),
  )
  return shelves.map((item) => item.shelf)
}

export const LEVEL_NAMES: Record<CatalogPiece['level'], string> = {
  L1: 'L1 入门',
  L2: 'L2 初级',
  L3: 'L3 中级',
  L4: 'L4 中高级',
  L5: 'L5 高级',
}

/** 按程度分书架，L1 到 L5，给只想找「我现在能弹什么」的时候用。 */
export function groupByLevel(pieces: readonly CatalogPiece[], sort: CatalogSort = 'level'): ComposerShelf[] {
  return LEVEL_ORDER.map((level) => ({
    name: LEVEL_NAMES[level],
    composer: level,
    pieces: sortPieces(
      pieces.filter((piece) => piece.level === level),
      sort,
    ),
  })).filter((shelf) => shelf.pieces.length > 0)
}
