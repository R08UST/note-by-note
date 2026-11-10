import { describe, expect, it } from 'vitest'
import { parseMusicXml } from './parseMusicXml'
import { defaultHands, inspectMidi, midiToMusicXml } from './midiScore'
import { exportScoresZip, readScoresZip, assertPlayableMusicXml } from './scoreBackup'

function variable(value: number): number[] {
  const bytes = [value & 0x7f]
  let rest = value >> 7
  while (rest > 0) {
    bytes.push((rest & 0x7f) | 0x80)
    rest >>= 7
  }
  return bytes.reverse()
}

function track(events: number[]): Uint8Array {
  const body = Uint8Array.from([...events, 0x00, 0xff, 0x2f, 0x00])
  const head = new Uint8Array(8)
  head.set([0x4d, 0x54, 0x72, 0x6b])
  new DataView(head.buffer).setUint32(4, body.length)
  const out = new Uint8Array(head.length + body.length)
  out.set(head)
  out.set(body, head.length)
  return out
}

function file(tracks: Uint8Array[]): Uint8Array {
  const head = new Uint8Array(14)
  head.set([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, tracks.length > 1 ? 1 : 0])
  const view = new DataView(head.buffer)
  view.setUint16(10, tracks.length)
  view.setUint16(12, 480)
  const size = head.length + tracks.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(size)
  out.set(head)
  let offset = head.length
  for (const item of tracks) {
    out.set(item, offset)
    offset += item.length
  }
  return out
}

function noteOn(delta: number, pitch: number, velocity = 90): number[] {
  return [...variable(delta), 0x90, pitch, velocity]
}

describe('midi import', () => {
  it('turns one quarter note into playable MusicXML', () => {
    const data = file([track([...noteOn(0, 60), ...noteOn(480, 60, 0)])])
    const overview = inspectMidi(data)
    expect(overview.tracks).toHaveLength(1)
    expect(overview.tracks[0]?.notes).toBe(1)
    const xml = midiToMusicXml(data, defaultHands(overview.tracks))
    const score = parseMusicXml(xml)
    expect(score.notes.map((note) => note.pitch)).toEqual([60])
    expect(score.notes[0]?.hand).toBe('R')
    expect(score.timeSignature).toEqual({ beats: 4, beatType: 4 })
  })

  it('keeps the chosen tracks on the right and left hands', () => {
    const right = track([...noteOn(0, 72), ...noteOn(480, 72, 0)])
    const left = track([...noteOn(0, 48), ...noteOn(480, 48, 0)])
    const data = file([right, left])
    const overview = inspectMidi(data)
    const xml = midiToMusicXml(data, { right: [0], left: [1] })
    const score = parseMusicXml(xml)
    expect(score.notes.find((note) => note.pitch === 72)?.hand).toBe('R')
    expect(score.notes.find((note) => note.pitch === 48)?.hand).toBe('L')
    expect(defaultHands(overview.tracks).left).toEqual([1])
  })
})

describe('private score backup', () => {
  it('round-trips titles, levels, and tags', () => {
    const zip = exportScoresZip([{ title: '夜曲', xml: '<score/>', level: 'L3', tag: '流行' }])
    expect(readScoresZip(zip)).toEqual([{ title: '夜曲', xml: '<score/>', level: 'L3', tag: '流行' }])
  })

  it('explains a file that is not playable MusicXML', () => {
    expect(() => assertPlayableMusicXml('<not-a-score/>')).toThrow(/MusicXML|音符|乐谱/)
  })
})
