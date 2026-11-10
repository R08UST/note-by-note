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
      {!supported && <p className="device-note">Web MIDI 需要在 Chrome 或 Edge 里打开本机页面。</p>}
      {supported && !enabled && (
        <button type="button" className="button ghost" onClick={onEnable} disabled={busy}>
          {busy ? '正在请求…' : '打开 MIDI'}
        </button>
      )}
      {enabled && (
        <label className="device-select">
          <span>键盘</span>
          <select value={inputId} onChange={(event) => onSelect(event.target.value)}>
            {inputs.length === 0 && <option value="">还没有设备</option>}
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
