import type { PitchStatRecord } from '../storage/db'
import { noteName } from '../score/pitch'

export function HeatKeys({ stats }: { stats: readonly PitchStatRecord[] }) {
  const byPitch = new Map(stats.map((stat) => [stat.pitch, stat]))
  const low = 48
  const high = 84
  const keys: number[] = []
  for (let pitch = low; pitch <= high; pitch += 1) keys.push(pitch)
  const worst = [...stats].filter((stat) => stat.seen > 0).sort((a, b) => b.errors / b.seen - a.errors / a.seen).slice(0, 5)
  return (
    <div className="heat">
      <div className="heat-keys" aria-label="错误率">
        {keys.map((pitch) => {
          const stat = byPitch.get(pitch)
          const rate = stat && stat.seen > 0 ? stat.errors / stat.seen : 0
          const black = [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12)
          return (
            <span
              key={pitch}
              className={black ? 'heat-key is-black' : 'heat-key'}
              style={{ background: heatColor(rate, stat?.seen ?? 0) }}
              title={stat ? `${noteName(pitch)} 错 ${Math.round(rate * 100)}%` : noteName(pitch)}
            />
          )
        })}
      </div>
      {worst.length > 0 && (
        <p className="device-note">
          容易错的音：
          {worst.map((stat) => `${noteName(stat.pitch)} ${Math.round((stat.errors / stat.seen) * 100)}%`).join(' · ')}
        </p>
      )}
    </div>
  )
}

function heatColor(rate: number, seen: number): string {
  if (seen === 0) return '#2a231c'
  const mix = Math.min(1, rate)
  const red = Math.round(42 + mix * 170)
  const green = Math.round(80 - mix * 40)
  return `rgb(${red}, ${green}, 48)`
}

export function LevelRail({
  count,
  value,
  unlocked,
  stars,
  onChange,
}: {
  count: number
  value: number
  unlocked: number
  stars: (level: number) => 0 | 1 | 2 | 3
  onChange: (level: number) => void
}) {
  return (
    <div className="level-rail" role="listbox" aria-label="级别">
      {Array.from({ length: count }, (_, index) => {
        const level = index + 1
        const open = level <= unlocked
        const mark = '★'.repeat(stars(level)) + '☆'.repeat(3 - stars(level))
        return (
          <button
            key={level}
            type="button"
            role="option"
            aria-selected={value === level}
            disabled={!open}
            className={value === level ? 'level-chip is-selected' : 'level-chip'}
            onClick={() => onChange(level)}
            title={open ? mark : '先通过上一级'}
          >
            <strong>L{level}</strong>
            <span>{open ? mark : '锁定'}</span>
          </button>
        )
      })}
    </div>
  )
}
