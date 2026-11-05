import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Play } from 'lucide-react'
import type { CatalogProvider, Media } from '../domain/media'
import type { EpisodeSelection } from '../domain/episodes'
import { playableEpisodes, positiveNumber, progressKey } from '../domain/episodes'
import { isCompleted, useLibrary } from '../state/library'
import { SafeImage } from './MediaCard'
import { useAsync } from '../hooks/useAsync'

interface EpisodePickerProps {
  media: Media; provider: CatalogProvider; current: EpisodeSelection; pending?: EpisodeSelection
  previous?: EpisodeSelection; next?: EpisodeSelection; onSelect(selection: EpisodeSelection): void; busy: boolean
  autoAdvance: boolean; onAutoAdvanceChange(value: boolean): void; supportsProgress: boolean
}
export function EpisodePicker({ media, provider, current, pending, previous, next, onSelect, busy, autoAdvance, onAutoAdvanceChange, supportsProgress }: EpisodePickerProps) {
  const { state } = useLibrary()
  const [season, setSeason] = useState(current.seasonNumber)
  useEffect(() => { setSeason(current.seasonNumber) }, [current.seasonNumber])
  const { data, loading, error } = useAsync(signal => provider.episodes(media, season, signal), [media.id, provider, season])
  const seasons = media.seasons?.filter(item => positiveNumber(item.number)).sort((a, b) => a.number - b.number) ?? []
  const episodes = playableEpisodes(data?.data ?? [])
  return <section className="watch-episodes" aria-labelledby="watch-episodes-title">
    <div className="watch-episodes-heading"><div><p className="eyebrow">CONTINUE A HISTÓRIA</p><h2 id="watch-episodes-title">Episódios</h2></div>
      <label className="watch-season"><span className="sr-only">Selecionar temporada no player</span>
        <select value={season} onChange={event => setSeason(Number(event.target.value))}>
          {seasons.length ? seasons.map(item => <option key={item.number} value={item.number}>Temporada {item.number}</option>) : <option value={season}>Temporada {season}</option>}
        </select><ChevronDown size={16} aria-hidden="true" />
      </label>
    </div>
    <div className="watch-episode-current"><span>Em exibição · T{current.seasonNumber} · E{current.episodeNumber}</span>
      {previous && <button className="button button-secondary" disabled={busy} onClick={() => onSelect(previous)}><ArrowLeft size={16} aria-hidden="true" />Anterior</button>}
      {next && <button className="button button-secondary" disabled={busy} onClick={() => onSelect(next)}>Próximo episódio <ArrowRight size={16} aria-hidden="true" /></button>}
    </div>
    {supportsProgress && <label className="watch-autonext"><input type="checkbox" checked={autoAdvance} onChange={event => onAutoAdvanceChange(event.target.checked)} />Reproduzir próximo episódio automaticamente</label>}
    {loading ? <p role="status" className="muted">Carregando episódios…</p> : episodes.length ? <ol className="watch-episode-list">
      {episodes.map(episode => {
        const selected = season === current.seasonNumber && episode.number === current.episodeNumber
        const saved = state.progress[progressKey(media.id, { seasonNumber: season, episodeNumber: episode.number })]
        const watched = saved && isCompleted(saved)
        const preparing = season === pending?.seasonNumber && episode.number === pending.episodeNumber
        return <li key={episode.id}><button disabled={busy || selected} aria-current={selected ? 'true' : undefined} className={selected ? 'selected' : ''} onClick={() => onSelect({ seasonNumber: season, episodeNumber: episode.number })}>
          {episode.image && <SafeImage src={episode.image} alt={`Cena de ${episode.name}`} className="watch-episode-thumb" />}
          <span className="watch-episode-number">{String(episode.number).padStart(2, '0')}</span>
          <span className="watch-episode-copy"><strong>{episode.name}</strong><span>{preparing ? 'Preparando episódio…' : selected ? 'Em exibição' : watched ? 'Assistido' : saved ? 'Aberto anteriormente' : 'Assistir episódio'}</span>{!!episode.runtime && <span>{episode.runtime} min</span>}</span>
          {selected ? <Check size={18} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
        </button></li>
      })}
    </ol> : <p role="status" className="muted">{error || data?.notice || 'Nenhum episódio disponível nesta temporada.'}</p>}
  </section>
}
