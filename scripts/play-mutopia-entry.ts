import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { WaitMode } from '../src/modes/waitMode'
import { parseMusicXml } from '../src/score/parseMusicXml'

const window = new Window()
globalThis.DOMParser = window.DOMParser as unknown as typeof DOMParser
const jobs = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as { id: string; path: string; measures: number }[]
const bad: { id: string; reason: string }[] = []
for (const job of jobs) {
  try {
    const score = parseMusicXml(readFileSync(job.path, 'utf8'))
    if (score.notes.length < 1) {
      bad.push({ id: job.id, reason: 'parser found no notes' })
      continue
    }
    const highest = Math.max(...score.notes.map((note) => note.measure))
    if (highest !== job.measures) {
      bad.push({ id: job.id, reason: `measure count ${highest} does not match ${job.measures}` })
      continue
    }
    const mode = new WaitMode(score.notes)
    let guard = 0
    while (!mode.done() && guard < 30000) {
      const current = mode.currentNotes()
      if (current.length === 0) break
      for (const note of current) mode.push({ pitch: note.pitch, velocity: 80, timeMs: 0, type: 'on' })
      guard += 1
    }
    if (!mode.done()) bad.push({ id: job.id, reason: 'judge did not finish the piece' })
  } catch (error) {
    bad.push({ id: job.id, reason: error instanceof Error ? error.message : String(error) })
  }
}
process.stdout.write(JSON.stringify(bad))
window.happyDOM.close()
