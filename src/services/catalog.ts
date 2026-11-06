import type { CatalogPage, CatalogProvider, CatalogRail, CatalogResult, Episode, Media, MediaKind, RailSpec, SearchFilters } from '../domain/media'
import { CatalogRequestCache } from './catalogCache'
import { browseSelection } from '../domain/browse'
import { catalogRailSpecs, movieGenres, tvGenres, railRequest } from '../config/catalogRails'
import { demoCatalog, fictionalCatalog, fixtureEpisodes } from '../data/fixtures'

export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
export function filterMedia(items: Media[], query: string, filters: SearchFilters): Media[] {
  const result = items.filter(m => (!query || normalize(`${m.title} ${m.genres.join(' ')}`).includes(normalize(query)))
    && (!filters.kind || m.kind === filters.kind) && (!filters.genre || m.genres.includes(filters.genre)) && (!filters.year || m.year === filters.year))
  return result.sort((a, b) => filters.sort === 'recent' ? b.year - a.year : filters.sort === 'rating' ? b.rating - a.rating : 0)
}
const fallback = <T,>(data: T, failure = false): CatalogResult<T> => ({ data, origin: failure ? 'fallback' : 'demo', notice: failure ? 'O TMDB está indisponível. Você está explorando nosso catálogo fictício.' : undefined })
export class DemoCatalogProvider implements CatalogProvider {
  async home(kind?: MediaKind) { return fallback(fictionalCatalog.filter(m => !kind || m.kind === kind)) }
  async search(query: string, filters: SearchFilters) { return fallback(filterMedia([...fictionalCatalog, ...demoCatalog], query, filters)) }
  async detail(id: string) { return fallback([...fictionalCatalog, ...demoCatalog].find(m => m.id === id) ?? null) }
  async episodes(media: Media, season: number) { return fallback(fixtureEpisodes(media, season)) }
}

type TmdbRecord = { id: number; adult?: boolean; title?: string; name?: string; original_title?: string; original_name?: string; original_language?: string; overview?: string; release_date?: string; first_air_date?: string; vote_average?: number; poster_path?: string; backdrop_path?: string; genre_ids?: number[]; genres?: { id: number; name: string }[]; runtime?: number; episode_run_time?: number[]; tagline?: string; seasons?: { id: number; season_number: number; name: string; episode_count: number }[]; created_by?: { name: string }[]; recommendations?: { results: TmdbRecord[] }; credits?: { crew?: { name: string; job: string }[]; cast: { name: string; character: string; profile_path?: string }[] }; media_type?: string }
export function validTmdbRecord(value: unknown, kind: MediaKind): value is TmdbRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as TmdbRecord
  const title = kind === 'movie' ? item.title : item.name
  const date = kind === 'movie' ? item.release_date : item.first_air_date
  return Number.isSafeInteger(item.id) && item.id > 0 && item.adult !== true
    && typeof title === 'string' && Boolean(title.trim())
    && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString().slice(0, 10) === date
    && typeof item.poster_path === 'string' && /^\/[\w.-]+$/.test(item.poster_path)
    && (item.genre_ids === undefined || (Array.isArray(item.genre_ids) && item.genre_ids.every(Number.isSafeInteger)))
}
function mapList(records: unknown, kind?: MediaKind): Media[] {
  if (!Array.isArray(records)) return []
  const seen = new Set<string>()
  return records.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const type = kind ?? (item.media_type === 'movie' || item.media_type === 'tv' ? item.media_type : undefined)
    if (!type || !validTmdbRecord(item, type)) return []
    const media = mapTmdb(item, type)
    if (seen.has(media.id)) return []
    seen.add(media.id)
    return [media]
  })
}

