import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMusicXml } from './parseMusicXml'
import { compilePerformance } from '../audio/performance'
import { unpackMxl } from './mxl'

const directory = `${process.cwd()}/public/pieces`

function xmlOf(name: string): string {
  const buffer = readFileSync(`${directory}/${name}`)
  if (name.endsWith('.mxl')) return unpackMxl(new Uint8Array(buffer))
  return buffer.toString('utf8')
}

function files(): string[] {
  const all = readdirSync(directory)
    .filter((name) => name.endsWith('.musicxml') || name.endsWith('.mxl'))
    .sort()
  // The library is over 200 MB of MusicXML once unpacked, which is more than the test DOM
  // parser can chew through in one worker. A spread-out sample still covers every engraver
  // and every kind of printed mark without stalling the suite. The worker heap is raised in
  // `vitest.config.ts` because one score alone can hold 2 MB of markup.
  const step = Math.max(1, Math.floor(all.length / 60))
  return all.filter((_, index) => index % step === 0)
}

describe('library expression', () => {
  it('parses every bundled score and keeps its expression usable', () => {
    const names = files()
    let withDynamics = 0
    let withWedges = 0
    let withPedals = 0
    let withTempos = 0
    let withArticulation = 0
    let withSlur = 0
    let withFermata = 0
    let withGraces = 0
    let withOrnament = 0
    const problems: string[] = []

    for (const name of names) {
      const parsed = parseMusicXml(xmlOf(name))
      if (parsed.dynamics.length > 0) withDynamics += 1
      if (parsed.wedges.length > 0) withWedges += 1
      if (parsed.pedals.length > 0) withPedals += 1
      if (parsed.tempos.length > 0) withTempos += 1
      if (parsed.notes.some((note) => note.articulation)) withArticulation += 1
      if (parsed.notes.some((note) => note.slur != null)) withSlur += 1
      if (parsed.notes.some((note) => note.fermata)) withFermata += 1
      if (parsed.notes.some((note) => note.graces)) withGraces += 1
      if (parsed.notes.some((note) => note.ornament)) withOrnament += 1

      const performed = compilePerformance(parsed.notes, {
        dynamics: parsed.dynamics,
        wedges: parsed.wedges,
        pedals: parsed.pedals,
      })
      expect(performed).toHaveLength(parsed.notes.length)
      for (const note of performed) {
        if (!(note.velocity > 0 && note.velocity <= 1)) problems.push(`${name}: velocity ${note.velocity}`)
        if (!(note.gate > 0)) problems.push(`${name}: gate ${note.gate}`)
        if (!Number.isFinite(note.beat)) problems.push(`${name}: beat ${note.beat}`)
      }
      // Every printed ornament and grace note has to come out as real attacks.
      const decorated = parsed.notes.filter((note) => note.ornament || note.graces?.length)
      const playedOut = performed.filter((note) => note.extras?.length)
      if (playedOut.length !== decorated.length) {
        problems.push(`${name}: ${decorated.length} decorated notes but ${playedOut.length} played out`)
      }
      for (const played of playedOut) {
        for (const extra of played.extras ?? []) {
          if (!(extra.gate > 0)) problems.push(`${name}: ornament attack with gate ${extra.gate}`)
          if (extra.pitch < 21 || extra.pitch > 108) problems.push(`${name}: ornament pitch ${extra.pitch}`)
        }
      }
      for (const wedge of parsed.wedges) {
        if (wedge.endBeat != null && wedge.endBeat < wedge.startBeat) {
          problems.push(`${name}: wedge ends before it starts`)
        }
      }
      for (const pedal of parsed.pedals) {
        if (pedal.upBeat != null && pedal.upBeat < pedal.downBeat) {
          problems.push(`${name}: pedal lifts before it presses`)
        }
      }
    }

    console.log({ total: names.length, withDynamics, withWedges, withPedals, withTempos, withArticulation, withSlur, withFermata, withGraces, withOrnament })
    expect(problems).toEqual([])
    // A sample of the library, not the whole of it: just enough to prove that the
    // real engravers' marks survive the parser and the performance compiler.
    expect(withDynamics).toBeGreaterThan(10)
    expect(withWedges).toBeGreaterThan(5)
    expect(withTempos).toBeGreaterThan(30)
    expect(withArticulation).toBeGreaterThan(5)
    expect(withSlur).toBeGreaterThan(10)
    expect(withOrnament).toBeGreaterThan(3)
  }, 60_000)
})
