import type { TrainMode, TrainRunRecord } from '../storage/db'

const LABELS: Record<TrainMode, string> = {
  'sight-flash': '认谱',
  'sight-phrase': '短句视奏',
  rhythm: '节奏',
  'rhythm-hands': '双手节奏',
  pulse: '跟拍',
  'rhythm-piece': '曲目节奏',
}

export function TrainHistory({ runs }: { runs: TrainRunRecord[] }) {
  if (runs.length === 0) return <p>训练成绩会出现在这里。认谱、短句、节奏和跟拍分开画。</p>
  const modes = [...new Set(runs.map((run) => run.mode))]
  return (
    <div className="train-history">
      {modes.map((mode) => {
        const rows = runs.filter((run) => run.mode === mode)
        return (
          <section key={mode}>
            <h3>{LABELS[mode]}</h3>
            <DayChart rows={rows} />
          </section>
        )
      })}
    </div>
  )
}

function DayChart({ rows }: { rows: TrainRunRecord[] }) {
  const days = lastDays(14)
  const points = days.map((day) => {
    const found = rows.filter((run) => dayKey(run.createdAt) === day)
    if (found.length === 0) return null
    const accuracy = found.reduce((sum, run) => sum + run.pitchAccuracy, 0) / found.length
    const timed = found.filter((run) => run.meanOffsetMs != null)
    const offset = timed.length === 0 ? null : timed.reduce((sum, run) => sum + (run.meanOffsetMs ?? 0), 0) / timed.length
    return { day, accuracy, offset }
  })
  return (
    <div className="day-chart">
      <svg viewBox="0 0 280 72" role="img" aria-label="准确率">
        <polyline fill="none" stroke="#e39b3b" strokeWidth="2" points={line(points.map((point) => point?.accuracy ?? null))} />
        <polyline fill="none" stroke="#8ddebe" strokeWidth="2" points={line(points.map((point) => (point?.offset == null ? null : clamp(0.5 - point.offset / 400, 0, 1))))} />
      </svg>
      <p className="device-note">黄线是打中的比例，绿线是时机靠近正中的程度。最近 14 天。</p>
    </div>
  )
}

function line(values: (number | null)[]): string {
  return values
    .map((value, index) => {
      if (value == null) return ''
      const x = (index / Math.max(1, values.length - 1)) * 276 + 2
      const y = 68 - value * 60
      return `${x},${y}`
    })
    .filter(Boolean)
    .join(' ')
}

function lastDays(count: number): string[] {
  const days: string[] = []
  const today = new Date()
  for (let ago = count - 1; ago >= 0; ago -= 1) {
    const day = new Date(today)
    day.setDate(today.getDate() - ago)
    days.push(dayKey(day.getTime()))
  }
  return days
}

function dayKey(time: number): string {
  const day = new Date(time)
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
