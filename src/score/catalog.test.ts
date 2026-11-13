import { describe, expect, it } from 'vitest'
import {
  filterCatalog,
  groupByComposer,
  needsAttribution,
  nowPlayingLine,
  pieceTitle,
  quickPicks,
  sortPieces,
  type CatalogPiece,
} from './catalog'

const sample: CatalogPiece[] = [
  {
    id: 'a',
    level: 'L1',
    title: 'Jasmine',
    title_zh: '茉莉花',
    composer: 'Traditional',
    license: 'CC0-1.0',
    attribution: 'opensongs-json (CC0)',
    source_url: 'https://example.test/a',
    file: 'pieces/a.musicxml',
    hands: 'one',
    measures: 8,
    key: 'C',
    time: '4/4',
  },
  {
    id: 'b',
    level: 'L3',
    title: 'Minuet in G',
    title_zh: null,
    composer: 'Johann Sebastian Bach',
    license: 'CC BY 4.0',
    attribution: 'Noctave / Mutopia Project',
    source_url: 'https://example.test/b',
    file: 'pieces/b.mxl',
    hands: 'two',
    measures: 32,
    key: 'G',
    time: '3/4',
  },
]

describe('filterCatalog', () => {
  it('filters by level, hands, and Chinese or English title or composer', () => {
    expect(filterCatalog(sample, { level: 'L1', hands: 'all', text: '' }).map((piece) => piece.id)).toEqual(['a'])
    expect(filterCatalog(sample, { level: 'all', hands: 'two', text: 'bach' }).map((piece) => piece.id)).toEqual(['b'])
    expect(filterCatalog(sample, { level: 'all', hands: 'all', text: '茉莉' }).map((piece) => piece.id)).toEqual(['a'])
  })

  it('keeps method books on the 教材 shelf and out of the graded list', () => {
    const method: CatalogPiece = { ...sample[0]!, id: 'method-burgmuller-op100-02', category: 'method', book: '布格缪勒 Op.100', number: 2 }
    const shelf = [...sample, method]
    expect(filterCatalog(shelf, { level: 'all', hands: 'all', text: '', category: 'graded' }).map((piece) => piece.id)).toEqual(['a', 'b'])
    expect(filterCatalog(shelf, { level: 'all', hands: 'all', text: '', category: 'method' }).map((piece) => piece.id)).toEqual([method.id])
    expect(filterCatalog(shelf, { level: 'L1', hands: 'all', text: '', category: 'method' }).map((piece) => piece.id)).toEqual([method.id])
  })

  it('shows the Chinese title when there is one, and flags CC BY', () => {
    expect(pieceTitle(sample[0]!)).toBe('茉莉花')
    expect(pieceTitle(sample[1]!)).toBe('Minuet in G')
    expect(needsAttribution(sample[0]!)).toBe(false)
    expect(needsAttribution(sample[1]!)).toBe(true)
  })

  it('formats the current piece and picks three easy scores', () => {
    expect(nowPlayingLine({ title: 'Jasmine', titleZh: '茉莉花', composer: 'Traditional', level: 'L1' })).toBe(
      '茉莉花 · Traditional · L1',
    )
    expect(quickPicks(sample).map((piece) => piece.id)).toEqual(['a'])
  })
})

describe('composer shelves', () => {
  const make = (id: string, composer: string, level: CatalogPiece['level'], measures: number): CatalogPiece => ({
    ...sample[0]!,
    id,
    composer,
    level,
    measures,
    title: id,
    title_zh: null,
  })

  it('folds abbreviated and full composer names into one shelf', () => {
    const shelf = [
      make('a', 'Johann Sebastian Bach', 'L3', 32),
      make('b', 'J. S. Bach', 'L2', 16),
      make('c', 'J.S. Bach', 'L4', 64),
    ]
    const groups = groupByComposer(shelf)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.name).toBe('Johann Sebastian Bach')
    expect(groups[0]!.pieces.map((piece) => piece.id)).toEqual(['b', 'a', 'c'])
  })

  it('sorts shelves by surname, not by first name', () => {
    const groups = groupByComposer([
      make('a', 'Johann Sebastian Bach', 'L3', 10),
      make('b', 'Ludwig van Beethoven', 'L3', 10),
      make('c', 'Frédéric Chopin', 'L3', 10),
      make('d', 'Johann Sebastian Bach', 'L3', 10),
      make('e', 'Ludwig van Beethoven', 'L3', 10),
      make('f', 'Frédéric Chopin', 'L3', 10),
      make('g', 'Johann Sebastian Bach', 'L3', 10),
      make('h', 'Ludwig van Beethoven', 'L3', 10),
      make('i', 'Frédéric Chopin', 'L3', 10),
    ])
    expect(groups.map((group) => group.name)).toEqual([
      'Johann Sebastian Bach',
      'Ludwig van Beethoven',
      'Frédéric Chopin',
    ])
  })

  it('collects one-off composers into 其他作曲家 and keeps it last', () => {
    const groups = groupByComposer([
      make('a', 'Johann Sebastian Bach', 'L3', 10),
      make('b', 'Johann Sebastian Bach', 'L3', 10),
      make('c', 'Johann Sebastian Bach', 'L3', 10),
      make('z', 'Dora Pejačević', 'L3', 10),
      make('y', 'Anonymous', 'L1', 8),
      make('x', 'Traditional', 'L1', 8),
    ])
    expect(groups.map((group) => group.name)).toEqual(['Johann Sebastian Bach', '其他作曲家'])
    // Anonymous 和 Traditional 归并成同一个人，两首还不够三首，一起进「其他」。
    expect(groups[1]!.pieces.map((piece) => piece.id).sort()).toEqual(['x', 'y', 'z'])
  })

  it('orders by length or alphabetically when asked', () => {
    const shelf = [
      make('long', 'Johann Sebastian Bach', 'L3', 90),
      make('short', 'Johann Sebastian Bach', 'L5', 8),
      make('mid', 'Johann Sebastian Bach', 'L4', 40),
    ]
    expect(sortPieces(shelf, 'length').map((piece) => piece.id)).toEqual(['short', 'mid', 'long'])
    expect(sortPieces(shelf, 'alpha').map((piece) => piece.id)).toEqual(['long', 'mid', 'short'])
    expect(sortPieces(shelf, 'level').map((piece) => piece.id)).toEqual(['long', 'mid', 'short'])
  })
})

describe('pieceTitle fallbacks', () => {
  it('falls back to a readable name built from the id when the title is blank', () => {
    const blank: CatalogPiece = { ...sample[0]!, id: 'noc-trad-frere-jacques', title: '', title_zh: null }
    expect(pieceTitle(blank)).toBe('Frere Jacques')
  })

  it('prefers the Chinese title, then the original, then the id', () => {
    expect(pieceTitle(sample[0]!)).toBe('茉莉花')
    expect(pieceTitle(sample[1]!)).toBe('Minuet in G')
    expect(pieceTitle({ ...sample[1]!, id: 'noc-trad-frere-jacques', title: '  ', title_zh: '   ' })).toBe('Frere Jacques')
  })
})
