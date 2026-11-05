import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react'
import { browseSelection } from '../domain/browse'
import { catalogRailSpecs, movieGenres, tvGenres } from '../config/catalogRails'
import { catalog } from '../services/catalog'
import { useSearchFeed } from '../hooks/useSearchFeed'
import { MediaCard } from '../components/MediaCard'
import { isPublicMedia, useMediaAvailability } from '../services/mediaAvailability'
import { EmptyState, Loading, Notice } from '../components/Feedback'

export function Search() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { query, kind, genre, year, yearFrom, yearTo, country, sort, base } = browseSelection(params)
  const [input, setInput] = useState(query)
  const genreNames = Array.from(new Set(Object.values(kind === 'tv' ? tvGenres : kind === 'movie' ? movieGenres : { ...movieGenres, ...tvGenres })))
  useEffect(() => setInput(query), [query])
  useEffect(() => {
    if (input === query) return
    const timer = setTimeout(() => { setParams(previous => { const next = new URLSearchParams(previous); input.trim() ? next.set('q', input) : next.delete('q'); next.delete('colecao'); next.delete('pagina'); return next }, { replace: true }) }, 350)
    return () => clearTimeout(timer)
  }, [input, query, setParams])
  const feed = useSearchFeed(catalog, params)
  const loading = feed.loading
  const unavailable = useMediaAvailability()
  const results = feed.items.filter(media => isPublicMedia(media) && !unavailable(media.id))
  function update(key: string, value: string) {
    setParams(old => {
      const next = new URLSearchParams(old)
      value || key === 'genero' ? next.set(key, value) : next.delete(key)
      if (key !== 'pagina') next.delete('pagina')
      if (key === 'q') next.delete('colecao')
      if (key === 'genero' && ['anime', 'novelas'].includes(next.get('colecao') ?? '')) next.delete('colecao')
      if (key === 'origem' && base?.id === 'anime') { next.delete('colecao'); next.set('tipo', 'tv'); next.set('genero', genre) }
      if (key === 'tipo' && base?.source !== 'trending') { next.delete('colecao'); next.delete('genero') }
      return next
    }, { replace: true })
  }
  return <div className="page-shell search-page"><button className="back-link" onClick={() => (window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/', { replace: true })}>Voltar</button><p className="eyebrow">SIGA A SUA CURIOSIDADE</p><h1>Qual é a sua próxima história<span className="heading-dot">?</span></h1><p className="page-subtitle">{base ? `Coleção: ${base.title}` : 'Um título, um gênero ou uma nova descoberta.'}</p><form className="search-box" role="search" onSubmit={e => { e.preventDefault(); update('q', input.trim()) }}><SearchIcon size={24} /><input aria-label="Buscar filmes e séries" placeholder="Buscar filmes, séries e novas histórias" value={input} onChange={e => setInput(e.target.value)} /><button type="button" className="icon-button" aria-label="Limpar busca" onClick={() => { setInput(''); update('q', '') }}><X size={18} /></button></form>
    <div className="filters"><select aria-label="Coleção" value={base?.id ?? ''} onChange={event => { const spec = catalogRailSpecs(kind).find(item => item.id === event.target.value); const next = new URLSearchParams(); if (spec) next.set('colecao', spec.id); if (kind) next.set('tipo', kind); setParams(next, { replace: true }) }}><option value="">Todas as coleções</option>{catalogRailSpecs(kind).map(spec => <option value={spec.id} key={spec.id}>{spec.title}</option>)}</select><span className="filter-caption"><SlidersHorizontal size={16} /> Refinar</span><select aria-label="Tipo de conteúdo" value={kind ?? ''} onChange={e => update('tipo', e.target.value)}><option value="">Filmes e séries</option><option value="movie">Filmes</option><option value="tv">Séries</option></select><select aria-label="Gênero" value={genre} onChange={e => update('genero', e.target.value)}><option value="">Todos os gêneros</option>{genre && !genreNames.includes(genre) && <option value={genre}>{genre.split('|').join(' ou ')}</option>}{genreNames.map(g => <option key={g}>{g}</option>)}</select><label>Ano<input className="year-filter" aria-label="Ano" type="number" inputMode="numeric" min="1000" max="9999" value={year ?? ''} placeholder="Qualquer ano" onChange={event => update('ano', event.target.value)} /></label><label>De<input className="year-filter" aria-label="Ano inicial" type="number" min="1000" max="9999" inputMode="numeric" value={yearFrom ?? ''} onChange={event => update('de', event.target.value)} /></label><label>Até<input className="year-filter" aria-label="Ano final" type="number" min="1000" max="9999" inputMode="numeric" value={yearTo ?? ''} onChange={event => update('ate', event.target.value)} /></label><label>Origem<input aria-label="País de origem" maxLength={2} autoCapitalize="characters" value={country} placeholder="BR, JP…" onChange={event => update('origem', event.target.value.toUpperCase())} /></label><select aria-label="Ordenar resultados" value={sort} onChange={e => update('ordem', e.target.value)}><option value="popular">{query ? 'Relevância' : 'Popularidade'}</option><option disabled={Boolean(query)} value="rating">Melhor avaliação</option><option disabled={Boolean(query)} value="recent">Mais recentes</option></select>{(kind || genre || year || yearFrom || yearTo || country || base) && <button className="clear-filters" onClick={() => setParams(query ? { q: query } : {})}>Limpar filtros</button>}</div>
    <Notice>{feed.notice}</Notice>
    <div className="results-heading"><h2>{query ? `Resultados para “${query}”` : 'Explorar catálogo'}</h2><span>{results.length} carregados{feed.page?.totalResults != null ? ` · ${feed.page.totalResults} no TMDB` : ''}</span></div>
    {results.length > 0 && <div className="media-grid">{results.map(media => <MediaCard key={media.id} media={media} />)}</div>}
    {loading && <Loading />}
    {feed.error && <div className="notice" role="alert">{feed.error}<button className="button button-secondary" disabled={loading} onClick={feed.retry}>Tentar novamente</button></div>}
    {!loading && !feed.error && !results.length && <EmptyState search title="Essa história ainda não apareceu" description={feed.page?.hasMore ? 'Nenhuma correspondência neste lote. Toque em Ver mais para continuar a pesquisa.' : 'Tente outro título ou remova um filtro para ampliar a busca.'} />}
    {!feed.error && feed.page?.hasMore && <div className="search-pagination"><button className="button button-primary" disabled={loading} onClick={feed.more}>{loading ? 'Carregando…' : 'Ver mais'}</button></div>}
    <p className="search-footnote">Resultados do TMDB; disponibilidade de reprodução é independente. {feed.page?.totalPages == null && 'Total filtrado não confirmado.'}</p>
  </div>
}
