import { spellPitch } from '../train/musicXml'

export interface MidiTrackInfo {
  index: number
  name: string
  notes: number
  low: number
  high: number
}

export interface MidiOverview {
  ppq: number
  tracks: MidiTrackInfo[]
}

interface RawNote {
  tick: number
  duration: number
  pitch: number
  track: number
}

/** Default: the busiest track is the right hand, the next is the left. */
export function defaultHands(tracks: readonly MidiTrackInfo[]): { right: number[]; left: number[] } {
  const ranked = tracks.map((track) => track.index).sort((a, b) => (tracks[b]?.notes ?? 0) - (tracks[a]?.notes ?? 0))
  return { right: ranked[0] == null ? [] : [ranked[0]], left: ranked[1] == null ? [] : [ranked[1]] }
}

export function inspectMidi(data: Uint8Array): MidiOverview {
  const parsed = parseMidi(data)
  return {
    ppq: parsed.ppq,
    tracks: parsed.tracks.map((track) => ({
      index: track.index,
      name: track.name || `音轨 ${track.index + 1}`,
      notes: track.notes.length,
      low: track.notes.reduce((min, note) => Math.min(min, note.pitch), 127),
      high: track.notes.reduce((max, note) => Math.max(max, note.pitch), 0),
    })),
  }
}

export function midiToMusicXml(
  data: Uint8Array,
  hands: { right: number[]; left: number[] },
  options?: { splitAt?: number | null },
): string {
  const parsed = parseMidi(data)
  const right = new Set(hands.right)
  const left = new Set(hands.left)
  const chosen: RawNote[] = []
  for (const track of parsed.tracks) {
    const asRight = right.has(track.index)
    const asLeft = left.has(track.index)
    if (!asRight && !asLeft) continue
    for (const note of track.notes) {
      const useLeft = asLeft && (!asRight || (options?.splitAt != null && note.pitch < options.splitAt))
      chosen.push({ ...note, track: useLeft ? 1 : 0 })
    }
  }
  if (chosen.length === 0) throw new Error('没有分配到左右手的音符。')
  return renderXml(chosen, parsed.ppq, parsed.beats, parsed.beatType, parsed.fifths)
}

interface ParsedTrack {
  index: number
  name: string
  notes: RawNote[]
}

function parseMidi(data: Uint8Array): { ppq: number; beats: number; beatType: number; fifths: number; tracks: ParsedTrack[] } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (readText(data, 0, 4) !== 'MThd' || view.byteLength < 14) throw new Error('这不是 MIDI 文件。')
  const format = view.getUint16(8)
  if (format > 1) throw new Error('不支持这种 MIDI 格式。')
  const ppqRaw = view.getUint16(12)
  if (ppqRaw & 0x8000) throw new Error('不支持 SMPTE 时间的 MIDI。')
  const ppq = ppqRaw || 480
  let offset = 14
  const rawTracks: { name: string; notes: { tick: number; pitch: number; duration: number; channel: number }[] }[] = []
  let beats = 4
  let beatType = 4
  let fifths = 0
  while (offset + 8 <= data.length) {
    if (readText(data, offset, 4) !== 'MTrk') break
    const length = view.getUint32(offset + 4)
    offset += 8
    const end = Math.min(data.length, offset + length)
    const events = readTrack(data, offset, end)
    offset = end
    const name = events.name || `音轨 ${rawTracks.length + 1}`
    if (events.beats) beats = events.beats
    if (events.beatType) beatType = events.beatType
    if (events.fifths != null) fifths = events.fifths
    rawTracks.push({ name, notes: events.notes })
  }
  const tracks: ParsedTrack[] = []
  rawTracks.forEach((track, trackIndex) => {
    const channels = new Map<number, RawNote[]>()
    for (const note of track.notes) {
      const list = channels.get(note.channel) ?? []
      list.push({ tick: note.tick, duration: note.duration, pitch: note.pitch, track: 0 })
      channels.set(note.channel, list)
    }
    const groups = [...channels.entries()].filter((entry) => entry[1].length > 0)
    groups.forEach(([channel, notes], groupIndex) => {
      tracks.push({
        index: tracks.length,
        name: groups.length > 1 ? `${track.name} 通道 ${channel + 1}` : track.name || `音轨 ${trackIndex + 1}`,
        notes,
      })
      void groupIndex
    })
  })
  if (tracks.length === 0) throw new Error('MIDI 里没有音符。')
  return { ppq, beats, beatType, fifths, tracks }
}

