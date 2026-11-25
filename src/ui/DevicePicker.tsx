import { ALL_INPUTS, type MidiPortInfo } from '../midi/webmidi'
import { noteName } from '../score/pitch'

interface LastNote {
  pitch: number
  port: string
}

interface DevicePickerProps {
  supported: boolean
  enabled: boolean
  busy: boolean
  inputs: MidiPortInfo[]
  inputId: string
  error: string | null
  onEnable: () => void
  onRescan: () => void
  onSelect: (id: string) => void
  last: LastNote | null
}

export function DevicePicker({
  supported,
  enabled,
  busy,
  inputs,
  inputId,
  error,
  onEnable,
  onRescan,
  onSelect,
  last,
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
            <option value={ALL_INPUTS}>{inputs.length === 0 ? '还没有设备（插上会自动接上）' : `所有键盘（${inputs.length} 个端口）`}</option>
            {inputs.map((input) => (
              <option key={input.id} value={input.id}>
                {input.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {enabled && (
        <button type="button" className="button ghost" onClick={onRescan} disabled={busy}>
          {busy ? '正在扫描…' : '重新扫描'}
        </button>
      )}
      {enabled && (
        <p className="device-note">
          {last
            ? `收到：${noteName(last.pitch)}（来自 ${last.port}）`
            : '按一下琴键，这里会显示收到的音。没有反应时：换一个 USB 口或重插键盘，关掉其他正在用 MIDI 的软件（编曲软件、其他钢琴网页），再点「重新扫描」。'}
        </p>
      )}
      {error && <p className="device-note error">{error}</p>}
    </div>
  )
}

export interface MidiStatus {
  supported: boolean
  on: boolean
  busy: boolean
  error: string | null
  devices: number
  last: LastNote | null
  enable: () => void
  rescan: () => void
}

/** MIDI state in the top bar, with the connect button where every tab can reach it. */
export function MidiChip({ midi, keyboardEnabled }: { midi: MidiStatus; keyboardEnabled: boolean }) {
  if (!midi.supported) return <span className="midi-chip">{keyboardEnabled ? '电脑键盘输入（这个浏览器没有 MIDI）' : '这个浏览器没有 MIDI'}</span>
  if (midi.on) {
    return (
      <span className={midi.devices > 0 ? 'midi-chip is-on' : 'midi-chip'}>
        {midi.devices === 0
          ? 'MIDI 已打开，还没插键盘'
          : midi.last
            ? `MIDI · 收到 ${noteName(midi.last.pitch)}`
            : `MIDI 已连接 · ${midi.devices} 个端口 · 按个键试试`}
        {(midi.devices === 0 || !midi.last) && (
          <button type="button" className="button ghost" onClick={midi.rescan} disabled={midi.busy} title="插上键盘却没反应时，重新找一遍 MIDI 设备">
            {midi.busy ? '正在扫描…' : '重新扫描'}
          </button>
        )}
      </span>
    )
  }
  return (
    <span className="midi-chip">
      <button type="button" className="button primary" onClick={midi.enable} disabled={midi.busy}>
        {midi.busy ? '正在请求…' : '连接 MIDI 键盘'}
      </button>
      {midi.error && <span className="error">{midi.error}</span>}
    </span>
  )
}
