export type MediaKind = 'movie' | 'tv'
export type CatalogOrigin = 'demo' | 'tmdb' | 'fallback'
export interface Person { name: string; character?: string; photo?: string }
export interface Season { id: number; number: number; name: string; episodeCount: number }
export interface Episode { id: number; number: number; name: string; overview: string; runtime: number; image?: string }
export interface Media {
  imdbId?: string
  id: string; kind: MediaKind; title: string; originalTitle?: string; overview: string
  year: number; rating: number; genres: string[]; genreIds: number[]
  poster: string; backdrop: string; runtime?: number; seasons?: Season[]; cast: Person[]
  directors?: string[]; creators?: string[]; recommendations?: Media[]
  tagline?: string; source: 'fiction' | 'tmdb' | 'licensed-demo'; demoLabel?: string
}
export interface CatalogResult<T> { data: T; origin: CatalogOrigin; notice?: string }
export interface RailContext { railId: string; mediaType: MediaKind | 'all'; source: 'trending' | 'popular' | 'discover'; window?: 'day' | 'week'; genres?: number[]; sort?: string; params?: Record<string, string> }
export interface RailSpec extends Omit<RailContext, 'railId'> { id: string; title: string; browse?: RailContext }
export interface CatalogRail { id: string; title: string; items: Media[]; browse?: RailContext; notice?: string }
export interface SearchFilters { kind?: MediaKind; genre?: string; year?: number; sort?: 'popular' | 'rating' | 'recent' }
export interface CatalogPage { items: Media[]; page: number; totalPages: number | null; totalResults: number | null; hasMore: boolean; nextPage: number | null }
export interface CatalogProvider {
  searchPage?(params: URLSearchParams, signal?: AbortSignal): Promise<CatalogResult<CatalogPage>>
  home(kind?: MediaKind, signal?: AbortSignal): Promise<CatalogResult<Media[]>>
  collections?(kind?: MediaKind, signal?: AbortSignal): Promise<CatalogResult<CatalogRail[]>>
  railSpecs?(kind?: MediaKind): RailSpec[]
  rail?(spec: RailSpec, signal?: AbortSignal): Promise<CatalogResult<CatalogRail>>
  search(query: string, filters: SearchFilters, signal?: AbortSignal): Promise<CatalogResult<Media[]>>
  detail(id: string, signal?: AbortSignal): Promise<CatalogResult<Media | null>>
  episodes(media: Media, season: number, signal?: AbortSignal): Promise<CatalogResult<Episode[]>>
}
export const mediaPath = (media: Media) => `/titulo/${media.id}`
