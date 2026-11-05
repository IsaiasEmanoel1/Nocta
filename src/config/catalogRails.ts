import type { MediaKind, RailSpec } from '../domain/media'

export const movieGenres: Record<number, string> = { 28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime', 99: 'Documentário', 18: 'Drama', 10751: 'Família', 14: 'Fantasia', 36: 'História', 27: 'Terror', 10402: 'Música', 9648: 'Mistério', 10749: 'Romance', 878: 'Ficção científica', 53: 'Suspense', 10752: 'Guerra', 37: 'Faroeste' }
export const tvGenres: Record<number, string> = { 10759: 'Ação e aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime', 99: 'Documentário', 18: 'Drama', 10751: 'Família', 10762: 'Infantil', 9648: 'Mistério', 10764: 'Reality', 10765: 'Ficção científica e fantasia', 10766: 'Novela', 10768: 'Guerra e política', 37: 'Faroeste', 10763: 'Notícias', 10767: 'Talk show' }
const discover = (id: string, title: string, mediaType: MediaKind, genres: number[], params: Record<string, string> = {}): RailSpec =>
  ({ id, title, mediaType, source: 'discover', genres, sort: 'popularity.desc', params })
const movieRails = [
  discover('action', 'Filmes de Ação', 'movie', [28]), discover('movie-comedy', 'Filmes de comédia', 'movie', [35]),
  discover('thriller', 'Terror e suspense', 'movie', [27, 53]), discover('romance', 'Romance', 'movie', [10749]),
  discover('scifi', 'Ficção científica', 'movie', [878]), discover('adventure', 'Aventura', 'movie', [12]),
  discover('animation', 'Animação', 'movie', [16]), discover('documentary', 'Documentários', 'movie', [99]),
  discover('family', 'Para toda a família', 'movie', [10751]), discover('movie-fantasy', 'Mundos de fantasia', 'movie', [14]),
  discover('movie-crime', 'Crimes e investigações', 'movie', [80]),
]
const tvRails = [
  discover('drama', 'Séries de Drama', 'tv', [18]), discover('tv-crime', 'Séries policiais', 'tv', [80]),
  discover('tv-comedy', 'Séries de comédia', 'tv', [35]), discover('tv-mystery', 'Séries de mistério', 'tv', [9648]),
  discover('anime', 'Anime', 'tv', [16], { with_origin_country: 'JP', with_original_language: 'ja' }),
  discover('novelas', 'Novelas', 'tv', [10766]), discover('tv-fantasy', 'Ficção científica e fantasia', 'tv', [10765]),
  discover('tv-animation', 'Séries de animação', 'tv', [16]), discover('reality', 'Reality', 'tv', [10764]),
  discover('tv-adventure', 'Séries de ação e aventura', 'tv', [10759]), discover('tv-documentary', 'Séries documentais', 'tv', [99]),
]

/** The sole editorial definition: Home and future browse pages consume the same spec. */
export function catalogRailSpecs(kind?: MediaKind): RailSpec[] {
  const mediaType = kind ?? 'all'
  const daily: RailSpec = { id: 'daily', title: kind === 'movie' ? 'Filmes em alta hoje' : kind === 'tv' ? 'Séries em alta hoje' : 'Em alta hoje', mediaType, source: 'trending', window: 'day' }
  const weekly: RailSpec = { id: 'weekly', title: 'Em alta na semana', mediaType, source: 'trending', window: 'week' }
  const popular = (type: MediaKind): RailSpec => ({ id: `${type}-popular`, title: type === 'movie' ? 'Filmes populares' : 'Séries populares', mediaType: type, source: 'popular' })
  const movies = kind === 'movie' ? [...movieRails, discover('horror', 'Filmes de terror', 'movie', [27]), discover('suspense', 'Filmes de suspense', 'movie', [53])] : movieRails
  const specs = [daily, weekly, ...(!kind || kind === 'movie' ? [popular('movie')] : []), ...(!kind || kind === 'tv' ? [popular('tv')] : []), ...(!kind || kind === 'movie' ? movies : []), ...(!kind || kind === 'tv' ? tvRails : [])]
  return specs.map(spec => ({ ...spec, browse: { railId: spec.id, mediaType: spec.mediaType, source: spec.source, window: spec.window, genres: spec.genres, sort: spec.sort, params: spec.params } }))
}
export function railRequest(spec: RailSpec) {
  return { path: spec.source === 'trending' ? `trending/${spec.mediaType}/${spec.window ?? 'day'}` : spec.source === 'popular' ? `${spec.mediaType}/popular` : `discover/${spec.mediaType}`,
    params: spec.source === 'discover' ? { include_adult: 'false', sort_by: spec.sort ?? 'popularity.desc', ...(spec.genres?.length ? { with_genres: spec.genres.join('|') } : {}), ...spec.params } : {} }
}
