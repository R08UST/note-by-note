import { bankNumber } from './useQuestionBank'
import type { BankItem } from '../train/bank'

interface BankBarProps {
  items: readonly BankItem[]
  currentId?: string
  marks: Readonly<Record<string, 'done' | 'clean'>>
  open: boolean
  onToggle: () => void
  onPick: (id: string) => void
}

export function BankBar({ items, currentId, marks, open, onToggle, onPick }: BankBarProps) {
  const done = items.filter((item) => marks[item.id]).length
  const clean = items.filter((item) => marks[item.id] === 'clean').length
  return (
    <div className="bank-browser">
      <div className="omr-actions">
        <button type="button" className="button ghost" aria-expanded={open} onClick={onToggle}>
          {open ? '收起题库' : '题库'}
        </button>
        <span className="device-note">
          {items.length} 题 · 已练 {done} · 通过 {clean}
        </span>
      </div>
      {open && (
        <div className="bank-grid" role="list" aria-label="题号">
          {items.map((item) => {
            const mark = marks[item.id]
            const current = item.id === currentId
            return (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`bank-chip${current ? ' is-current' : ''}${mark === 'clean' ? ' is-clean' : ''}`}
                aria-current={current ? 'true' : undefined}
                onClick={() => onPick(item.id)}
              >
                {bankNumber(item.id)}
                <small>{mark === 'clean' ? '通过' : mark === 'done' ? '已练' : '未练'}</small>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
