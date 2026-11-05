import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router'
import { AndroidLifecycle, APP_BACKGROUND_EVENT } from '../components/AndroidLifecycle'

const native = vi.hoisted(() => ({
  platform: 'android',
  callbacks: {} as Record<string, (data?: unknown) => void | Promise<void>>,
  remove: vi.fn(), minimize: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => native.platform } }))
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (event: string, callback: (data?: unknown) => void) => {
    native.callbacks[event] = callback
    return { remove: native.remove }
  }),
  minimizeApp: native.minimize,
} }))
beforeEach(() => { native.platform = 'android'; native.callbacks = {}; native.remove.mockClear(); native.minimize.mockClear() })
function CurrentRoute() { return <p data-testid="route">{useLocation().pathname}</p> }
function mount(entries = ['/'], initialIndex = entries.length - 1) {
  return render(<MemoryRouter initialEntries={entries} initialIndex={initialIndex}><AndroidLifecycle /><CurrentRoute /></MemoryRouter>)
}
it('does not register native handlers in a browser', () => {
  native.platform = 'web'
  mount()
  expect(native.callbacks).toEqual({})
})
it('navigates Back through React routes', async () => {
  window.history.replaceState({ idx: 1 }, '', '/')
  mount(['/', '/titulo/demo-bunny'])
  await act(async () => { await native.callbacks.backButton() })
  expect(screen.getByTestId('route')).toHaveTextContent(/^\/$/)
  expect(native.minimize).not.toHaveBeenCalled()
})
it('returns a direct route to home instead of leaving the local app origin', async () => {
  mount(['/assistir/demo-bunny'])
  await act(async () => { await native.callbacks.backButton() })
  expect(screen.getByTestId('route')).toHaveTextContent(/^\/$/)
})
it('minimizes at home and announces background so playback can persist', async () => {
  const onBackground = vi.fn()
  window.addEventListener(APP_BACKGROUND_EVENT, onBackground, { once: true })
  mount()
  await act(async () => { await native.callbacks.backButton() })
  expect(native.minimize).toHaveBeenCalledOnce()
  expect(onBackground).toHaveBeenCalledOnce()
})
it('announces native background only when inactive and removes both handlers', async () => {
  const onBackground = vi.fn()
  window.addEventListener(APP_BACKGROUND_EVENT, onBackground)
  const view = mount()
  await act(async () => {
    await native.callbacks.appStateChange({ isActive: true })
    await native.callbacks.appStateChange({ isActive: false })
  })
  expect(onBackground).toHaveBeenCalledOnce()
  view.unmount()
  await waitFor(() => expect(native.remove).toHaveBeenCalledTimes(2))
  window.removeEventListener(APP_BACKGROUND_EVENT, onBackground)
})
it('exits fullscreen before changing the route', async () => {
  const exit = vi.fn(async () => {})
  Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true })
  Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true })
  mount(['/assistir/demo-bunny'])
  await act(async () => { await native.callbacks.backButton() })
  expect(exit).toHaveBeenCalledOnce()
  expect(screen.getByTestId('route')).toHaveTextContent('/assistir/demo-bunny')
  Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
})
