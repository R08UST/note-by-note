import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { parseMusicXml } from './.parse-score.mjs'

const window = new Window()
globalThis.DOMParser = window.DOMParser
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const out = []
for (const job of jobs) {
  try {
    const score = parseMusicXml(readFileSync(job.path, 'utf8'))
    out.push({
      id: job.id,
      notes: score.notes.map((note, index) => ({
        id: note.id || `n${index}`,
        pitch: note.pitch,
        beat: note.beat,
        duration: note.duration,
        hand: note.hand,
        measure: note.measure,
      })),
    })
  } catch {
    out.push({ id: job.id, notes: [] })
  }
}
process.stdout.write(JSON.stringify(out))
window.happyDOM.close()
