import { describe, expect, it } from 'vitest'
import { filterCatalog, needsAttribution, pieceTitle, type CatalogPiece } from './catalog'

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

  it('shows the Chinese title when there is one, and flags CC BY', () => {
    expect(pieceTitle(sample[0]!)).toBe('茉莉花')
    expect(pieceTitle(sample[1]!)).toBe('Minuet in G')
    expect(needsAttribution(sample[0]!)).toBe(false)
    expect(needsAttribution(sample[1]!)).toBe(true)
  })
})
