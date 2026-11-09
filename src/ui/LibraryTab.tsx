import { useState } from 'react'
import { filterCatalog, needsAttribution, pieceTitle, type CatalogPiece, type CatalogQuery } from '../score/catalog'

const LEVELS: CatalogPiece['level'][] = ['L1', 'L2', 'L3', 'L4', 'L5']

interface SavedScoreCard {
  id: number
  title: string
  createdAt: number
}

interface LibraryTabProps {
  pieces: CatalogPiece[]
  activeId: string
  openingId: string | null
  error: string | null
  recent: CatalogPiece[]
  saved: SavedScoreCard[]
  onOpen: (piece: CatalogPiece) => void
  onOpenSaved: (id: number) => void
}

export function LibraryTab({
  pieces,
  activeId,
  openingId,
  error,
  recent,
  saved,
  onOpen,
  onOpenSaved,
}: LibraryTabProps) {
  const [query, setQuery] = useState<CatalogQuery>({ level: 'all', hands: 'all', text: '' })
  const shown = filterCatalog(pieces, query)
  return (
    <section className="panel library">
      <h2>曲库</h2>
      <p className="lede">按程度选一首，点开就进入练习。反复记号不会展开，倚音不计入判定。</p>
      {saved.length > 0 && (
        <div className="recent">
          <span>我保存的识谱</span>
          {saved.map((score) => (
            <button key={score.id} type="button" onClick={() => onOpenSaved(score.id)}>
              {score.title}
            </button>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div className="recent">
          <span>最近练过</span>
          {recent.map((piece) => (
            <button key={piece.id} type="button" onClick={() => onOpen(piece)}>
              {pieceTitle(piece)}
            </button>
          ))}
        </div>
      )}
      <div className="library-filters">
        <div className="segmented" role="group" aria-label="程度">
          <button type="button" aria-pressed={query.level === 'all'} onClick={() => setQuery({ ...query, level: 'all' })}>
            全部
          </button>
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={query.level === level}
              onClick={() => setQuery({ ...query, level })}
            >
              {level} {pieces.filter((piece) => piece.level === level).length}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="声部">
          <button type="button" aria-pressed={query.hands === 'all'} onClick={() => setQuery({ ...query, hands: 'all' })}>
            全部
          </button>
          <button type="button" aria-pressed={query.hands === 'one'} onClick={() => setQuery({ ...query, hands: 'one' })}>
            单手
          </button>
          <button type="button" aria-pressed={query.hands === 'two'} onClick={() => setQuery({ ...query, hands: 'two' })}>
            双手
          </button>
        </div>
        <label className="field search">
          <span>搜索</span>
          <input
            type="search"
            placeholder="曲名、中文名或作曲家"
            value={query.text}
            onChange={(event) => setQuery({ ...query, text: event.target.value })}
          />
        </label>
      </div>
      <p className="device-note">
        {shown.length} 首
        {openingId ? ' · 正在打开…' : ''}
      </p>
      {error && <p className="score-status error">{error}</p>}
      {shown.length === 0 ? (
        <p>没有符合的曲子。</p>
      ) : (
        <ul className="library-grid">
          {shown.map((piece) => (
            <li key={piece.id}>
              <button
                type="button"
                className={piece.id === activeId ? 'library-card is-selected' : 'library-card'}
                disabled={openingId === piece.id}
                onClick={() => onOpen(piece)}
              >
                <strong>{pieceTitle(piece)}</strong>
                {piece.title_zh && <em>{piece.title}</em>}
                <span>
                  {piece.composer} · {piece.level} · {piece.hands === 'one' ? '单手' : '双手'} · {piece.measures} 小节
                </span>
                <span>
                  {piece.key || '—'} · {piece.time || '—'} · {piece.license}
                </span>
                <span className={needsAttribution(piece) ? 'attribution is-required' : 'attribution'}>
                  {needsAttribution(piece) ? `署名：${piece.attribution}` : piece.attribution}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
