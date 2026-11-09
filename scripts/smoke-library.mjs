// Headless check of every catalog score with the same parser the app uses.
// Usage: node scripts/smoke-library.mjs
// Writes public/pieces/manifest.json, dropping scores that do not parse or have no notes.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const bundle = path.join(root, 'scripts/.parse-score.mjs')
const esbuild = spawnSync(
  'npx',
  ['--yes', 'esbuild', 'src/score/parseMusicXml.ts', '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`],
  { cwd: root, encoding: 'utf8' },
)
if (esbuild.status !== 0) {
  console.error(esbuild.stdout, esbuild.stderr)
  throw new Error('could not bundle the MusicXML parser')
}
const candidatesPath = process.env.LIBRARY_CANDIDATES ?? '/tmp/library-src/candidates.json'
const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'))
const SHARP = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']
const FLAT = ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭']

function keyName(fifths) {
  const value = Number(fifths)
  if (!Number.isFinite(value)) return ''
  if (value >= 0) return SHARP[value] ?? `${value}♯`
  return FLAT[-value] ?? `${-value}♭`
}

const jobs = candidates.pieces.map((piece) => ({
  id: piece.id,
  path: path.join(root, 'public/pieces', piece.local_file.replace(/^files\//, '')),
}))

const results = []
const batchSize = 12
for (let start = 0; start < jobs.length; start += batchSize) {
  const batch = jobs.slice(start, start + batchSize)
  const list = path.join('/tmp', `library-batch-${start}.json`)
  writeFileSync(list, JSON.stringify(batch))
  const child = spawnSync(process.execPath, [path.join(root, 'scripts/audit-batch.mjs'), list], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (child.status !== 0) {
    console.error(child.stderr)
    throw new Error(`audit batch ${start} exited ${child.status}`)
  }
  results.push(...JSON.parse(child.stdout))
  console.log(`${Math.min(start + batchSize, jobs.length)}/${jobs.length}`)
}

const byId = new Map(results.map((item) => [item.id, item]))
const dropped = []
const pieces = []
for (const piece of candidates.pieces) {
  const result = byId.get(piece.id)
  if (!result || result.error) {
    dropped.push({ id: piece.id, error: result?.error ?? 'missing result' })
    continue
  }
  const fileName = piece.local_file.replace(/^files\//, '')
  pieces.push({
    id: piece.id,
    level: piece.level,
    title: piece.title,
    title_zh: piece.title_zh,
    composer: piece.composer,
    license: piece.license,
    attribution: piece.attribution,
    source_url: piece.source_url,
    file: `pieces/${fileName}`,
    hands: piece.hands === 'one-hand/melody' ? 'one' : 'two',
    measures: piece.measures,
    key: keyName(piece.key_fifths),
    time: piece.time_signature ?? '',
  })
}

const manifest = {
  generated_from: 'library candidates',
  dropped,
  pieces,
}
writeFileSync(path.join(root, 'public/pieces/manifest.json'), JSON.stringify(manifest))
console.log(`kept ${pieces.length}, dropped ${dropped.length}`)
if (dropped.length) console.log(JSON.stringify(dropped, null, 2))
