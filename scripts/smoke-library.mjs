// Headless check of every catalog score with the same parser the app uses.
// Usage: node scripts/smoke-library.mjs
// Writes public/pieces/manifest.json, dropping scores that do not parse or have no notes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const bundle = path.join(root, 'scripts/.parse-score.mjs')
// rolldown ships with Vite, so it is already installed; esbuild may not be.
const esbuild = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/rolldown/bin/cli.mjs'),
    'src/score/parseMusicXml.ts',
    '--format',
    'esm',
    '--platform',
    'node',
    '--file',
    bundle,
  ],
  { cwd: root, encoding: 'utf8' },
)
if (esbuild.status !== 0) {
  console.error(esbuild.stdout, esbuild.stderr)
  throw new Error('could not bundle the MusicXML parser')
}
const candidatesPath = process.env.LIBRARY_CANDIDATES ?? '/tmp/library-src/candidates.json'
// The graded candidates come from outside the repo. Without them, keep whatever the
// manifest already holds for the graded and os- shelves and only re-check the rest.
const hasCandidates = existsSync(candidatesPath)
const candidates = hasCandidates ? JSON.parse(readFileSync(candidatesPath, 'utf8')) : { pieces: [] }
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
  const list = path.join(tmpdir(), `library-batch-${start}.json`)
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

const manifestPath = path.join(root, 'public/pieces/manifest.json')
if (hasCandidates) {
  const manifest = {
    generated_from: 'library candidates',
    dropped,
    pieces,
  }
  writeFileSync(manifestPath, JSON.stringify(manifest))
  console.log(`kept ${pieces.length}, dropped ${dropped.length}`)
  if (dropped.length) console.log(JSON.stringify(dropped, null, 2))
} else {
  // No candidate list outside the repo: keep the graded shelf that is already in the
  // manifest so this run only re-checks and re-merges the shelves below.
  const current = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const kept = current.pieces.filter((piece) => !/^(etude|mutopia|method|noc)-/.test(String(piece.id)))
  writeFileSync(manifestPath, JSON.stringify({ ...current, pieces: kept }))
  console.log(`LIBRARY_CANDIDATES not found; kept ${kept.length} graded pieces from the manifest`)
}

