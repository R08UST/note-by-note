import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { unzipSync } from 'fflate'
import { parseMusicXml } from './.parse-score.mjs'

function unpackMxl(data) {
  const files = unzipSync(data)
  const decode = (bytes) => new TextDecoder().decode(bytes)
  const container = files['META-INF/container.xml']
  if (container) {
    const full = decode(container).match(/full-path="([^"]+)"/)?.[1]
    if (full && files[full]) return decode(files[full])
  }
  const fallback = Object.entries(files).find(
    ([name]) => name.toLowerCase().endsWith('.xml') && !name.includes('META-INF'),
  )
  if (!fallback) throw new Error('The .mxl archive does not contain a score.')
  return decode(fallback[1])
}

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const window = new Window()
globalThis.DOMParser = window.DOMParser
const results = []
for (const job of jobs) {
  try {
    const bytes = readFileSync(job.path)
    const xml = job.path.endsWith('.mxl') ? unpackMxl(bytes) : bytes.toString('utf8')
    const score = parseMusicXml(xml)
    results.push({ id: job.id, notes: score.notes.length, error: score.notes.length === 0 ? 'zero notes' : null })
  } catch (error) {
    results.push({ id: job.id, notes: 0, error: error instanceof Error ? error.message : String(error) })
  }
}
window.happyDOM.close()
process.stdout.write(JSON.stringify(results))