function readTrack(data: Uint8Array, start: number, end: number): {
  name: string
  notes: { tick: number; pitch: number; duration: number; channel: number }[]
  beats?: number
  beatType?: number
  fifths?: number
} {
  let offset = start
  let tick = 0
  let status = 0
  let name = ''
  let beats: number | undefined
  let beatType: number | undefined
  let fifths: number | undefined
  const open = new Map<string, number>()
  const notes: { tick: number; pitch: number; duration: number; channel: number }[] = []
  while (offset < end) {
    const delta = readVar(data, offset)
    offset = delta.next
    tick += delta.value
    let byte = data[offset] ?? 0
    if (byte >= 0x80) {
      status = byte
      offset += 1
    }
    if (status === 0xff) {
      const type = data[offset] ?? 0
      const length = readVar(data, offset + 1)
      offset = length.next
      const payload = data.subarray(offset, offset + length.value)
      offset += length.value
      if (type === 0x03) name = new TextDecoder().decode(payload)
      if (type === 0x58 && payload.length >= 2) {
        beats = payload[0] ?? 4
        beatType = 2 ** (payload[1] ?? 2)
      }
      if (type === 0x59 && payload.length >= 2) fifths = (payload[0] ?? 0) << 24 >> 24
      if (type === 0x2f) break
      continue
    }
    if (status === 0xf0 || status === 0xf7) {
      const length = readVar(data, offset)
      offset = length.next + length.value
      continue
    }
    const kind = status & 0xf0
    const channel = status & 0x0f
    if (kind === 0xc0 || kind === 0xd0) {
      offset += 1
      continue
    }
    const data1 = data[offset] ?? 0
    const data2 = data[offset + 1] ?? 0
    offset += 2
    if (kind === 0x90 && data2 > 0) open.set(`${channel}:${data1}`, tick)
    if ((kind === 0x80 || (kind === 0x90 && data2 === 0)) && open.has(`${channel}:${data1}`)) {
      const began = open.get(`${channel}:${data1}`) ?? tick
      open.delete(`${channel}:${data1}`)
      if (tick > began) notes.push({ tick: began, pitch: data1, duration: tick - began, channel })
    }
  }
  return { name, notes, beats, beatType, fifths }
}

function renderXml(notes: RawNote[], ppq: number, beats: number, beatType: number, fifths: number): string {
  const ticksPerMeasure = Math.round((ppq * beats * 4) / beatType)
  const hands = new Set(notes.map((note) => (note.track === 1 ? 'L' : 'R')))
  const staves = hands.has('L') && hands.has('R') ? 2 : 1
  const clef = staves === 2 ? 'grand' : notes.every((note) => note.pitch < 60) ? 'bass' : 'treble'
  const measures = new Map<number, string[]>()
  const sorted = [...notes].sort((a, b) => a.tick - b.tick || a.track - b.track || a.pitch - b.pitch)
  for (const note of sorted) {
    let remaining = note.duration
    let tick = note.tick
    let tied = false
    while (remaining > 0) {
      const measure = Math.floor(tick / ticksPerMeasure) + 1
      const local = tick % ticksPerMeasure
      const room = ticksPerMeasure - local
      const take = Math.min(remaining, room)
      const next = remaining - take > 0
      const staff = staves === 1 ? '' : `<staff>${note.track === 1 ? 2 : 1}</staff>`
      const voice = note.track === 1 ? 2 : 1
      const spelled = spellPitch(note.pitch, fifths)
      const alter = spelled.alter === 0 ? '' : `<alter>${spelled.alter}</alter>`
      const tie = tied || next ? `<tie type="${tied && next ? 'stop' : next ? 'start' : 'stop'}"/>` : ''
      const tiedStart = next ? '<tied type="start"/>' : ''
      const tiedStop = tied ? '<tied type="stop"/>' : ''
      const notations = tiedStart || tiedStop ? `<notations>${tiedStop}${tiedStart}</notations>` : ''
      const chord = (measures.get(measure) ?? []).some((xml) => xml.includes(`<voice>${voice}</voice>`) && xml.includes(`local-${local}`))
      const body = `<note>${chord ? '<chord/>' : ''}<pitch><step>${spelled.step}</step>${alter}<octave>${spelled.octave}</octave></pitch><duration>${take}</duration>${tie}<voice>${voice}</voice><type>quarter</type>${staff}${notations}<!--local-${local}--></note>`
      const list = measures.get(measure) ?? []
      list.push(body)
      measures.set(measure, list)
      tick += take
      remaining -= take
      tied = true
      if (measure > 400) break
    }
  }
  const numbers = [...measures.keys()].sort((a, b) => a - b)
  const last = numbers[numbers.length - 1] ?? 1
  const bodies: string[] = []
  for (let number = 1; number <= last; number += 1) {
    const chunks: string[] = []
    if (number === 1) {
      const clefs =
        clef === 'grand'
          ? '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>'
          : clef === 'bass'
            ? '<clef><sign>F</sign><line>4</line></clef>'
            : '<clef><sign>G</sign><line>2</line></clef>'
      chunks.push(
        `<attributes><divisions>${ppq}</divisions><key><fifths>${fifths}</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>${clefs}</attributes>`,
      )
    }
    const notesXml = (measures.get(number) ?? []).map((xml) => xml.replace(/<!--local-\d+-->/g, ''))
    if (staves === 2) {
      const right = notesXml.filter((xml) => xml.includes('<staff>1</staff>') || !xml.includes('<staff>'))
      const left = notesXml.filter((xml) => xml.includes('<staff>2</staff>'))
      chunks.push(...right)
      chunks.push(`<backup><duration>${ticksPerMeasure}</duration></backup>`)
      chunks.push(...left)
    } else {
      chunks.push(...notesXml)
    }
    bodies.push(`<measure number="${number}">${chunks.join('')}</measure>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><work><work-title>MIDI</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${bodies.join('')}</part></score-partwise>`
}

function readText(data: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...data.subarray(offset, offset + length))
}

function readVar(data: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0
  let index = offset
  for (let guard = 0; guard < 4; guard += 1) {
    const byte = data[index] ?? 0
    index += 1
    value = (value << 7) | (byte & 0x7f)
    if ((byte & 0x80) === 0) break
  }
  return { value, next: index }
}
