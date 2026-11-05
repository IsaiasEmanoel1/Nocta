import { expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { LibraryProvider } from '../state/library'
import { Watch } from '../pages/Watch'
import type { PlaybackProvider } from '../services/playback'
import { DemoCatalogProvider } from '../services/catalog'

it('accepts a replacement playback provider without depending on the demo catalog allowlist in the screen', async () => {
  const provider: PlaybackProvider = { resolve: async request => ({
    id: request.mediaId, title: 'Sessão de teste autorizada', poster: '/art/scene-0.svg', sourceLabel: 'Fornecedor simulado',
    sources: [{ src: 'https://example.invalid/authorized-test.mp4', type: 'video/mp4' }],
    attribution: 'Mídia simulada somente em teste. Nenhuma requisição.',
    license: { name: 'Autorização de teste', url: 'https://example.invalid/license', projectUrl: 'https://example.invalid' },
  }) }
  const view = render(<LibraryProvider><MemoryRouter initialEntries={['/assistir/fiction-1']}><Routes><Route path="/assistir/:id" element={<Watch provider={provider} catalogProvider={new DemoCatalogProvider()} />} /></Routes></MemoryRouter></LibraryProvider>)
  await waitFor(() => expect(view.container.querySelector('video')).toBeInTheDocument())
  expect(view.container.querySelector('source')).toHaveAttribute('src', 'https://example.invalid/authorized-test.mp4')
})
