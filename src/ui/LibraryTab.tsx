import { lazy, Suspense, useMemo, useState, type Ref } from 'react'
import {
  filterCatalog,
  groupByComposer,
  groupByLevel,
  matchesText,
  needsAttribution,
  pieceTitle,
  rankSearch,
  sortPieces,
  LEVEL_ORDER,
  type CatalogPiece,
  type CatalogGroup,
  type CatalogQuery,
  type CatalogSort,
} from '../score/catalog'
import { composerZh } from '../score/composers'
import type { SavedScore, UserLevel } from '../storage/db'

const ScoreImport = lazy(() => import('./ScoreImport').then((mod) => ({ default: mod.ScoreImport })))

const CATEGORIES: { value: NonNullable<CatalogQuery['category']>; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'graded', label: '古典与民歌' },
  { value: 'popular', label: '流行·影视·游戏' },
  { value: 'method', label: '教材' },
  { value: 'etude', label: '练习曲' },
]

const SORTS: { value: CatalogSort; label: string }[] = [
  { value: 'level', label: '难度' },
  { value: 'length', label: '长度' },
  { value: 'alpha', label: '字母' },
]

const GROUPS: { value: CatalogGroup; label: string }[] = [
  { value: 'composer', label: '作曲家' },
  { value: 'level', label: '程度' },
]

