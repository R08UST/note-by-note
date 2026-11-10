// Match judged notes to OSMD heads for every bundled score.
// Usage: npx vite-node scripts/audit-marks.mjs
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Window } from 'happy-dom'
import { unzipSync } from 'fflate'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { parseMusicXml } from '../src/score/parseMusicXml.ts'
import { collectHeads } from '../src/score/osmdHeads.ts'
import { mapNotesToHeads, unmatchedSummary } from '../src/score/mapNotes.ts'

const window = new Window()
globalThis.window = window
globalThis.document = window.document
globalThis.DOMParser = window.DOMParser
globalThis.Node = window.Node
globalThis.Element = window.Element
globalThis.HTMLElement = window.HTMLElement
globalThis.SVGElement = window.SVGElement
globalThis.MutationObserver = window.MutationObserver

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

const root = path.resolve(import.meta.dirname, '..')
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
    await osmd.load(xml)
    try { osmd.render() } catch { /* happy-dom has no font context; the note model is already built */ }
    const stub = { setColor() {}, getSVGGElement() { return {} } }
    const collected = collectHeads(osmd.Sheet, (note) => osmd.EngravingRules.GNote(note) ?? stub)
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
}
low.sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))
console.log(JSON.stringify({ checked: done, below98: low.length, pieces: low }, null, 2))
window.happyDOM.close()
