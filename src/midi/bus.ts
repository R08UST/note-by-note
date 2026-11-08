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
