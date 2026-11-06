import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useLocation, useNavigationType } from 'react-router'
import { Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react'
import { browseSelection } from '../domain/browse'
import { movieGenres, tvGenres } from '../config/catalogRails'
import { catalog } from '../services/catalog'
import { useSearchFeed } from '../hooks/useSearchFeed'
import { MediaCard } from '../components/MediaCard'
import {ThemedSelect} from '../components/ThemedSelect'
import {SEARCH_FOCUS_EVENT} from '../components/searchFocus'
import { isPublicMedia, useMediaAvailability } from '../services/mediaAvailability'
import { EmptyState, Loading, Notice } from '../components/Feedback'

export function Search() {
  const [params, setParams] = useSearchParams()
  const location=useLocation(),navigation=useNavigationType()
  const searchInput=useRef<HTMLInputElement>(null)
  const [filtersOpen,setFiltersOpen]=useState(()=>{try{return sessionStorage.getItem('nocta.search.filters-open')==='true'}catch{return false}})
  useEffect(()=>{try{sessionStorage.setItem('nocta.search.filters-open',String(filtersOpen))}catch{}},[filtersOpen])
  useEffect(()=>{const focus=()=>searchInput.current?.focus();let frame:number|undefined;if(location.state?.focusSearch&&navigation!=='POP')frame=requestAnimationFrame(focus);window.addEventListener(SEARCH_FOCUS_EVENT,focus);return()=>{if(frame)cancelAnimationFrame(frame);window.removeEventListener(SEARCH_FOCUS_EVENT,focus)}},[])
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
  return <div className="page-shell search-page search-compact"><h1 className="sr-only">Buscar</h1>
    <div className="search-first-row"><form className="search-box" role="search" onSubmit={event=>{event.preventDefault();update('q',input.trim());searchInput.current?.blur()}}><SearchIcon size={22}/><input ref={searchInput} type="search" enterKeyHint="search" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="Buscar filmes e séries" placeholder="Buscar filmes e séries" value={input} onChange={event=>setInput(event.target.value)}/>{input&&<button type="button" className="icon-button" aria-label="Limpar busca" onClick={()=>{setInput('');update('q','')}}><X size={18}/></button>}</form><button type="button" className="search-filter-toggle" aria-label="Filtros" title="Filtros" aria-expanded={filtersOpen} aria-controls="search-essential-filters" onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={22}/></button></div>
    {filtersOpen&&<section id="search-essential-filters" className="search-filter-panel" aria-label="Filtros de busca" onKeyDown={event=>{if(event.key==='Escape')setFiltersOpen(false)}}>
      <label>Tipo<ThemedSelect aria-label="Tipo de conteúdo" value={kind??''} onChange={event=>update('tipo',event.target.value)}><option value="">Todos</option><option value="movie">Filmes</option><option value="tv">Séries</option></ThemedSelect></label>
      <label>Gênero<ThemedSelect aria-label="Gênero" value={genre} onChange={event=>update('genero',event.target.value)}><option value="">Todos os gêneros</option>{genre&&!genreNames.includes(genre)&&<option value={genre}>{genre.split('|').join(' ou ')}</option>}{genreNames.map(name=><option key={name}>{name}</option>)}</ThemedSelect></label>
      {!query&&<label>Ordenação<ThemedSelect aria-label="Ordenar resultados" value={sort} onChange={event=>update('ordem',event.target.value)}><option value="popular">Padrão</option><option value="rating">Melhor avaliação</option><option value="recent">Mais recentes</option></ThemedSelect></label>}
      {base&&<p className="active-collection">{base.title}</p>}
      {(kind||genre||year||yearFrom||yearTo||country||base)&&<button className="clear-filters" onClick={()=>setParams(query?{q:query}:{},{replace:true})}>Limpar filtros</button>}
    </section>}
    <Notice>{feed.notice}</Notice>
    <div className="results-heading"><h2>Explorar catálogo</h2><span>{results.length} carregados{feed.page?.totalResults != null ? ` · ${feed.page.totalResults} no TMDB` : ''}</span></div>
    {results.length > 0 && <div className="media-grid">{results.map(media => <MediaCard key={media.id} media={media} />)}</div>}
    {loading && <Loading />}
    {feed.error && <div className="notice" role="alert">{feed.error}<button className="button button-secondary" disabled={loading} onClick={feed.retry}>Tentar novamente</button></div>}
    {!loading && !feed.error && !results.length && <EmptyState search title="Essa história ainda não apareceu" description={feed.page?.hasMore ? 'Nenhuma correspondência neste lote. Toque em Ver mais para continuar a pesquisa.' : 'Tente outro título ou remova um filtro para ampliar a busca.'} />}
    {!feed.error && feed.page?.hasMore && <div className="search-pagination"><button className="button button-primary" disabled={loading} onClick={feed.more}>{loading ? 'Carregando…' : 'Ver mais'}</button></div>}
  </div>
}
