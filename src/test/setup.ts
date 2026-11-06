import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// Unit tests use fixtures; a developer's real .env must not trigger remote catalog requests.
vi.stubEnv('VITE_TMDB_API_KEY', '')
// JSDOM has no media engine; pausing on unmount is checked separately with real players.
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, '', '/') })
window.scrollTo = vi.fn()
HTMLElement.prototype.scrollBy = vi.fn()
