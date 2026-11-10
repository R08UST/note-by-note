import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RECENT_WINDOW, editSimilarity, nextItem, noteKeys, tooSimilar, type BankItem } from './bank'

describe('question bank', () => {
  it('treats a near copy as the same item and a different bar as another', () => {
    const left = { rhythm: '12.12.12.12|12.12.24', pitches: '0,2,4,2,0' }
    const copy = { rhythm: '12.12.12.12|12.12.24', pitches: '0,2,4,2,0' }
    const otherRhythm = { rhythm: '24.24|12.12.12.12', pitches: '0,2,4,2,0' }
    expect(tooSimilar(left, copy)).toBe(true)
    expect(editSimilarity(left.rhythm, otherRhythm.rhythm)).toBeLessThan(0.84)
    expect(tooSimilar(left, otherRhythm)).toBe(false)
    expect(tooSimilar(left, { rhythm: left.rhythm, pitches: '0,2,-2,-2,0' })).toBe(false)
  })

  it('serves an unseen item and refuses the recent ones', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ id: `S1-R-${index + 1}` }))
    const seen = new Set(['S1-R-1', 'S1-R-2'])
    const recent = items.slice(2, 2 + RECENT_WINDOW).map((item) => item.id)
    const next = nextItem(items, seen, recent)
    expect(next?.id).toBe('S1-R-11')
    expect(recent.includes(next?.id ?? '')).toBe(false)
    expect(seen.has(next?.id ?? '')).toBe(false)
  })

  it('keeps every stored bank inside the similarity threshold and at least 60 items', () => {
    const directory = `${process.cwd()}/src/train/banks`
    const files = readdirSync(directory).filter((name) => name.endsWith('.json'))
    expect(files.length).toBeGreaterThanOrEqual(40)
    for (const file of files) {
      const bank = JSON.parse(readFileSync(`${directory}/${file}`, 'utf8')) as { items: BankItem[] }
      expect(bank.items.length).toBeGreaterThanOrEqual(60)
      expect(bank.items.length).toBeLessThanOrEqual(100)
      const keys = bank.items.map((item) => noteKeys(item.notes))
      const rhythmOnly = file.startsWith('r')
      const ids = new Set<string>()
      for (const item of bank.items) {
        expect(ids.has(item.id)).toBe(false)
        ids.add(item.id)
      }
      for (let left = 0; left < keys.length; left += 1) {
        const a = keys[left]
        if (!a) continue
        for (let right = left + 1; right < keys.length; right += 1) {
          const b = keys[right]
          if (!b) continue
          expect(tooSimilar(a, b, rhythmOnly)).toBe(false)
        }
      }
      if (!rhythmOnly && !file.includes('-b.')) expect(bank.items.some((item) => item.origin)).toBe(true)
    }
  })
})
