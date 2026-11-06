import { Link,useLocation } from 'react-router'
import { Bookmark, Check, Play, Star, Info } from 'lucide-react'
import type { Media } from '../domain/media'
import { mediaPath } from '../domain/media'
import { useLibrary } from '../state/library'
import { playbackPath } from '../domain/episodes'
import type { EpisodeSelection } from '../domain/episodes'

export function SafeImage({ src, alt, className = '', loading = 'lazy' }: { src: string; alt: string; className?: string; loading?: 'lazy' | 'eager' }) {
  return <img src={src} alt={alt} className={className} loading={loading} onError={event => { const img = event.currentTarget; if (!img.dataset.fallback) { img.dataset.fallback = 'true'; img.src = '/art/poster-1.svg' } }} />
}
export function MediaCard({ media, rank, episode }: { media: Media; rank?: number; episode?: EpisodeSelection }) {
  const { isFavorite, toggleFavorite } = useLibrary()
  const favorite = isFavorite(media.id)
  const location=useLocation();const navigationState={media,returnTo:location.pathname+location.search}
  return <article className="media-card group"><div className="poster-wrap"><Link state={navigationState} to={playbackPath(media.id, episode)} className="poster-link" aria-label={`Assistir ${media.title}`}><SafeImage src={media.poster} alt={`Cartaz de ${media.title}`} />
    <div className="poster-shade" /><span className="card-view"><Play size={24} fill="currentColor" /></span></Link>
    {rank && <span className="rank-number">{String(rank).padStart(2, '0')}</span>}
    {media.source === 'licensed-demo' ? <span className="poster-badge demo-badge"><Play size={10} fill="currentColor" /> DEMO</span> : media.kind === 'tv' && <span className="poster-badge">SÉRIE</span>}
    <button className={`card-save ${favorite ? 'saved' : ''}`} aria-label={favorite ? `Remover ${media.title} da lista` : `Adicionar ${media.title} à lista`} aria-pressed={favorite} onClick={() => toggleFavorite(media)}>{favorite ? <Check size={17} /> : <Bookmark size={17} />}</button>
    </div><Link state={navigationState} to={playbackPath(media.id, episode)} className="card-title">{media.title}</Link><div className="card-meta"><span>{media.year || 'Em breve'}</span><span className="meta-dot">·</span><span>{media.genres[0] ?? (media.kind === 'tv' ? 'Série' : 'Filme')}</span>{media.rating > 0 && <span className="card-rating"><Star size={11} fill="currentColor" />{media.rating.toFixed(1)}</span>}</div>
    {episode && <p className="card-episode-label">T{episode.seasonNumber} · Episódio {episode.episodeNumber}</p>}
    <Link state={navigationState} to={mediaPath(media)} className="card-details" aria-label={`Ver detalhes de ${media.title}`}><Info size={13} aria-hidden="true" />Detalhes</Link>
  </article>
}
