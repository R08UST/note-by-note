#!/usr/bin/env node
// Downloads homr-web's ONNX weights into public/models/homr/<sha256>/<file>.
// homr publishes most of them as zip assets. The tab-digit classifier is on the
// homr-web models release. OCR weights are intentionally not fetched.
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = path.resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(path.join(root, 'src/omr/homr-models.json'), 'utf8'))
const destRoot = path.join(root, 'public/models/homr')
const homrRelease = 'https://github.com/liebharc/homr/releases/download/onnx_checkpoints'
const ownRelease = `https://github.com/jymen/homr-web/releases/download/${manifest.release}`

async function sha256(file) {
  const data = await readFile(file)
  return createHash('sha256').update(data).digest('hex')
}

async function download(url, file) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} ${url}`)
  }
  await pipeline(response.body, createWriteStream(file))
}

for (const entry of manifest.files) {
  const dir = path.join(destRoot, entry.sha256)
  const target = path.join(dir, entry.file)
  await mkdir(dir, { recursive: true })
  try {
    if ((await stat(target)).isFile() && (await sha256(target)) === entry.sha256) {
      console.log(`ok ${entry.file}`)
      continue
    }
  } catch {
    // Not downloaded yet.
  }
  const scratch = path.join(dir, `.partial-${entry.file}`)
  console.log(`fetch ${entry.file}`)
  if (entry.source === 'homr-web-release') {
    await download(`${ownRelease}/${entry.file}`, scratch)
    const actual = await sha256(scratch)
    if (actual !== entry.sha256) throw new Error(`hash mismatch for ${entry.file}: ${actual}`)
    await rm(target, { force: true })
    const { rename } = await import('node:fs/promises')
    await rename(scratch, target)
  } else {
    const zipName = `${entry.file.replace(/\.onnx$/, '')}.zip`
    const zipPath = path.join(dir, zipName)
    await download(`${homrRelease}/${zipName}`, zipPath)
    await exec('unzip', ['-q', '-o', '-j', zipPath, entry.file, '-d', dir])
    await rm(zipPath, { force: true })
    const actual = await sha256(target)
    if (actual !== entry.sha256) throw new Error(`hash mismatch for ${entry.file}: ${actual}`)
  }
  console.log(`saved ${entry.file}`)
}

console.log(`models ready in ${destRoot}`)
