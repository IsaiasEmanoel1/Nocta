import { Link } from 'react-router'
import { ArrowUpRight, Play } from 'lucide-react'
import type { MediaKind } from '../domain/media'
import type { LibraryState } from '../state/library'
import { isTimedProgress, resumable, useLibrary } from '../state/library'
import { SafeImage } from './MediaCard'
import { playbackPath, progressKey } from '../domain/episodes'

export function continueWatchingItems(state: LibraryState, kind?: MediaKind) {
  const seen = new Set<string>()
  return Object.values(state.progress).filter(item => item.media.source === 'tmdb' && (!kind || item.media.kind === kind))
    .sort((a, b) => b.updatedAt - a.updatedAt).filter(item => {
      if (seen.has(item.media.id)) return false
      seen.add(item.media.id); return true
    }).filter(resumable)
}

export function ContinueWatching({ kind }: { kind?: MediaKind }) {
  const { state } = useLibrary()
  const items = continueWatchingItems(state, kind)
  if (!items.length) return null
  return <section className="catalog-section continue-section" aria-label="Continue assistindo">
    <div className="section-heading"><h2>Continuar assistindo<span className="heading-dot">.</span></h2><Link to="/minha-lista?aba=history" className="see-all">Seu histórico <ArrowUpRight size={14} /></Link></div>
    <div className="carousel">{items.map(item => <article key={progressKey(item.media.id, item.episode)} className="media-card continue-card">
      <Link to={playbackPath(item.media.id, item.episode)} aria-label={`Continuar ${item.media.title}${item.episode ? `, temporada ${item.episode.seasonNumber}, episódio ${item.episode.episodeNumber}` : ''}`}>
        <SafeImage src={item.media.poster} alt={item.media.title} /><span className="continue-play"><Play size={22} fill="currentColor" /></span>
      </Link>
      {isTimedProgress(item) && <div className="progress-track" aria-label="Progresso do vídeo"><div style={{ width: `${Math.min(100, item.positionMs / item.durationMs * 100)}%` }} /></div>}
      <div className="continue-info"><div><h3><Link to={playbackPath(item.media.id, item.episode)}>{item.media.title}</Link></h3>
        {item.episode && <p>T{item.episode.seasonNumber} · E{item.episode.episodeNumber}</p>}
      </div></div>
    </article>)}</div>
  </section>
}
