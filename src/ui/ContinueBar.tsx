interface ContinueBarProps {
  continuous: boolean
  onContinuous: (value: boolean) => void
  onRetry: () => void
  onNext: () => void
  busy: boolean
  sessionDone: number
  sessionClean: number
  itemId?: string
  hold: number | null
  nextHandLabel?: string
  offer: boolean
  onAccept: () => void
  onStay: () => void
}

export function ContinueBar({
  continuous,
  onContinuous,
  onRetry,
  onNext,
  busy,
  sessionDone,
  sessionClean,
  itemId,
  hold,
  nextHandLabel,
  offer,
  onAccept,
  onStay,
}: ContinueBarProps) {
  return (
    <div className="continue-bar">
      <label className="check">
        <input type="checkbox" checked={continuous} onChange={(event) => onContinuous(event.target.checked)} />
        连续练习
      </label>
      <button type="button" className="button ghost" onClick={onRetry} disabled={busy}>再练一次本题</button>
      <button type="button" className="button ghost" onClick={onNext} disabled={busy}>下一题</button>
      <span className="device-note">
        本次已练 {sessionDone} 题 · 通过 {sessionClean}
        {itemId ? ` · ${itemId}` : ''}
      </span>
      {hold != null && hold > 0 && (
        <span className="result-hold">
          {hold} 秒后下一题{nextHandLabel ? `（${nextHandLabel}）` : ''}
        </span>
      )}
      {offer && (
        <div className="promote-offer" role="status">
          <p>已达成升级条件，要进入下一级吗？</p>
          <button type="button" className="button primary" onClick={onAccept}>进入下一级</button>
          <button type="button" className="button ghost" onClick={onStay}>留在这一级</button>
        </div>
      )}
    </div>
  )
}
