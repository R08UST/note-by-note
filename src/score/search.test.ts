import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filterCatalog, foldSearch, matchesText, rankSearch, type CatalogFile } from './catalog'

const { pieces } = JSON.parse(readFileSync('public/pieces/manifest.json', 'utf8')) as CatalogFile
const find = (text: string) => filterCatalog(pieces, { level: 'all', hands: 'all', text })

describe('library search', () => {
  it('folds accents, punctuation, and letter-digit runs', () => {
    expect(foldSearch('Frédéric Op.149 第13首')).toBe('frederic op 149 第 13 首')
    expect(foldSearch('op149')).toBe('op 149')
  })

  it('finds a composer by Chinese name even when the titles are not translated', () => {
    const bach = find('巴赫')
    expect(bach.length).toBeGreaterThan(150)
    expect(find('肖邦').length).toBeGreaterThan(50)
  })

  it('matches words across fields, accent-free and without spaces', () => {
    expect(find('bach minuet').length).toBeGreaterThan(0)
    expect(find('frederic').length).toBe(find('Frédéric').length)
    expect(find('op149').length).toBe(find('Op. 149').length)
    expect(find('迪亚贝利 13').every((piece) => /13/.test(piece.title_zh ?? piece.title))).toBe(true)
  })

  it('puts title matches ahead of composer-only matches', () => {
    const ranked = rankSearch(find('minuet'), 'minuet')
    expect(ranked[0]!.title.toLowerCase()).toContain('minuet')
  })

  it('ranks word-start title hits ahead of letters buried inside a word', () => {
    const ranked = rankSearch(find('ode'), 'ode')
    const first = ranked.findIndex((piece) => !/ode/i.test(piece.title))
    const lastWordStart = ranked.map((piece) => /ode/i.test(piece.title)).lastIndexOf(true)
    expect(first).toBeGreaterThan(lastWordStart)
  })

  it('matches saved scores by title or tag with the same rules', () => {
    expect(matchesText('My Minuet 考级', 'minuet')).toBe(true)
    expect(matchesText('My Minuet 考级', '考级')).toBe(true)
    expect(matchesText('My Minuet 考级', 'waltz')).toBe(false)
  })
})
