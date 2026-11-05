import { useSyncExternalStore } from 'react'
import type { EpisodeSelection } from '../domain/episodes'
import { progressKey } from '../domain/episodes'
import type { Media } from '../domain/media'

// Only observed failures, never guesses based on TMDB metadata or iframe load.
const failures = new Map<string, number>()
const listeners = new Set<() => void>()
const ttl = 30 * 60 * 1000
let revision = 0
function notify() { revision++; listeners.forEach(listener => listener()) }
export function reportMediaFailure(id: string, episode?: EpisodeSelection) {
  failures.set(progressKey(id, episode), Date.now() + ttl)
  notify()
}
export function clearMediaFailure(id: string, episode?: EpisodeSelection) {
  if (failures.delete(progressKey(id, episode))) notify()
}
export function isMediaUnavailable(id: string, episode?: EpisodeSelection) {
  return (failures.get(progressKey(id, episode)) ?? 0) > Date.now()
}
export function isPublicMedia(media: Media) {
  return media.source === 'tmdb' && /^tmdb-(movie|tv)-[1-9]\d*$/.test(media.id)
    && Boolean(media.title.trim()) && media.year > 0
    && media.poster.startsWith('https://image.tmdb.org/t/p/')
}
export function useMediaAvailability() {
  useSyncExternalStore(listener => {
    listeners.add(listener)
    // Refresh visible lists when temporary exclusions expire.
    const timer = setInterval(() => {
      let expired = false
      for (const [key, until] of failures) if (until <= Date.now()) { failures.delete(key); expired = true }
      if (expired) notify()
    }, 30000)
    return () => { listeners.delete(listener); clearInterval(timer) }
  }, () => revision)
  return isMediaUnavailable
}
