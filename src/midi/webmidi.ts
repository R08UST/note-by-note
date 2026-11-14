import { WebMidi, type Input, type NoteMessageEvent } from 'webmidi'
import type { PlayedEvent } from '../judge/types'

export interface MidiPortInfo {
  id: string
  name: string
}

export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
}

/** True when the browser already lets this page use MIDI, so it can reconnect without a prompt. */
export async function midiGranted(): Promise<boolean> {
  if (!midiSupported() || !navigator.permissions) return false
  try {
    const status = await navigator.permissions.query({ name: 'midi' as PermissionName })
    return status.state === 'granted'
  } catch {
    return false
  }
}

export async function enableMidi(): Promise<void> {
  if (!midiSupported()) {
    throw new Error('This browser has no Web MIDI. Use Chrome or Edge on localhost.')
  }
  await WebMidi.enable()
}

export function listInputs(): MidiPortInfo[] {
  if (!WebMidi.enabled) return []
  return WebMidi.inputs.map((input) => ({
    id: input.id,
    name: input.name || 'MIDI keyboard',
  }))
}

export function watchInputs(onChange: () => void): () => void {
  const handler = () => onChange()
  WebMidi.addListener('connected', handler)
  WebMidi.addListener('disconnected', handler)
  return () => {
    WebMidi.removeListener('connected', handler)
    WebMidi.removeListener('disconnected', handler)
  }
}

function velocityOf(raw: number | undefined, normalized: number | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  return Math.round((normalized ?? 0.8) * 127)
}

/** Listen on every input. Many USB pianos show up as two ports and only one carries the keys. */
export const ALL_INPUTS = '*'

export function attachInput(
  id: string,
  onEvent: (event: PlayedEvent) => void,
  onSustain?: (down: boolean) => void,
): () => void {
  if (id === ALL_INPUTS) {
    const detach = WebMidi.inputs.map((input) => attachOne(input, onEvent, onSustain))
    return () => detach.forEach((stop) => stop())
  }
  const input: Input | undefined = WebMidi.inputs.find((item) => item.id === id)
  if (!input) return () => {}
  return attachOne(input, onEvent, onSustain)
}

function attachOne(
  input: Input,
  onEvent: (event: PlayedEvent) => void,
  onSustain?: (down: boolean) => void,
): () => void {

  const noteOn = (event: NoteMessageEvent) => {
    const velocity = velocityOf(event.note.rawAttack, event.note.attack)
    const type = velocity === 0 ? 'off' : 'on'
    onEvent({
      pitch: event.note.number,
      velocity,
      timeMs: event.timestamp,
      type,
    })
  }
  const noteOff = (event: NoteMessageEvent) => {
    onEvent({
      pitch: event.note.number,
      velocity: velocityOf(event.note.rawRelease, event.note.release),
      timeMs: event.timestamp,
      type: 'off',
    })
  }

  const sustain = (event: { controller: { number: number }; rawValue?: number }) => {
    if (event.controller.number !== 64) return
    onSustain?.((event.rawValue ?? 0) >= 64)
  }
  input.addListener('noteon', noteOn)
  input.addListener('noteoff', noteOff)
  if (onSustain) input.addListener('controlchange', sustain)
  return () => {
    input.removeListener('noteon', noteOn)
    input.removeListener('noteoff', noteOff)
    if (onSustain) input.removeListener('controlchange', sustain)
  }
}
