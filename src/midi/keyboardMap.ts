export interface KeyBinding {
  code: string
  pitch: number
  label: string
}

/**
 * Computer-keyboard fallback, same layout as a desk piano:
 * Q row starts at C4, Z row starts at C3, and the keys between them are black notes.
 */
export const KEY_BINDINGS: KeyBinding[] = [
  { code: 'KeyQ', pitch: 60, label: 'Q' },
  { code: 'KeyW', pitch: 62, label: 'W' },
  { code: 'KeyE', pitch: 64, label: 'E' },
  { code: 'KeyR', pitch: 65, label: 'R' },
  { code: 'KeyT', pitch: 67, label: 'T' },
  { code: 'KeyY', pitch: 69, label: 'Y' },
  { code: 'KeyU', pitch: 71, label: 'U' },
  { code: 'KeyI', pitch: 72, label: 'I' },
  { code: 'KeyO', pitch: 74, label: 'O' },
  { code: 'KeyP', pitch: 76, label: 'P' },
  { code: 'BracketLeft', pitch: 77, label: '[' },
  { code: 'BracketRight', pitch: 79, label: ']' },
  { code: 'Digit2', pitch: 61, label: '2' },
  { code: 'Digit3', pitch: 63, label: '3' },
  { code: 'Digit5', pitch: 66, label: '5' },
  { code: 'Digit6', pitch: 68, label: '6' },
  { code: 'Digit7', pitch: 70, label: '7' },
  { code: 'Digit9', pitch: 73, label: '9' },
  { code: 'Digit0', pitch: 75, label: '0' },
  { code: 'KeyZ', pitch: 48, label: 'Z' },
  { code: 'KeyX', pitch: 50, label: 'X' },
  { code: 'KeyC', pitch: 52, label: 'C' },
  { code: 'KeyV', pitch: 53, label: 'V' },
  { code: 'KeyB', pitch: 55, label: 'B' },
  { code: 'KeyN', pitch: 57, label: 'N' },
  { code: 'KeyM', pitch: 59, label: 'M' },
  { code: 'Comma', pitch: 60, label: ',' },
  { code: 'Period', pitch: 62, label: '.' },
  { code: 'Slash', pitch: 64, label: '/' },
  { code: 'KeyS', pitch: 49, label: 'S' },
  { code: 'KeyD', pitch: 51, label: 'D' },
  { code: 'KeyG', pitch: 54, label: 'G' },
  { code: 'KeyH', pitch: 56, label: 'H' },
  { code: 'KeyJ', pitch: 58, label: 'J' },
]

const byCode = new Map(KEY_BINDINGS.map((binding) => [binding.code, binding.pitch]))

export function pitchForCode(code: string): number | undefined {
  return byCode.get(code)
}

export function keyLabel(pitch: number): string | undefined {
  const labels = KEY_BINDINGS.filter((binding) => binding.pitch === pitch).map((binding) => binding.label)
  return labels.find((label) => /^[A-Z]$/.test(label)) ?? labels[0]
}
