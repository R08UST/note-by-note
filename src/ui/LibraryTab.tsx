import { lazy, Suspense, useState, type Ref } from 'react'
import { filterCatalog, needsAttribution, pieceTitle, type CatalogPiece, type CatalogQuery } from '../score/catalog'
import type { SavedScore, UserLevel } from '../storage/db'

const ScoreImport = lazy(() => import('./ScoreImport').then((mod) => ({ default: mod.ScoreImport })))

const LEVELS: CatalogPiece['level'][] = ['L1', 'L2', 'L3', 'L4', 'L5']

interface SavedScoreCard {
  id: number
  title: string
  createdAt: number
  level?: UserLevel
  tag?: string
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
  onRenameSaved: (id: number, title: string) => void
  onLevelSaved: (id: number, level: UserLevel) => void
  onTagSaved: (id: number, tag: string) => void
  onDeleteSaved: (id: number) => void
  onRefreshSaved: () => void
  savedScores: SavedScore[]
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
  onRenameSaved,
  onLevelSaved,
  onTagSaved,
  onDeleteSaved,
  onRefreshSaved,
  savedScores,
  onOpenFile,
  onCollapse,
  searchRef,
}: LibraryTabProps) {
  const [importing, setImporting] = useState(false)
  const [dropped, setDropped] = useState<File[]>([])
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
          <button type="button" aria-pressed={(query.category == null || query.category === 'graded') && query.level === 'all'} onClick={() => onQuery({ ...query, category: 'graded', level: 'all' })}>
            全部
          </button>
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={query.category !== 'etude' && query.category !== 'method' && query.level === level}
              onClick={() => onQuery({ ...query, category: query.category === 'method' ? 'method' : 'graded', level })}
            >
              {level} {pieces.filter((piece) => piece.category !== 'etude' && piece.category !== 'method' && piece.level === level).length}
            </button>
          ))}
          <button type="button" aria-pressed={query.category === 'method'} onClick={() => onQuery({ ...query, category: 'method', level: 'all' })}>
            教材 {pieces.filter((piece) => piece.category === 'method').length}
          </button>
          <button type="button" aria-pressed={query.category === 'etude'} onClick={() => onQuery({ ...query, category: 'etude', level: 'all' })}>
            练习曲 {pieces.filter((piece) => piece.category === 'etude').length}
          </button>
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

      <section
        className="library-section"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          setDropped([...event.dataTransfer.files])
          setImporting(true)
        }}
      >
        <h3>我的曲谱</h3>
        <p className="device-note">只存在这台浏览器里，不会上传。可以拖入 MusicXML、MIDI、PDF 或图片。</p>
        <button type="button" className="button ghost" onClick={() => setImporting((value) => !value)}>
          {importing ? '收起导入' : '导入曲谱'}
        </button>
        {importing && (
          <Suspense fallback={<p className="device-note">正在打开导入…</p>}>
            <ScoreImport
              key={dropped.map((file) => `${file.name}:${file.size}`).join('|') || 'import'}
              scores={savedScores}
              initialFiles={dropped}
              onSaved={onRefreshSaved}
              onClose={() => setImporting(false)}
            />
          </Suspense>
        )}
        {saved.length === 0 ? (
          <p className="device-note">还没有自己的曲子。导入后会出现在这里，练习功能和曲库里的曲子一样。</p>
        ) : (
          <ul className="saved-list">
            {saved.map((score) => (
              <li key={score.id}>
                <button type="button" className="button ghost" onClick={() => onOpenSaved(score.id)}>
                  练习
                </button>
                <input
                  aria-label="曲名"
                  value={score.title}
                  onChange={(event) => onRenameSaved(score.id, event.target.value)}
                />
                <select aria-label="程度" value={score.level ?? ''} onChange={(event) => onLevelSaved(score.id, event.target.value as UserLevel)}>
                  <option value="">程度</option>
                  {(['L1', 'L2', 'L3', 'L4', 'L5'] as const).map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
                <input
                  aria-label="标签"
                  placeholder="标签"
                  value={score.tag ?? ''}
                  onChange={(event) => onTagSaved(score.id, event.target.value)}
                />
                <button type="button" className="button stop" onClick={() => onDeleteSaved(score.id)}>删除</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="library-section">
        <h3>{query.category === 'method' ? '教材' : query.category === 'etude' ? '练习曲' : '全部曲库'}</h3>
        <p className="device-note">
          {shown.length} 首
          {openingId ? ' · 正在打开…' : ''}
        </p>
        {error && <p className="score-status error">{error}</p>}
        {shown.length === 0 ? (
          <p>没有符合的曲子。</p>
        ) : (
          groupByBook(shown).map((group) => (
            <div key={group.name}>
              {group.name && <h3>{group.name}</h3>}
              <ul className="library-grid">
                {group.pieces.map((piece) => (
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
            </div>
          ))
        )}
      </section>
      <button type="button" className="button ghost" onClick={onOpenFile}>
        打开乐谱文件
      </button>
    </section>
  )
}

function groupByBook(pieces: CatalogPiece[]): { name: string; pieces: CatalogPiece[] }[] {
  if (!pieces.some((piece) => piece.book)) return [{ name: '', pieces }]
  const order: string[] = []
  const groups = new Map<string, CatalogPiece[]>()
  for (const piece of pieces) {
    const name = piece.book || '其他'
    if (!groups.has(name)) {
      groups.set(name, [])
      order.push(name)
    }
    groups.get(name)!.push(piece)
  }
  return order.map((name) => ({
    name,
    pieces: (groups.get(name) ?? []).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || a.id.localeCompare(b.id)),
  }))
}