/** 搜索结果一次画这么多张卡片，打一个字母不至于一下子渲染上千张。 */
const RESULT_PAGE = 60

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
  /** 用户手动折叠/展开过的作曲家。没记录的跟随默认（搜索时全展开）。 */
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const category = query.category ?? 'all'
  const sort = query.sort ?? 'level'
  const group = query.group ?? 'composer'
  const shown = useMemo(() => filterCatalog(pieces, query), [pieces, query])
  const shelves = useMemo(() => (group === 'level' ? groupByLevel : groupByComposer)(shown, sort), [group, shown, sort])
  const searching = query.text.trim().length > 0
  // 搜索时不分书架，按相关度排成一列，最像的在最上面。
  const results = useMemo(() => (searching ? rankSearch(sortPieces(shown, sort), query.text) : []), [searching, shown, sort, query.text])
  const savedHits = searching ? saved.filter((score) => matchesText(`${score.title} ${score.tag ?? ''}`, query.text)) : []
  // 换了搜索词就回到第一页。
  const [page, setPage] = useState({ text: '', limit: RESULT_PAGE })
  const limit = page.text === query.text ? page.limit : RESULT_PAGE
  const filtersOn = query.level !== 'all' || query.hands !== 'all' || category !== 'all'
  const hidden = searching && filtersOn ? filterCatalog(pieces, { ...query, level: 'all', hands: 'all', category: 'all' }).length - shown.length : 0

  // 按钮上的数字跟着其他筛选和搜索词走：点下去会剩几首，就显示几首。
  const facets = useMemo(() => {
    const count = (patch: Partial<CatalogQuery>) => filterCatalog(pieces, { ...query, ...patch }).length
    return {
      level: new Map([['all', count({ level: 'all' })], ...LEVEL_ORDER.map((level) => [level, count({ level })] as const)]),
      category: new Map(CATEGORIES.map((item) => [item.value, count({ category: item.value })])),
    }
  }, [pieces, query])

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
        <label className="field search">
          <span>搜索</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="曲名、作曲家或教材，如：巴赫 小步舞曲、op 100、肖邦"
            value={query.text}
            onChange={(event) => onQuery({ ...query, text: event.target.value })}
            onKeyDown={(event) => {
              // 回车直接打开最靠前的结果，Esc 清空。
              if (event.key === 'Enter' && results[0]) onOpen(results[0])
              if (event.key === 'Escape') onQuery({ ...query, text: '' })
            }}
          />
        </label>

        <div className="segmented" role="group" aria-label="程度">
          <button
            type="button"
            aria-pressed={query.level === 'all'}
            onClick={() => onQuery({ ...query, level: 'all' })}
          >
            全部 {facets.level.get('all')}
          </button>
          {LEVEL_ORDER.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={query.level === level}
              onClick={() => onQuery({ ...query, level })}
            >
              {level} {facets.level.get(level)}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="类型">
          {CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={category === item.value}
              onClick={() => onQuery({ ...query, category: item.value })}
            >
              {item.label} {facets.category.get(item.value)}
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

        <div className="segmented" role="group" aria-label="分组">
          <span className="segmented-label">分组</span>
          {GROUPS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={group === item.value}
              onClick={() => onQuery({ ...query, group: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="排序">
          <span className="segmented-label">排序</span>
          {SORTS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={sort === item.value}
              onClick={() => onQuery({ ...query, sort: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索时把结果顶到最上面；正在导入时保留「我的曲谱」，免得导入到一半被收掉。 */}
      {(!searching || importing) && (
      <>
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
                  {LEVEL_ORDER.map((level) => (
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
      </>
      )}

      <section className="library-section">
        <div className="library-shelf-head">
          <h3>{searching ? '搜索结果' : category === 'all' ? '全部曲库' : CATEGORIES.find((item) => item.value === category)?.label}</h3>
          <span className="device-note">
            {searching ? `${shown.length} 首${results[0] ? ' · 回车打开第一首' : ''}` : `${shown.length} 首 · ${shelves.length} ${group === 'level' ? '个程度' : '位作曲家'}`}
            {openingId ? ' · 正在打开…' : ''}
          </span>
          {hidden > 0 && (
            <button type="button" className="button ghost" onClick={() => onQuery({ ...query, level: 'all', hands: 'all', category: 'all' })}>
              筛选条件还挡住了 {hidden} 首，显示全部
            </button>
          )}
          {!searching && <div className="library-shelf-actions">
            <button type="button" className="button ghost" onClick={() => setFolded({})}>
              全部展开
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setFolded(Object.fromEntries(shelves.map((shelf) => [shelf.composer, true])))}
            >
              全部收起
            </button>
          </div>}
        </div>
        {error && <p className="score-status error">{error}</p>}
        {savedHits.length > 0 && (
          <div className="recent" aria-label="我的曲谱里的结果">
            <span className="segmented-label">我的曲谱</span>
            {savedHits.map((score) => (
              <button key={score.id} type="button" onClick={() => onOpenSaved(score.id)}>
                {score.title}
              </button>
            ))}
          </div>
        )}
        {shown.length === 0 ? (
          <p>没有符合的曲子。可以试试作曲家的中文或英文名、曲名里的一个词，或者教材编号。</p>
        ) : searching ? (
          <>
            <ul className="library-grid">
              {results.slice(0, limit).map((piece) => (
                <li key={piece.id}>
                  <PieceCard piece={piece} active={piece.id === activeId} opening={openingId === piece.id} onOpen={onOpen} />
                </li>
              ))}
            </ul>
            {results.length > limit && (
              <button type="button" className="button ghost" onClick={() => setPage({ text: query.text, limit: limit + RESULT_PAGE })}>
                再显示 {Math.min(RESULT_PAGE, results.length - limit)} 首（还有 {results.length - limit} 首）
              </button>
            )}
          </>
        ) : (
          <div className="library-shelves">
            {shelves.map((shelf) => {
              // 默认收起，只看到作曲家列表。
              const open = folded[shelf.composer] ?? false
              const activeHere = shelf.pieces.some((piece) => piece.id === activeId)
              const zh = group === 'composer' ? composerZh(shelf.composer) : ''
              return (
                <section key={shelf.composer} className={open ? 'composer-shelf is-open' : 'composer-shelf'}>
                  <button
                    type="button"
                    className="composer-shelf-head"
                    aria-expanded={open}
                    onClick={() => setFolded((current) => ({ ...current, [shelf.composer]: !open }))}
                  >
                    <span className="composer-shelf-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                    <strong>{zh ? `${zh} · ${shelf.name}` : shelf.name}</strong>
                    <span className="composer-shelf-count">
                      {shelf.pieces.length} 首
                      {activeHere ? ' · 正在练' : ''}
                    </span>
                  </button>
                  {open && (
                    <ul className="library-grid">
                      {shelf.pieces.map((piece) => (
                        <li key={piece.id}>
                          <PieceCard piece={piece} active={piece.id === activeId} opening={openingId === piece.id} onOpen={onOpen} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </section>
      <button type="button" className="button ghost" onClick={onOpenFile}>
        打开乐谱文件
      </button>
    </section>
  )
}

function PieceCard({
  piece,
  active,
  opening,
  onOpen,
}: {
  piece: CatalogPiece
  active: boolean
  opening: boolean
  onOpen: (piece: CatalogPiece) => void
}) {
  const title = pieceTitle(piece)
  const original = piece.title?.trim()
  return (
    <div className={active ? 'library-card is-selected' : 'library-card'}>
      <button type="button" className="library-card-main" disabled={opening} onClick={() => onOpen(piece)}>
        <strong title={title}>{title}</strong>
        <span className="library-card-meta">
          {[
            composerZh(piece.composer) || piece.composer,
            piece.level,
            piece.hands === 'one' ? '单手' : '双手',
            `${piece.measures} 小节`,
          ].join(' · ')}
        </span>
      </button>
      <details className="library-card-more">
        <summary>详情</summary>
        <dl>
          {original && original !== title && (
            <>
              <dt>原名</dt>
              <dd>{original}</dd>
            </>
          )}
          {piece.book && (
            <>
              <dt>教材</dt>
              <dd>{piece.book}{piece.number != null ? ` 第 ${piece.number} 首` : ''}</dd>
            </>
          )}
          <dt>调号</dt>
          <dd>{piece.key || '—'} · {piece.time || '—'}</dd>
          <dt>授权</dt>
          <dd className={needsAttribution(piece) ? 'attribution is-required' : 'attribution'}>
            {needsAttribution(piece) ? `需署名：${piece.attribution}` : piece.attribution}
          </dd>
        </dl>
      </details>
    </div>
  )
}
