import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { expect, it, vi } from 'vitest'
import { catalogRailSpecs, railRequest } from '../config/catalogRails'
import { browseSelection, railSearchParams } from '../domain/browse'
import { TmdbCatalogProvider } from '../services/catalog'
import { Carousel } from '../components/Carousel'
import { LibraryProvider } from '../state/library'

it.each([
  ['horror', 'movie', [27]], ['movie-comedy', 'movie', [35]], ['drama', 'tv', [18]], ['tv-comedy', 'tv', [35]],
] as const)('round-trips %s from Home into the correct remote collection', (id, kind, genres) => {
  const spec = catalogRailSpecs(kind).find(item => item.id === id)!
  const result = browseSelection(railSearchParams(spec.browse!))
  expect(result.kind).toBe(kind); expect(result.genres).toEqual(genres)
  expect(railRequest(result.spec).path).toBe(`discover/${kind}`)
})
it('retains weekly windows and special anime classification on a direct link', () => {
  expect(railRequest(browseSelection(new URLSearchParams('colecao=weekly&tipo=tv')).spec).path).toBe('trending/tv/week')
  const anime = browseSelection(new URLSearchParams('colecao=anime'))
  expect(anime.kind).toBe('tv'); expect(anime.genre).toBe('Animação')
  expect(railRequest(anime.spec).params).toMatchObject({ with_genres: '16', with_origin_country: 'JP', with_original_language: 'ja' })
})
it('combines genre, year, ordering and remote page instead of slicing Home cards', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [], total_pages: 12 }) })
  vi.stubGlobal('fetch', fetcher)
  const result = await new TmdbCatalogProvider('test').searchPage(new URLSearchParams('colecao=horror&tipo=movie&genero=Comédia&ano=2020&ordem=rating&pagina=3'))
  const url = fetcher.mock.calls[0][0] as URL
  expect(url.pathname).toBe('/3/discover/movie')
  expect(url.searchParams.get('with_genres')).toBe('35')
  expect(url.searchParams.get('primary_release_year')).toBe('2020')
  expect(url.searchParams.get('sort_by')).toBe('vote_average.desc')
  expect(url.searchParams.get('page')).toBe('3')
  expect(result.data.totalPages).toBe(12)
})
it('keeps the original route when returning from Ver todos', () => {
  const browse = catalogRailSpecs('movie').find(spec => spec.id === 'horror')!.browse!
  function Back() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Voltar</button> }
  render(<LibraryProvider><MemoryRouter initialEntries={['/filmes']}><Routes>
    <Route path="/filmes" element={<Carousel title="Terror" items={[{ id: 'tmdb-movie-1', kind: 'movie', title: 'Teste', year: 2020, genres: [], genreIds: [], poster: '/p.svg', backdrop: '', overview: '', rating: 0, cast: [], source: 'tmdb' }]} browse={browse} />} />
    <Route path="/buscar" element={<Back />} />
  </Routes></MemoryRouter></LibraryProvider>)
  expect(screen.getByRole('link', { name: /Ver todos/ })).toHaveAttribute('href', '/buscar?colecao=horror&tipo=movie')
  fireEvent.click(screen.getByRole('link', { name: /Ver todos/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(screen.getByRole('link', { name: /Ver todos/ })).toBeInTheDocument()
})
