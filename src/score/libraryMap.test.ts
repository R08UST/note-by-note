import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('library engraving', () => {
  it('draws every judged note', () => {
    const total = Number(
      execFileSync('bash', ['-lc', "find public/pieces -type f \\( -name '*.mxl' -o -name '*.musicxml' -o -name '*.xml' \\) | wc -l"], {
        encoding: 'utf8',
      }).trim(),
    )
    const missed: { file: string; matched?: number; total?: number; reasons?: string; error?: string }[] = []
    const step = 15
    for (let offset = 0; offset < total; offset += step) {
      const stdout = execFileSync('npx', ['vite-node', 'scripts/audit-marks.mjs'], {
        encoding: 'utf8',
        env: { ...process.env, AUDIT_OFFSET: String(offset), AUDIT_LIMIT: String(step) },
        timeout: 120_000,
      })
      const data = JSON.parse(stdout.slice(stdout.indexOf('{'))) as {
        pieces: { file: string; matched: number; total: number; reasons?: string; error?: string }[]
      }
      missed.push(...data.pieces)
    }
    expect(missed, missed.map((piece) => `${piece.file} ${piece.matched}/${piece.total} ${piece.reasons ?? piece.error ?? ''}`).join('\n')).toEqual([])
  }, 180_000)
})