const etudesPath = path.join(root, 'public/pieces/etudes.json')
if (readFileSync) {
  const etudes = JSON.parse(readFileSync(etudesPath, 'utf8'))
  const etudeJobs = etudes.map((piece) => ({ id: piece.id, path: path.join(root, 'public', piece.file) }))
  const list = path.join(tmpdir(), 'library-etudes.json')
  writeFileSync(list, JSON.stringify(etudeJobs))
  const child = spawnSync(process.execPath, [path.join(root, 'scripts/audit-batch.mjs'), list], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (child.status !== 0) {
    console.error(child.stderr)
    throw new Error('etude audit failed')
  }
  const checked = new Map(JSON.parse(child.stdout).map((item) => [item.id, item]))
  const failed = etudes.filter((piece) => checked.get(piece.id)?.error)
  if (failed.length) {
    console.log(JSON.stringify(failed.map((piece) => ({ id: piece.id, error: checked.get(piece.id)?.error }))))
    throw new Error('an etude did not parse')
  }
  const merged = JSON.parse(readFileSync(path.join(root, 'public/pieces/manifest.json'), 'utf8'))
  merged.pieces = merged.pieces.filter((piece) => !String(piece.id).startsWith('etude-')).concat(etudes)
  writeFileSync(path.join(root, 'public/pieces/manifest.json'), JSON.stringify(merged))
  console.log(`etudes kept ${etudes.length}`)
}

const mutopiaPath = path.join(root, 'public/pieces/mutopia.json')
if (readFileSync(mutopiaPath, 'utf8').trim()) {
  const mutopia = JSON.parse(readFileSync(mutopiaPath, 'utf8'))
  const mutopiaJobs = mutopia.map((piece) => ({ id: piece.id, path: path.join(root, 'public', piece.file) }))
  const mutopiaResults = []
  for (let start = 0; start < mutopiaJobs.length; start += 12) {
    const mutopiaList = path.join(tmpdir(), `library-mutopia-${start}.json`)
    writeFileSync(mutopiaList, JSON.stringify(mutopiaJobs.slice(start, start + 12)))
    const mutopiaChild = spawnSync(process.execPath, [path.join(root, 'scripts/audit-batch.mjs'), mutopiaList], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    if (mutopiaChild.status !== 0) {
      console.error(mutopiaChild.stderr)
      throw new Error('mutopia audit failed')
    }
    mutopiaResults.push(...JSON.parse(mutopiaChild.stdout))
    if ((start + 12) % 60 === 0) console.log(`mutopia ${Math.min(start + 12, mutopiaJobs.length)}/${mutopiaJobs.length}`)
  }
  const mutopiaChecked = new Map(mutopiaResults.map((item) => [item.id, item]))
  const mutopiaFailed = mutopia.filter((piece) => mutopiaChecked.get(piece.id)?.error || mutopiaChecked.get(piece.id)?.notes < 1)
  if (mutopiaFailed.length) {
    console.log(JSON.stringify(mutopiaFailed.map((piece) => ({ id: piece.id, error: mutopiaChecked.get(piece.id)?.error }))))
    throw new Error('a mutopia piece did not parse')
  }
  const withMutopia = JSON.parse(readFileSync(path.join(root, 'public/pieces/manifest.json'), 'utf8'))
  withMutopia.pieces = withMutopia.pieces.filter((piece) => !String(piece.id).startsWith('mutopia-')).concat(mutopia)
  writeFileSync(path.join(root, 'public/pieces/manifest.json'), JSON.stringify(withMutopia))
  console.log(`mutopia kept ${mutopia.length}`)
}

const methodsPath = path.join(root, 'public/pieces/method.json')
const methods = JSON.parse(readFileSync(methodsPath, 'utf8'))
const methodJobs = methods.map((piece) => ({ id: piece.id, path: path.join(root, 'public', piece.file) }))
const methodList = path.join(tmpdir(), 'library-methods.json')
writeFileSync(methodList, JSON.stringify(methodJobs))
const methodChild = spawnSync(process.execPath, [path.join(root, 'scripts/audit-batch.mjs'), methodList], {
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
})
if (methodChild.status !== 0) {
  console.error(methodChild.stderr)
  throw new Error('method audit failed')
}
const methodChecked = new Map(JSON.parse(methodChild.stdout).map((item) => [item.id, item]))
const methodFailed = methods.filter((piece) => methodChecked.get(piece.id)?.error || methodChecked.get(piece.id)?.notes < 1)
if (methodFailed.length) {
  console.log(JSON.stringify(methodFailed.map((piece) => ({ id: piece.id, error: methodChecked.get(piece.id)?.error }))))
  throw new Error('a method piece did not parse')
}
const withMethods = JSON.parse(readFileSync(path.join(root, 'public/pieces/manifest.json'), 'utf8'))
withMethods.pieces = withMethods.pieces.filter((piece) => !String(piece.id).startsWith('method-')).concat(methods)
writeFileSync(path.join(root, 'public/pieces/manifest.json'), JSON.stringify(withMethods))
console.log(`methods kept ${methods.length}`)

const noctavePath = path.join(root, 'public/pieces/noctave.json')
const noctave = JSON.parse(readFileSync(noctavePath, 'utf8'))
const noctaveJobs = noctave.map((piece) => ({ id: piece.id, path: path.join(root, 'public', piece.file) }))
const noctaveResults = []
for (let start = 0; start < noctaveJobs.length; start += 12) {
  const noctaveList = path.join(tmpdir(), `library-noctave-${start}.json`)
  writeFileSync(noctaveList, JSON.stringify(noctaveJobs.slice(start, start + 12)))
  const noctaveChild = spawnSync(process.execPath, [path.join(root, 'scripts/audit-batch.mjs'), noctaveList], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (noctaveChild.status !== 0) {
    console.error(noctaveChild.stderr)
    throw new Error('noctave audit failed')
  }
  noctaveResults.push(...JSON.parse(noctaveChild.stdout))
  if ((start + 12) % 240 === 0) console.log(`noctave ${Math.min(start + 12, noctaveJobs.length)}/${noctaveJobs.length}`)
}
const noctaveChecked = new Map(noctaveResults.map((item) => [item.id, item]))
const noctaveFailed = noctave.filter((piece) => noctaveChecked.get(piece.id)?.error || noctaveChecked.get(piece.id)?.notes < 1)
if (noctaveFailed.length) {
  console.log(JSON.stringify(noctaveFailed.map((piece) => ({ id: piece.id, error: noctaveChecked.get(piece.id)?.error }))))
  throw new Error('a noctave piece did not parse')
}
const withNoctave = JSON.parse(readFileSync(path.join(root, 'public/pieces/manifest.json'), 'utf8'))
withNoctave.pieces = withNoctave.pieces.filter((piece) => !String(piece.id).startsWith('noc-')).concat(noctave)
writeFileSync(path.join(root, 'public/pieces/manifest.json'), JSON.stringify(withNoctave))
console.log(`noctave kept ${noctave.length}`)
