import { type Ref } from 'react'
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
  query: CatalogQuery
  onQuery: (query: CatalogQuery) => void
  onOpen: (piece: CatalogPiece) => void
  onOpenSaved: (id: number) => void
  onOpenFile: () => void
  onCollapse?: () => void
  searchRef?: Ref<HTMLInputElement>
}

export function LibraryTab({
  pieces,
  activeId,
  openingId,
  error,
  recent,
  saved,
  query,
  onQuery,
  onOpen,
  onOpenSaved,
  onOpenFile,
  onCollapse,
  searchRef,
}: LibraryTabProps) {
  const shown = filterCatalog(pieces, query)
  return (
    <section className="library-panel" aria-label="曲库">
      <div className="library-panel-head">
        <h2>曲库</h2>
        {onCollapse && (
          <button type="button" className="button ghost" onClick={onCollapse}>
            收起
          </button>
        )}
      </div>
      <div className="library-filters">
        <div className="segmented" role="group" aria-label="程度">
          <button type="button" aria-pressed={query.level === 'all'} onClick={() => onQuery({ ...query, level: 'all' })}>
            全部
          </button>
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={query.level === level}
              onClick={() => onQuery({ ...query, level })}
            >
              {level} {pieces.filter((piece) => piece.level === level).length}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="声部">
          <button type="button" aria-pressed={query.hands === 'all'} onClick={() => onQuery({ ...query, hands: 'all' })}>
            全部
          </button>
          <button type="button" aria-pressed={query.hands === 'one'} onClick={() => onQuery({ ...query, hands: 'one' })}>
            单手
          </button>
          <button type="button" aria-pressed={query.hands === 'two'} onClick={() => onQuery({ ...query, hands: 'two' })}>
            双手
          </button>
        </div>
        <label className="field search">
          <span>搜索</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="曲名、中文名或作曲家"
            value={query.text}
            onChange={(event) => onQuery({ ...query, text: event.target.value })}
          />
        </label>
      </div>

      <section className="library-section">
        <h3>最近练习</h3>
        {recent.length === 0 ? (
          <p className="device-note">还没有练过的曲子。</p>
        ) : (
          <div className="recent">
            {recent.map((piece) => (
              <button key={piece.id} type="button" onClick={() => onOpen(piece)}>
                {pieceTitle(piece)}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="library-section">
        <h3>我的曲谱</h3>
        {saved.length === 0 ? (
          <p className="device-note">识谱后点「用这首练习」，就会出现在这里。</p>
        ) : (
          <div className="recent">
            {saved.map((score) => (
              <button key={score.id} type="button" onClick={() => onOpenSaved(score.id)}>
                {score.title}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="library-section">
        <h3>全部曲库</h3>
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
      <button type="button" className="button ghost" onClick={onOpenFile}>
        打开乐谱文件
      </button>
    </section>
  )
}
