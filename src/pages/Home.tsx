import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Radio } from 'lucide-react'
import type { CatalogProvider, Media, MediaKind } from '../domain/media'
import { useRailFeed } from '../hooks/useRailFeed'
import { RailSkeleton } from '../components/RailSkeleton'
import { catalogRailSpecs } from '../config/catalogRails'
import { catalog } from '../services/catalog'
import { useAsync } from '../hooks/useAsync'
import { ContinueWatching, continueWatchingItems } from '../components/ContinueWatching'
import { Hero } from '../components/Hero'
import { Carousel } from '../components/Carousel'
import { Loading, Notice } from '../components/Feedback'
import { isPublicMedia, useMediaAvailability } from '../services/mediaAvailability'

import { useLibrary } from '../state/library'
import { rankRecommendations, recommendationInterests, recommendationRails } from '../domain/recommendations'

export { ContinueWatching } from '../components/ContinueWatching'

export function Home({ kind, provider = catalog }: { kind?: MediaKind; provider?: CatalogProvider }) {
  const { data, loading, error } = useAsync(signal => provider.home(kind, signal), [kind, provider])
  const feed = useRailFeed(provider, kind)
  const sentinel = useRef<HTMLDivElement>(null)
  const pending = feed.pending
  useEffect(() => {
    const node = sentinel.current
    if (!node || !feed.remaining || pending || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); feed.more() } }, { rootMargin: '500px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [feed.remaining, pending, kind, provider])
  const { state: library } = useLibrary()
  const interests = recommendationInterests(library, kind)
  const specs = recommendationRails(interests)
  const {data: suggestions} = useAsync(async signal => {
    if (!provider.rail || !specs.length) return []
    const results = await Promise.allSettled(specs.map(spec => provider.rail!(spec, signal)))
    const lists = results.map(result => result.status === 'fulfilled' ? result.value.data.items : [])
    return lists.flat()
  }, [provider, specs.map(spec => spec.id).join('|')])
  const unavailable = useMediaAvailability()
  const featuredSpec = catalogRailSpecs(kind)[0]
  const visible = (media: Media) => isPublicMedia(media) && (!kind || media.kind === kind) && !unavailable(media.id)
  const items = (data?.data ?? []).filter(visible)
  const rails = feed.entries.flatMap(entry => entry.rail?.items.length ? [{ ...entry.rail, items: entry.rail.items.filter(visible) }] : [])
  const hero = items[0] ?? rails[0]?.items[0]
  const used = new Set(continueWatchingItems(library, kind).map(entry => entry.media.id))
  const unique = (candidates: Media[]) => {
    const result: Media[] = []
    for (const media of candidates) {
      if (result.length === 12) break
      if (!visible(media) || used.has(media.id)) continue
      used.add(media.id); result.push(media)
    }
    return result
  }
  const featured = unique(items)
  const arrangedRails = feed.entries.map(entry => ({ entry, items: unique(entry.rail?.items ?? []) }))
  const historyIds = new Set(Object.values(library.progress).map(entry => entry.media.id))
  const general = [...items, ...rails.filter(rail => rail.id === 'weekly' || rail.id.endsWith('-popular')).flatMap(rail => rail.items)]
  const recommended = unique(rankRecommendations(suggestions ?? [], general, interests, new Set([...historyIds, ...used])))
  const genres = ['Todos', 'Ação', 'Drama', 'Animação', 'Suspense', 'Terror', 'Ficção científica']
  return <>
    {hero && <Hero media={hero} />}
    <div className={hero ? 'home-content' : 'page-shell home-content home-empty'}>
      <div className="discovery-bar"><div className="genre-pills" aria-label="Explorar gêneros">{genres.map((genre, index) => <Link className={`genre-pill ${!index ? 'selected' : ''}`} key={genre} to={`/buscar?${new URLSearchParams({ ...(kind ? { tipo: kind } : {}), ...(index ? { genero: genre } : {}) })}`}>{genre}</Link>)}</div><span className="curation-label"><Radio size={14} /> SUA SESSÃO COMEÇA AQUI</span></div>
      <ContinueWatching kind={kind} />
      {loading && !hero ? <Loading /> : <>
        <Notice>{error || data?.notice}</Notice>
        <Notice>{feed.notice}</Notice>
        {!hero && !feed.pending && <Notice>O catálogo está temporariamente indisponível. Tente novamente mais tarde.</Notice>}<>

          <Carousel title={featuredSpec.title} eyebrow="TENDÊNCIAS DO DIA" items={featured} browse={featuredSpec.browse} ranked link={`/buscar${kind ? `?tipo=${kind}` : ''}`} />
          {recommended.length>0&&<Carousel title="Recomendado para você" items={recommended} link={`/buscar${kind ? `?tipo=${kind}` : ''}`} />}
          {arrangedRails.map(({entry,items:arranged}) => {
              if (entry.status === 'loading') return <RailSkeleton key={entry.spec.id} title={entry.spec.title} />
              if (entry.status === 'error') return <div className="rail-error" key={entry.spec.id} role="status"><span>{entry.spec.title}: {entry.notice}</span><button onClick={() => feed.retry(entry.spec.id)}>Tentar novamente</button></div>
              if (!arranged.length) return null
              return <div key={entry.spec.id}><Notice>{entry.notice}</Notice><Carousel title={entry.spec.title} items={arranged} browse={entry.rail?.browse} /></div>
            })}
        </>
      </>}
      <div ref={sentinel} className="rail-load-more">{feed.remaining > 0 && <button className="button button-secondary" disabled={pending} onClick={feed.more}>{pending ? 'Carregando seleção…' : 'Descobrir mais categorias'}</button>}</div>
    </div>
  </>
}
