import { catalogRailSpecs, movieGenres, tvGenres } from '../config/catalogRails'
import type { MediaKind, RailContext, RailSpec } from './media'
export function railSearchParams(context: RailContext): URLSearchParams {
  const params = new URLSearchParams({ colecao: context.railId })
  if (context.mediaType !== 'all') params.set('tipo', context.mediaType)
  return params
}
export function browseSelection(params: URLSearchParams) {
  const all = [...catalogRailSpecs(), ...catalogRailSpecs('movie'), ...catalogRailSpecs('tv')]
  const base = all.find(spec => spec.id === params.get('colecao'))
  const kind = (['movie', 'tv'].includes(params.get('tipo') ?? '') ? params.get('tipo') : base?.mediaType !== 'all' ? base?.mediaType : undefined) as MediaKind | undefined
  const map = kind === 'tv' ? tvGenres : kind === 'movie' ? movieGenres : { ...movieGenres, ...tvGenres }
  const genre = params.has('genero') ? params.get('genero')! : (base?.genres ?? []).map(id => map[id]).filter(Boolean).join('|')
  const genres = genre.split('|').flatMap(name => Object.entries(map).filter(([, label]) => label === name).map(([id]) => Number(id)))
  const sort = ['rating', 'recent'].includes(params.get('ordem') ?? '') ? params.get('ordem')! : 'popular'
  const year = Number(params.get('ano')) || undefined
  const yearFrom = Number(params.get('de')) || undefined
  const yearTo = Number(params.get('ate')) || undefined
  const country = (params.get('origem') ?? base?.params?.with_origin_country ?? '').trim().toUpperCase()
  const page = Math.min(500, Math.max(1, Math.floor(Number(params.get('pagina')) || 1)))
  const spec: RailSpec = { ...(base ?? { id: 'explore', title: 'Explore o catálogo', source: 'discover' }), mediaType: kind ?? 'all', genres, sort: sort === 'rating' ? 'vote_average.desc' : sort === 'recent' ? kind === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc' : 'popularity.desc' }
  return { base, spec, kind, genre, genres, sort, year, yearFrom, yearTo, country, page, query: (params.get('q') ?? '').trim() }
}