export const imageUrl = (path: string | undefined, width: 'w500' | 'w1280' = 'w500') => path ? `https://image.tmdb.org/t/p/${width}${path}` : '/art/poster-1.svg'
export function mapTmdb(item: TmdbRecord, kind: MediaKind): Media {
  const genreIds = item.genres?.map(g => g.id) ?? item.genre_ids ?? []
  return { id: `tmdb-${kind}-${item.id}`, kind, title: item.title ?? item.name ?? 'Sem título', originalTitle: item.original_title ?? item.original_name, originalLanguage: item.original_language,
    overview: item.overview || 'Ainda não há uma descrição disponível em português.', year: Number((item.release_date ?? item.first_air_date ?? '').slice(0, 4)) || 0,
    rating: item.vote_average ?? 0, genres: item.genres?.map(g => g.name) ?? genreIds.map(id => (kind === 'movie' ? movieGenres : tvGenres)[id]).filter(Boolean), genreIds,
    poster: imageUrl(item.poster_path), backdrop: item.backdrop_path ? imageUrl(item.backdrop_path, 'w1280') : '/art/scene-0.svg',
    runtime: item.runtime ?? item.episode_run_time?.[0], tagline: item.tagline, source: 'tmdb',
    seasons: item.seasons?.filter(s => s.season_number > 0).map(s => ({ id: s.id, number: s.season_number, name: s.name, episodeCount: s.episode_count })),
    directors: [...new Set(item.credits?.crew?.filter(p => p.job === 'Director').map(p => p.name) ?? [])],
    creators: item.created_by?.map(p => p.name) ?? [],
    cast: item.credits?.cast?.slice(0, 10).map(p => ({ name: p.name, character: p.character, photo: p.profile_path ? imageUrl(p.profile_path) : undefined })) ?? [],
  }
}
export class TmdbCatalogProvider implements CatalogProvider {
  private searchEnds = new Map<string, { pages: number; total: number | null; until: number }>()
  async searchPage(params: URLSearchParams, signal?: AbortSignal): Promise<CatalogResult<CatalogPage>> {
    const selection = browseSelection(params)
    const { spec, kind, query, page, year, yearFrom, yearTo, country, genres } = selection
    const failure = (notice: string): CatalogResult<CatalogPage> => ({ origin: 'fallback', notice, data: { items: [], page, totalPages: null, totalResults: null, hasMore: true, nextPage: page } })
    const years = [year, yearFrom, yearTo].filter(value => value !== undefined)
    if (['ano', 'de', 'ate'].some(key => params.get(key) && !/^\d{4}$/.test(params.get(key)!))) return failure('Informe anos com quatro dígitos.')
    if (selection.genre.trim() && !genres.length) return failure('Gênero incompatível com o tipo selecionado.')
    if (years.some(value => !Number.isInteger(value) || value! < 1000 || value! > 9999) || (yearFrom && yearTo && yearFrom > yearTo)) return failure('Informe anos válidos e um período em ordem crescente.')
    if (country && !/^[A-Z]{2}$/.test(country)) return failure('Informe a origem com duas letras, por exemplo BR ou JP.')
    if ((query || spec.source !== 'discover') && country) return failure('O TMDB não filtra origem neste modo. Remova o termo/coleção para explorar por origem.')
    if (query && selection.sort !== 'popular') return failure('Busca por termo usa a relevância do TMDB. Remova o termo para ordenar todo o catálogo por nota ou data.')
    if (!query && spec.source !== 'discover' && selection.sort !== 'popular') return failure('Esta coleção preserva a ordem do TMDB. Selecione Todas as coleções para ordenar por nota ou data.')
    const scan = Boolean((query || spec.source !== 'discover') && (genres.length || yearFrom || yearTo || (year && (!query || !kind))))
    try {
      let cursor = page
      let hasMore = false
      let totalPages: number | null = null, totalResults: number | null = null
      const found: Media[] = []
      for (let batch = 0; batch < (scan ? 3 : 1); batch++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        const types = spec.mediaType === 'all' && spec.source !== 'trending' && !query ? ['movie', 'tv'] as const : [spec.mediaType]
        const results = await Promise.all(types.map(async type => {
          const typeGenres = type === 'tv' ? tvGenres : movieGenres
          const validGenres = genres.filter(id => typeGenres[id])
          if (!query && spec.source === 'discover' && genres.length && !validGenres.length) return { items: [] as Media[], pages: 0, total: 0 }
          const route = query ? { path: kind ? `search/${kind}` : 'search/multi', params: { query, include_adult: 'false' } } : railRequest({ ...spec, mediaType: type, genres: validGenres })
          const criteria: Record<string, string> = { ...route.params }
          if (!query && spec.source === 'discover') {
            if (year) criteria[type === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = String(year)
            const date = type === 'tv' ? 'first_air_date' : 'primary_release_date'
            if (yearFrom) criteria[date + '.gte'] = `${yearFrom}-01-01`
            if (yearTo) criteria[date + '.lte'] = `${yearTo}-12-31`
            if (country) criteria.with_origin_country = country
          } else if (query && year && kind) criteria[kind === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = String(year)
          const key = route.path + new URLSearchParams(criteria).toString()
          const fetchPage = (number: number) => this.cached<{ results: TmdbRecord[]; total_pages?: number; total_results?: number }>(route.path, { ...criteria, page: String(number) }, signal)
          let known = this.searchEnds.get(key)
          if (known && known.until <= Date.now()) known = undefined
          if (!known && cursor > 1 && types.length > 1) {
            const first = await fetchPage(1)
            known = { pages: Math.min(500, first.data.total_pages ?? 1), total: first.data.total_results ?? null, until: Date.now() + 120000 }
            this.searchEnds.set(key, known)
          }
          if (known && cursor > known.pages) return { items: [] as Media[], pages: known.pages, total: known.total }
          const response = await fetchPage(cursor)
          if (response.stale) throw new Error('Outdated search response')
          const payload = response.data
          const pages = Math.min(500, Math.max(0, payload.total_pages ?? 1))
          const total = payload.total_results ?? null
          this.searchEnds.set(key, { pages, total, until: Date.now() + 120000 })
          if (this.searchEnds.size > 100) this.searchEnds.delete(this.searchEnds.keys().next().value!)
          let items = mapList(payload.results, type === 'all' ? undefined : type)
          if (scan) items = items.filter(item => (!genres.length || genres.some(id => item.genreIds.includes(id))) && (!year || item.year === year) && (!yearFrom || item.year >= yearFrom) && (!yearTo || item.year <= yearTo))
          return { items, pages, total }
        }))
        found.push(...results.flatMap(result => result.items))
        const pages = Math.max(...results.map(result => result.pages))
        hasMore = cursor < pages
        if (!scan && !(query && !kind)) { totalPages = pages; totalResults = results.every(result => result.total !== null) ? results.reduce((sum, result) => sum + (result.total ?? 0), 0) : null }
        if (!hasMore || found.length || !scan) break
        cursor++
      }
      // Cursor always identifies the last page actually scanned.
      if (scan && !found.length && hasMore) cursor = Math.min(cursor, page + 2)
      const seen = new Set<string>()
      return { origin: 'tmdb', data: { items: found.filter(item => !seen.has(item.id) && Boolean(seen.add(item.id))), page: cursor, totalPages, totalResults, hasMore, nextPage: hasMore ? cursor + 1 : null },
        ...(scan ? { notice: 'Combinação sem filtro direto no TMDB: percorremos até 3 páginas por toque. Total filtrado desconhecido; Ver mais continua a busca, mesmo sem correspondências neste lote.' } : {}) }
    } catch (error) {
      if (signal?.aborted) throw error
      return failure('Não foi possível carregar mais resultados. Os cards anteriores foram preservados; tente novamente.')
    }
  }
  private cache = new CatalogRequestCache()
  constructor(private apiKey: string) {}
  railSpecs = catalogRailSpecs
  private cached<T>(path: string, params: Record<string, string> = {}, signal?: AbortSignal) {
    const key = path + '?' + new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))).toString()
    return this.cache.read<T>(key, () => this.network<T>(path, params), path.startsWith('trending/') ? 120000 : 300000, signal)
  }
  private async request<T>(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> { return (await this.cached<T>(path, params, signal)).data }
  async rail(spec: RailSpec, signal?: AbortSignal): Promise<CatalogResult<CatalogRail>> {
    const { path, params } = railRequest(spec)
    try {
      const response = await this.cached<{ results: TmdbRecord[] }>(path, params, signal)
      return { data: { id: spec.id, title: spec.title, items: mapList(response.data.results, spec.mediaType === 'all' ? undefined : spec.mediaType), browse: spec.browse }, origin: 'tmdb', ...(response.stale ? { notice: 'Sem atualização no momento. Exibindo a última seleção salva nesta sessão.' } : {}) }
    } catch (error) {
      if (signal?.aborted) throw error
      return { data: { id: spec.id, title: spec.title, items: [], browse: spec.browse }, origin: 'fallback', notice: 'Este trilho está temporariamente indisponível.' }
    }
  }
  private async network<T>(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
    const url = new URL(`https://api.themoviedb.org/3/${path}`)
    url.search = new URLSearchParams({ api_key: this.apiKey, language: 'pt-BR', ...params }).toString()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const cancel = () => controller.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) controller.abort()
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error('Catálogo indisponível')
      return await response.json() as T
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
  }
  async home(kind?: MediaKind, signal?: AbortSignal): Promise<CatalogResult<Media[]>> {
    try {
      const result = await this.rail(catalogRailSpecs(kind)[0], signal)
      if (result.origin === 'fallback') throw new Error('trending unavailable')
      return { ...result, data: result.data.items }
    } catch {
      if (!signal?.aborted) {
        const kinds = kind ? [kind] : ['movie', 'tv'] as const
        const lists = await Promise.allSettled(kinds.map(async type => {
          const payload = await this.request<{ results: TmdbRecord[] }>(`${type}/popular`, {}, signal)
          return mapList(payload.results, type)
        }))
        const data = lists.flatMap(result => result.status === 'fulfilled' ? result.value : [])
        if (data.length) return { data, origin: 'tmdb', notice: 'Tendências indisponíveis. Mostrando os títulos populares.' }
      }
      return {
        data: [],
        origin: 'fallback',
        notice: 'O catálogo do TMDB está indisponível. Verifique a chave e a conexão.',
      }
    }
  }
  async collections(kind?: MediaKind, signal?: AbortSignal): Promise<CatalogResult<CatalogRail[]>> {
    const specs = catalogRailSpecs(kind).slice(1)
    const results = await Promise.all(specs.map(spec => this.rail(spec, signal)))
    return { data: results.filter(result => result.data.items.length).map(result => result.data), origin: 'tmdb',
      ...(results.some(result => result.notice) ? { notice: 'Algumas categorias estão temporariamente indisponíveis.' } : {}) }
  }
  async search(query: string, filters: SearchFilters, signal?: AbortSignal): Promise<CatalogResult<Media[]>> {
    if (!query.trim()) {
      const result = await this.home(filters.kind, signal)
      return { ...result, data: filterMedia(result.data, '', filters) }
    }
    try {
      const result = await this.request<{ results: TmdbRecord[] }>('search/multi', { query, include_adult: 'false' }, signal)
      const media = mapList(result.results)
      return { data: filterMedia(media, '', filters), origin: 'tmdb' }
    } catch (error) {
      return {
        data: [],
        origin: 'fallback',
        notice: 'Não foi possível pesquisar no TMDB.',
      }
    }
  }
  async detail(id: string, signal?: AbortSignal): Promise<CatalogResult<Media | null>> {
    const match = /^tmdb-(movie|tv)-(\d+)$/.exec(id)
    if (!match) return { data: null, origin: 'tmdb' }
    try {
      const item = await this.request<TmdbRecord & { imdb_id?: string; external_ids?: { imdb_id?: string } }>(`${match[1]}/${match[2]}`, { append_to_response: 'credits,recommendations,external_ids' }, signal)
      const media = mapTmdb(item, match[1] as MediaKind)
      const imdb = item.external_ids?.imdb_id ?? item.imdb_id
      if (imdb && /^tt\d+$/.test(imdb)) media.imdbId = imdb
      media.recommendations = mapList(item.recommendations?.results, media.kind).filter(candidate => candidate.id !== media.id).slice(0, 12)
      return { data: media, origin: 'tmdb' }
    } catch { return { data: null, origin: 'fallback', notice: 'Não foi possível carregar este título do TMDB. Tente novamente em instantes.' } }
  }
  async episodes(media: Media, season: number, signal?: AbortSignal): Promise<CatalogResult<Episode[]>> {
    if (media.source !== 'tmdb') return { data: [], origin: 'tmdb' }
    try {
      const id = media.id.replace('tmdb-tv-', '')
      const result = await this.request<{ episodes: { id: number; episode_number: number; name: string; overview: string; runtime: number; still_path?: string }[] }>(`tv/${id}/season/${season}`, {}, signal)
      return { data: result.episodes.map(e => ({ id: e.id, number: e.episode_number, name: e.name, overview: e.overview || 'Descrição não disponível.', runtime: e.runtime, image: e.still_path ? imageUrl(e.still_path) : undefined })), origin: 'tmdb' }
    } catch { return { data: [], origin: 'fallback', notice: 'Os episódios estão indisponíveis. Tente novamente.' } }
  }
}
export const tmdbConfigured = Boolean(import.meta.env.VITE_TMDB_API_KEY?.trim())
export class UnconfiguredCatalogProvider implements CatalogProvider {
  private result<T>(data: T): CatalogResult<T> { return { data, origin: 'tmdb', notice: 'Configure VITE_TMDB_API_KEY para carregar o catálogo do TMDB.' } }
  async home() { return this.result<Media[]>([]) }
  async search() { return this.result<Media[]>([]) }
  async detail() { return this.result<Media | null>(null) }
  async episodes() { return this.result<Episode[]>([]) }
}
export const catalog: CatalogProvider = tmdbConfigured ? new TmdbCatalogProvider(import.meta.env.VITE_TMDB_API_KEY.trim()) : new UnconfiguredCatalogProvider()
