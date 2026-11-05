import { ChevronDown, Info } from 'lucide-react'
import type { Media } from '../domain/media'
import { SafeImage } from './MediaCard'
import { Carousel } from './Carousel'
import { isPublicMedia, useMediaAvailability } from '../services/mediaAvailability'

/** Disclosure and scrolling never replace the mounted playback session. */
export function PlaybackDetails({ media }: { media: Media }) {
  const unavailable = useMediaAvailability()
  const recommendations = (media.recommendations ?? []).filter(item => isPublicMedia(item) && !unavailable(item.id))
  const original = media.originalTitle && media.originalTitle !== media.title ? media.originalTitle : undefined
  return <details className="watch-details" open>
    <summary><Info size={17} aria-hidden="true" /><span>{media.kind === 'tv' ? 'Ver detalhes da série' : 'Ver detalhes do filme'}</span><ChevronDown size={17} className="watch-details-chevron" aria-hidden="true" /></summary>
    <div className="watch-details-content">
      <div className="watch-title-card">
        <SafeImage src={media.poster} alt={`Cartaz de ${media.title}`} className="watch-title-poster" />
        <div><p className="eyebrow">{media.kind === 'tv' ? 'SÉRIE' : 'FILME'}</p><h2>{media.title}</h2>
          {original && <p className="watch-original-title">Título original: {original}</p>}
          <dl className="watch-details-facts">
            <div><dt>Ano</dt><dd>{media.year || 'Não informado'}</dd></div>
            <div><dt>{media.kind === 'tv' ? 'Duração por episódio' : 'Duração'}</dt><dd>{media.runtime ? `${media.runtime} min` : 'Não informada'}</dd></div>
            <div><dt>Nota TMDB</dt><dd>{media.source === 'tmdb' && media.rating > 0 ? `${media.rating.toFixed(1)} / 10` : 'Não disponível'}</dd></div>
          </dl>
          <div className="watch-genre-tags">{media.genres.length ? media.genres.map(genre => <span key={genre}>{genre}</span>) : <span>Gêneros não informados</span>}</div>
        </div>
      </div>
      <h3>Sinopse</h3><p>{media.overview || 'Sinopse ainda não disponível.'}</p>
      {!!media.directors?.length && <p className="watch-authors"><strong>Direção:</strong> {media.directors.join(' · ')}</p>}
      {!!media.creators?.length && <p className="watch-authors"><strong>Criação:</strong> {media.creators.join(' · ')}</p>}
      {media.kind === 'tv' && <p className="watch-authors">{media.seasons?.length ? `${media.seasons.length} temporadas · ${media.seasons.reduce((total, season) => total + season.episodeCount, 0)} episódios informados. Selecione abaixo a temporada e o episódio.` : 'Temporadas e episódios ainda não informados.'}</p>}
      <h3>Elenco</h3>
      {media.cast.length ? <ul className="watch-details-cast">{media.cast.map((person, index) =>
        <li key={`${person.name}-${index}`}>
          {person.photo ? <SafeImage src={person.photo} alt={person.name} className="watch-cast-photo" /> : <div className="watch-cast-placeholder" aria-hidden="true">{person.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div>}
          <strong>{person.name}</strong><span>{person.character || 'Personagem não informado'}</span>
        </li>)}</ul> : <p>Elenco ainda não informado.</p>}
      {recommendations.length ? <Carousel title="Você também pode gostar" items={recommendations} link={`/buscar?${new URLSearchParams({ tipo: media.kind, ...(media.genres[0] ? { genero: media.genres[0] } : {}) })}`} /> : <p className="watch-recommendations-empty">Recomendações não disponíveis para este título no momento.</p>}
    </div>
  </details>
}
