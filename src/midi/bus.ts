import type { PlayedEvent } from '../judge/types'

export type InputListener = (event: PlayedEvent) => void

export function createInputBus() {
  const listeners = new Set<InputListener>()
  return {
    emit(event: PlayedEvent) {
      for (const listener of listeners) listener(event)
    },
    subscribe(listener: InputListener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type InputBus = ReturnType<typeof createInputBus>

/**
 * One keyboard can appear as two ports (Windows MIDI Services lists a legacy and a new
 * endpoint, and a DAW or loopback can echo a port), so listening on all of them hears
 * every key twice. The returned check drops a note that a different port repeats within
 * `windowMs`. A fast repeat on the same port is always kept.
 */
export function createPortDeduper(windowMs = 8) {
  const last = new Map<string, { port: string; timeMs: number }>()
  return (port: string, event: PlayedEvent): boolean => {
    const key = `${event.type}:${event.pitch}`
    const prev = last.get(key)
    if (prev && prev.port !== port && Math.abs(event.timeMs - prev.timeMs) < windowMs) return false
    last.set(key, { port, timeMs: event.timeMs })
    return true
  }
}
