import type { MidiPortInfo } from '../midi/webmidi'

interface DevicePickerProps {
  supported: boolean
  enabled: boolean
  busy: boolean
  inputs: MidiPortInfo[]
  inputId: string
  error: string | null
  onEnable: () => void
  onSelect: (id: string) => void
}

export function DevicePicker({
  supported,
  enabled,
  busy,
  inputs,
  inputId,
  error,
  onEnable,
  onSelect,
}: DevicePickerProps) {
  return (
    <div className="device">
      {!supported && <p className="device-note">Web MIDI needs Chrome or Edge on localhost.</p>}
      {supported && !enabled && (
        <button type="button" className="button ghost" onClick={onEnable} disabled={busy}>
          {busy ? 'Asking…' : 'Enable MIDI'}
        </button>
      )}
      {enabled && (
        <label className="device-select">
          <span>Keyboard</span>
          <select value={inputId} onChange={(event) => onSelect(event.target.value)}>
            {inputs.length === 0 && <option value="">No device yet</option>}
            {inputs.map((input) => (
              <option key={input.id} value={input.id}>
                {input.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="device-note error">{error}</p>}
    </div>
  )
}
