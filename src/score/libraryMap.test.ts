import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function filesUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...filesUnder(full))
    else if (/\.(mxl|musicxml|xml)$/.test(entry.name)) found.push(full)
  }
  return found
}

describe('library engraving', () => {
  it('draws every judged note', () => {
    const scores = filesUnder(path.join(root, 'public/pieces')).filter((file) => !file.endsWith('container.xml'))
    expect(scores.length).toBeGreaterThan(1000)
    // The audit imports TypeScript and OSMD, so it is bundled once and then run by node
    // directly. `npx` cannot be spawned on Windows (it is a .cmd shim), and one process per
    // batch keeps the heap bounded: OSMD keeps a DOM tree per score.
    const bundle = path.join(mkdtempSync(path.join(tmpdir(), 'audit-marks-')), 'audit.mjs')
    execFileSync(
      process.execPath,
      [
        path.join(root, 'node_modules/rolldown/bin/cli.mjs'),
        path.join(root, 'scripts/audit-marks.mjs'),
        '--format',
        'esm',
        '--platform',
        'node',
        '--file',
        bundle,
      ],
      { cwd: root, encoding: 'utf8', timeout: 120_000 },
    )

    const missed: { file: string; matched?: number; total?: number; reasons?: string; error?: string }[] = []
    const step = 120
    for (let offset = 0; offset < scores.length; offset += step) {
      const stdout = execFileSync(process.execPath, ['--expose-gc', bundle], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, AUDIT_ROOT: root, AUDIT_OFFSET: String(offset), AUDIT_LIMIT: String(step) },
        timeout: 300_000,
      })
      const data = JSON.parse(stdout.slice(stdout.indexOf('{'))) as {
        pieces: { file: string; matched: number; total: number; reasons?: string; error?: string }[]
      }
      missed.push(...data.pieces)
    }
    expect(missed, missed.map((piece) => `${piece.file} ${piece.matched}/${piece.total} ${piece.reasons ?? piece.error ?? ''}`).join('\n')).toEqual([])
  }, 900_000)
})
