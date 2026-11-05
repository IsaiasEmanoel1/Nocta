import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { IframePlayer } from '../components/IframePlayer'
import { PlaybackDetails } from '../components/PlaybackDetails'
import { LibraryProvider } from '../state/library'
import type { Media } from '../domain/media'

const media: Media = { id: 'tmdb-movie-99110', kind: 'movie', title: 'Título local', originalTitle: 'Original title', overview: 'Sinopse completa de teste.', year: 2026, runtime: 120, rating: 8.2, genres: ['Drama'], genreIds: [18], poster: '/art/poster-1.svg', backdrop: '/art/scene-0.svg', source: 'tmdb', cast: [{ name: 'Pessoa de teste', character: 'Personagem', photo: '/art/poster-1.svg' }], directors: ['Diretora de teste'] }

it('uses a responsive unscaled iframe without duplicate controls, preserving fullscreen permission', () => {
  const session = { id: media.id, title: media.title, sources: [], poster: media.poster, sourceLabel: 'Teste', attribution: '', license: { name: '', url: '', projectUrl: '' }, isIframe: true, iframeUrl: 'https://example.invalid/player' }
  const view = render(<IframePlayer session={session} />)
  const iframe = view.container.querySelector('iframe')!
  expect(iframe).toHaveAttribute('allowfullscreen')
  expect(iframe).toHaveAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media')
  expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation')
  expect(iframe).not.toHaveAttribute('style')
  expect(screen.queryByRole('button')).toBeNull()
  fireEvent(window, new Event('resize'))
  expect(view.container.querySelector('iframe')).toBe(iframe)
})

it('shows the complete metadata by default with labeled TMDB rating, credits and cast photos', () => {
  const view = render(<MemoryRouter><LibraryProvider><PlaybackDetails media={media} /></LibraryProvider></MemoryRouter>)
  expect(view.container.querySelector('details')).toHaveAttribute('open')
  expect(screen.getByText('Título original: Original title')).toBeVisible()
  expect(screen.getByText('Nota TMDB')).toBeVisible()
  expect(screen.getByText('8.2 / 10')).toBeVisible()
  expect(screen.getByText(media.overview)).toBeVisible()
  expect(screen.getByText('Diretora de teste')).toBeVisible()
  expect(screen.getByAltText('Pessoa de teste')).toBeVisible()
  expect(screen.getByText('Personagem')).toBeVisible()
})

it('provides honest fallbacks for missing metadata', () => {
  render(<MemoryRouter><LibraryProvider><PlaybackDetails media={{ ...media, year: 0, runtime: undefined, rating: 0, overview: '', cast: [], genres: [], directors: [] }} /></LibraryProvider></MemoryRouter>)
  expect(screen.getByText('Sinopse ainda não disponível.')).toBeVisible()
  expect(screen.getByText('Elenco ainda não informado.')).toBeVisible()
  expect(screen.getByText('Recomendações não disponíveis para este título no momento.')).toBeVisible()
})
