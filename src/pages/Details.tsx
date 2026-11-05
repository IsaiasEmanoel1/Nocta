import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Bookmark, Check, Clock3, Play, Star, ChevronDown } from 'lucide-react'
import { catalog } from '../services/catalog'
import { availabilityMessage, availabilityService } from '../services/availability'
import { useAsync } from '../hooks/useAsync'
import { useLibrary } from '../state/library'
import { BackLink } from '../components/Layout'
import { SafeImage } from '../components/MediaCard'
import { EmptyState, Loading, Notice } from '../components/Feedback'
import type { Media } from '../domain/media'

function Episodes({ media }: { media: Media }) {
  const [season, setSeason] = useState(media.seasons?.[0]?.number ?? 1)
  const { data, loading } = useAsync(signal => catalog.episodes(media, season, signal), [media.id, season])
  return <section className="episodes-section"><div className="section-heading"><h2>Episódios<span className="heading-dot">.</span></h2><div className="season-select"><select aria-label="Selecionar temporada" value={season} onChange={e => setSeason(Number(e.target.value))}>{media.seasons?.map(s => <option key={s.id} value={s.number}>{s.name} · {s.episodeCount} episódios</option>)}</select><ChevronDown size={15} /></div></div><Notice>{data?.notice}</Notice>{loading ? <Loading /> : data?.data.length ? <div className="episode-list">{data.data.map(e => <article className="episode" key={e.id}><div className="episode-image"><SafeImage src={e.image ?? media.backdrop} alt={`Cena ilustrativa de ${e.name}`} /><span>{String(e.number).padStart(2, '0')}</span></div><div className="episode-copy"><div><h3>{e.number}. {e.name}</h3><span>{e.runtime ? `${e.runtime} min` : 'Duração não informada'}</span></div><p>{e.overview}</p><EpisodeAvailability id={media.id} season={season} number={e.number} /></div></article>)}</div> : <p className="muted">Nenhum episódio disponível nesta temporada.</p>}</section>
}
function EpisodeAvailability({ id, season, number }: { id: string; season: number; number: number }) {
  const { data, loading } = useAsync(signal => availabilityService.check({ mediaId: id, episode: { seasonNumber: season, episodeNumber: number } }, { signal }), [id, season, number])
  return <span className="episode-unavailable"><Link className="button button-secondary" to={`/assistir/${id}?${new URLSearchParams({temporada:String(season),episodio:String(number)})}`}><Play size={16}/>Assistir episódio</Link>{availabilityMessage(loading ? 'checking' : data?.status ?? 'unknown')}</span>
}
export function Details() {
  const { id = '' } = useParams()
  const { data, loading, error } = useAsync(signal => catalog.detail(id, signal), [id])
  const [retry, setRetry] = useState(0)
  const { data: availability, loading: checking } = useAsync(signal => availabilityService.check({ mediaId: id }, { signal, force: retry > 0 }), [id, retry])
  const confirmed = /^tmdb-(movie|tv)-[1-9]\d*$/.test(id) || (!checking && availability?.status === 'available' && (availability.expiresAt ?? 0) > Date.now())
  useEffect(() => {
    if (!availability?.expiresAt) return
    const timer = setTimeout(() => setRetry(value => value + 1), Math.max(0, availability.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [availability])
  const { isFavorite, toggleFavorite } = useLibrary()
  const media = data?.data
  useEffect(() => { if (media) document.title = `${media.title} · NOCTA` }, [media])
  if (loading) return <Loading />
  if (!media) return <div className="page-shell"><Notice>{data?.notice || error}</Notice><EmptyState title="Não encontramos essa história" description="O título pode ter mudado ou estar temporariamente indisponível." /></div>
  return <><div className="details-backdrop" style={{ backgroundImage: `url("${media.backdrop}")` }} /><div className="page-shell details-page"><BackLink /><div className="detail-main"><div className="detail-poster"><SafeImage src={media.poster} alt={`Cartaz de ${media.title}`} loading="eager" /></div><div className="detail-copy"><p className="eyebrow">{media.kind === 'tv' ? 'SÉRIE' : 'FILME'} <span> / </span> {media.source === 'licensed-demo' ? 'CINEMA ABERTO' : media.source === 'tmdb' ? 'CATÁLOGO TMDB' : 'HISTÓRIA FICTÍCIA'}</p><h1>{media.title}</h1><div className="detail-actions">{confirmed && <Link className="button button-primary detail-play" to={`/assistir/${media.id}`}><Play size={17} fill="currentColor" />Assistir Agora</Link>}<button className="button button-glass" onClick={() => toggleFavorite(media)} aria-pressed={isFavorite(media.id)}>{isFavorite(media.id) ? <Check size={18} /> : <Bookmark size={18} />}{isFavorite(media.id) ? 'Na minha lista' : 'Adicionar à lista'}</button></div>{media.tagline && <p className="detail-tagline">{media.tagline}</p>}<div className="hero-meta">{media.rating > 0 && <span className="rating-pill"><Star size={13} fill="currentColor" />{media.rating.toFixed(1)}</span>}<span>{media.year || 'Ano não informado'}</span>{media.runtime && <span className="inline-flex items-center gap-1.5"><Clock3 size={14} />{media.runtime} min</span>}<span>{media.kind === 'tv' ? `${media.seasons?.length ?? 0} temporadas` : 'Longa / curta-metragem'}</span></div><div className="detail-genres">{media.genres.map(g => <Link to={`/buscar?genero=${encodeURIComponent(g)}`} key={g}>{g}</Link>)}</div><h2 className="small-heading">A história</h2><p className="detail-overview">{media.overview}</p><div className="availability-note" role="status"><span className="tiny-status" />{availabilityMessage(checking ? 'checking' : availability?.status ?? 'unknown')}<button className="text-link" disabled={checking} onClick={() => setRetry(value => value + 1)}>Verificar novamente</button></div><Link className="text-link" to={`/buscar?${new URLSearchParams({ tipo: media.kind, ...(media.genres[0] ? { genero: media.genres[0] } : {}) })}`}>Explorar títulos do mesmo gênero</Link></div></div>
    {!!media.cast.length && <section className="cast-section"><div className="section-heading"><h2>Quem faz a história<span className="heading-dot">.</span></h2><span className="muted">{media.source === 'fiction' ? 'Elenco fictício' : 'Elenco principal'}</span></div><div className="cast-list">{media.cast.map((p, i) => <article key={`${p.name}-${i}`} className="cast-person">{p.photo ? <SafeImage src={p.photo} alt={p.name} /> : <div className={`cast-avatar cast-color-${i % 4}`}>{p.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</div>}<h3>{p.name}</h3><p>{p.character ?? 'Elenco'}</p></article>)}</div></section>}
    {media.kind === 'tv' && !!media.seasons?.length && <Episodes key={media.id} media={media} />}
  </div></>
}
