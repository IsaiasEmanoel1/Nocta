import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { FrameProbe } from '../components/FrameProbe'
import { PlaybackDiagnostics } from '../pages/PlaybackDiagnostics'

it('never mounts a supplier frame after an unlicensed catalog identifier is entered', async () => {
  const view = render(<MemoryRouter><PlaybackDiagnostics /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('ID TMDB'), { target: { value: '42' } })
  expect(screen.getByTestId('embed-url-preview')).toHaveTextContent('https://embedwave.cc/embed/movie/42?server=nxsha')
  fireEvent.click(screen.getByRole('button', { name: 'Verificar direitos e disponibilidade' }))
  expect(await screen.findByTestId('rights-result')).toHaveTextContent('license-missing')
  expect(view.container.querySelector('iframe')).toBeNull()
})
it('does not treat load as playback and times out without a documented handshake', async () => {
  const view = render(<MemoryRouter><FrameProbe url="https://example.invalid/fixture" title="Silent fixture" mode="supplier" timeoutMs={20} /></MemoryRouter>)
  fireEvent.load(view.container.querySelector('iframe')!)
  expect(screen.getByTestId('frame-status')).toHaveAttribute('data-status', 'loaded-unverified')
  await waitFor(() => expect(screen.getByTestId('frame-status')).toHaveAttribute('data-status', 'unconfirmed'))
})
it('accepts messages only from the known fixture window, expected origin and challenge', () => {
  const view = render(<MemoryRouter><FrameProbe url="/diagnostics/licensed-frame.html" title="Fixture" mode="licensed-fixture" challenge="challenge-test" /></MemoryRouter>)
  const frame = view.container.querySelector('iframe')!
  const data = { protocol: 'nocta-fixture-v1', challenge: 'challenge-test', event: 'playing' }
  fireEvent(window, new MessageEvent('message', { data, origin: 'null', source: window }))
  expect(screen.getByTestId('frame-status')).not.toHaveAttribute('data-status', 'playing')
  fireEvent(window, new MessageEvent('message', { data, origin: 'https://evil.invalid', source: frame.contentWindow }))
  expect(screen.getByTestId('frame-status')).not.toHaveAttribute('data-status', 'playing')
  fireEvent(window, new MessageEvent('message', { data, origin: 'null', source: frame.contentWindow }))
  expect(screen.getByTestId('frame-status')).toHaveAttribute('data-status', 'playing')
})
it('removes an expired iframe and shows a direct link to the authorized fallback', () => {
  const view = render(<MemoryRouter><FrameProbe url="https://example.invalid/fixture" title="Expired fixture" mode="supplier" expiresAt={Date.now() - 1} /></MemoryRouter>)
  expect(view.container.querySelector('iframe')).toBeNull()
  expect(screen.getByTestId('frame-status')).toHaveAttribute('data-status', 'expired')
  expect(screen.getByRole('link', { name: 'Usar demonstração autorizada' })).toHaveAttribute('href', '/diagnostico/player/demo-bunny')
})
it('handles a navigation error if the browser emits one without relaxing the sandbox', () => {
  const view = render(<MemoryRouter><FrameProbe url="https://example.invalid/fixture" title="Error fixture" mode="supplier" /></MemoryRouter>)
  const frame = view.container.querySelector('iframe')!
  fireEvent.error(frame)
  expect(screen.getByTestId('frame-status')).toHaveAttribute('data-status', 'load-error')
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin')
  expect(frame.getAttribute('sandbox')).not.toContain('allow-popups')
})
