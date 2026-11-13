// Match judged notes to OSMD heads for every bundled score.
// Usage: node scripts/audit-marks.mjs (bundled first with rolldown; AUDIT_ROOT points at the repo)
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Window } from 'happy-dom'
import { unzipSync } from 'fflate'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { parseMusicXml } from '../src/score/parseMusicXml.ts'
import { collectHeads } from '../src/score/osmdHeads.ts'
import { mapNotesToHeads, unmatchedSummary } from '../src/score/mapNotes.ts'
import { normalizeForOsmd } from '../src/score/mxl.ts'

// OSMD keeps a DOM tree per score, and the library is over a thousand files now, so the
// window is thrown away and rebuilt every so often instead of growing until the heap dies.
let window = new Window()
function resetDom() {
  window.happyDOM.close()
  window = new Window()
  globalThis.window = window
  globalThis.document = window.document
  globalThis.DOMParser = window.DOMParser
  globalThis.Node = window.Node
  globalThis.Element = window.Element
  globalThis.HTMLElement = window.HTMLElement
  globalThis.SVGElement = window.SVGElement
  globalThis.MutationObserver = window.MutationObserver
}
resetDom()

function unpack(file) {
  const bytes = readFileSync(file)
  if (!file.endsWith('.mxl')) return bytes.toString('utf8')
  const files = unzipSync(bytes)
  const container = files['META-INF/container.xml']
  const text = (value) => new TextDecoder().decode(value)
  if (container) {
    const full = text(container).match(/full-path="([^"]+)"/)?.[1]
    if (full && files[full]) return text(files[full])
  }
  const xml = Object.entries(files).find(([name]) => name.endsWith('.xml') && !name.includes('META-INF'))
  if (!xml) throw new Error('no score')
  return text(xml[1])
}

function filesUnder(dir) {
  const found = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) found.push(...filesUnder(full))
    else if (/\.(mxl|musicxml|xml)$/.test(name.name)) found.push(full)
  }
  return found
}

// The script is bundled before it runs, so its own location says nothing about the repo. The
// caller passes the checkout root; a direct run falls back to the parent of this file.
const root = process.env.AUDIT_ROOT ? path.resolve(process.env.AUDIT_ROOT) : path.resolve(import.meta.dirname, '..')
const only = process.argv[2]
const offset = Number(process.env.AUDIT_OFFSET ?? 0)
const limit = Number(process.env.AUDIT_LIMIT ?? 0)
let scores = filesUnder(path.join(root, 'public/pieces')).filter((file) => !file.endsWith('container.xml') && (!only || file.includes(only)))
scores.sort()
if (limit) scores = scores.slice(offset, offset + limit)
const low = []
let done = 0
for (const file of scores) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const osmd = new OpenSheetMusicDisplay(host, { autoResize: false, backend: 'svg', drawTitle: false })
  try {
    const xml = unpack(file)
    const parsed = parseMusicXml(xml)
    if (parsed.notes.length === 0) continue
    await osmd.load(normalizeForOsmd(xml))
    // The sheet model from load() already carries every head, and rendering would build a
    // full SVG per score, which is what made the heap grow without bound.
    // Only head positions are audited, so no GraphicalNote is looked up. GNote() caches one
    // object per note in a dictionary that never shrinks, which exhausts the heap on long scores.
    const collected = collectHeads(osmd.Sheet, () => undefined)
    const mapped = mapNotesToHeads(parsed.notes, collected.heads)
    const rate = mapped.matched / parsed.notes.length
    if (rate < 1) {
      low.push({
        file: path.relative(root, file),
        matched: mapped.matched,
        total: parsed.notes.length,
        rate: Math.round(rate * 1000) / 10,
        reasons: unmatchedSummary(mapped.unmatched),
      })
    }
  } catch (error) {
    low.push({ file: path.relative(root, file), error: error instanceof Error ? error.message : String(error) })
  }
  osmd.clear?.()
  host.remove()
  done += 1
  if (done % 25 === 0) console.error(`${done}/${scores.length}`)
  // happy-dom detaches a parsed document on a queued task, so the loop has to yield once and
  // then collect; otherwise the heap keeps every score tree and dies after a few dozen files.
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (global.gc) global.gc()
  if (done % 50 === 0) resetDom()
  if (process.env.AUDIT_MEM) console.error('mem', done, Math.round(process.memoryUsage().heapUsed / 1048576) + 'MB')
}
low.sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))
console.log(JSON.stringify({ checked: done, below98: low.length, pieces: low }, null, 2))
window.happyDOM.close()
