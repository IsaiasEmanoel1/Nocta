import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Media } from '../domain/media'
import { progressKey, validSelection } from '../domain/episodes'
import type { EpisodeSelection } from '../domain/episodes'
import {readPlaybackPreference} from '../domain/playbackResume'
import type {PlaybackPreference} from '../domain/playbackResume'

interface HistoryBase { media: Media; updatedAt: number; episode?: EpisodeSelection; completed?: boolean; preference?:PlaybackPreference }
export interface WatchProgress extends HistoryBase { playbackType?: 'html5'; positionMs: number; durationMs: number }
export interface IframeHistory extends HistoryBase { playbackType: 'iframe'; lastKnownProgress?:{positionMs:number;durationMs:number} }
export type HistoryEntry = WatchProgress | IframeHistory
export interface LibraryState { version: 2; favorites: Media[]; progress: Record<string, HistoryEntry> }
export const STORAGE_KEY = 'nocta.library.v2'
export const LEGACY_STORAGE_KEY = 'nocta.library.v1'
const empty = (): LibraryState => ({ version: 2, favorites: [], progress: {} })
function mediaSnapshot(value: unknown): Media | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Media
  if (typeof item.id !== 'string' || !item.id.trim() || typeof item.title !== 'string' || !item.title.trim()) return null
  return { ...item, kind: item.kind === 'tv' ? 'tv' : 'movie',
    overview: typeof item.overview === 'string' ? item.overview : '', year: Number.isFinite(item.year) ? item.year : 0,
    rating: Number.isFinite(item.rating) ? item.rating : 0,
    genres: Array.isArray(item.genres) ? item.genres.filter(g => typeof g === 'string') : [],
    genreIds: Array.isArray(item.genreIds) ? item.genreIds.filter(Number.isSafeInteger) : [], cast: Array.isArray(item.cast) ? item.cast.filter(person => person && typeof person.name === 'string') : [],
    poster: typeof item.poster === 'string' && item.poster ? item.poster : '/art/poster-1.svg',
    backdrop: typeof item.backdrop === 'string' && item.backdrop ? item.backdrop : '/art/scene-0.svg',
    ...(item.seasons !== undefined ? { seasons: Array.isArray(item.seasons) ? item.seasons.filter(season => season && Number.isSafeInteger(season.number) && season.number > 0 && Number.isFinite(season.episodeCount) && season.episodeCount >= 0) : [] } : {}),
    source: ['tmdb', 'fiction', 'licensed-demo'].includes(item.source) ? item.source : item.id.startsWith('tmdb-') ? 'tmdb' : 'fiction' }
}
export function isTimedProgress(entry: HistoryEntry): entry is WatchProgress { return entry.playbackType !== 'iframe' }
export function knownProgress(entry?:HistoryEntry){return entry?(isTimedProgress(entry)?{positionMs:entry.positionMs,durationMs:entry.durationMs}:entry.lastKnownProgress):undefined}
export function isCompleted(entry: HistoryEntry): boolean { return entry.completed ?? (isTimedProgress(entry) && entry.positionMs / entry.durationMs >= .95) }
export function resumable(entry: HistoryEntry): boolean { return !isCompleted(entry) && (!isTimedProgress(entry) || entry.positionMs >= 1000) }
export function readLibrary(storage: Pick<Storage, 'getItem'> | null): LibraryState {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = storage?.getItem(key)
      if (!raw) continue
      const value = JSON.parse(raw)
      if (![1, 2].includes(value?.version) || !Array.isArray(value.favorites) || !value.progress || typeof value.progress !== 'object' || Array.isArray(value.progress)) continue
      const progress: Record<string, HistoryEntry> = {}
      for (const [id, entry] of Object.entries(value.progress)) {
        if (!entry || typeof entry !== 'object') continue
        const p = entry as HistoryEntry
        const media = mediaSnapshot(p.media)
        if (!media || (p.episode !== undefined && !validSelection(p.episode)) || progressKey(media.id, p.episode) !== id) continue
        const preference=readPlaybackPreference(p.preference)
        const base = { media, updatedAt: Number.isFinite(p.updatedAt) && p.updatedAt >= 0 ? p.updatedAt : 0, ...(p.episode ? { episode: p.episode } : {}), ...(typeof p.completed === 'boolean' ? { completed: p.completed } : {}),...(preference?{preference}:{}) }
        if (p.playbackType === 'iframe') {const checkpoint=p.lastKnownProgress;progress[id] = { ...base, playbackType: 'iframe',...(checkpoint&&Number.isFinite(checkpoint.positionMs)&&Number.isFinite(checkpoint.durationMs)&&checkpoint.positionMs>=0&&checkpoint.durationMs>0?{lastKnownProgress:{positionMs:Math.min(checkpoint.positionMs,checkpoint.durationMs),durationMs:checkpoint.durationMs}}:{}) }}
        else if ((p.playbackType === undefined || p.playbackType === 'html5') && Number.isFinite(p.positionMs) && p.positionMs >= 0 && Number.isFinite(p.durationMs) && p.durationMs > 0) progress[id] = { ...base, positionMs: Math.min(p.positionMs, p.durationMs), durationMs: p.durationMs, ...(p.playbackType === 'html5' ? { playbackType: 'html5' as const } : {}) }
      }
      const seen = new Set<string>()
      const favorites = value.favorites.map(mediaSnapshot).filter((media: Media | null): media is Media => Boolean(media && !seen.has(media.id) && seen.add(media.id)))
      return { version: 2, favorites, progress }
    } catch { /* Try the untouched v1 backup when v2 cannot be read. */ }
  }
  return empty()
}
interface LibraryContextValue {
  state: LibraryState; isFavorite(id: string): boolean; toggleFavorite(media: Media): void
  saveProgress(media: Media, positionMs: number, durationMs: number, episode?: EpisodeSelection): void
  recordIframeOpen(media: Media, episode?: EpisodeSelection): void
  savePlaybackPreference(media:Media,preference:PlaybackPreference,episode?:EpisodeSelection):boolean
  setCompleted(id: string, completed: boolean): void
  removeMediaHistory(id: string): void
  removeProgress(id: string): void; clearHistory(): void; toast: string; storageError: boolean
}
const LibraryContext = createContext<LibraryContextValue | null>(null)
export function LibraryProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<LibraryState>(() => { try { return readLibrary(window.localStorage) } catch { return empty() } })
  const current = useRef(state)
  const [toast, setToast] = useState('')
  const [storageError, setStorageError] = useState(false)
  const persist = useCallback((next: LibraryState) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageError(false); return true } catch { setStorageError(true); return false } }, [])
  const commit = useCallback((update: (value: LibraryState) => LibraryState) => {
    const next = update(current.current)
    if (next === current.current) return true
    current.current = next
    // Persist synchronously: pagehide/unmount must not depend on a later React effect.
    const saved = persist(next); setState(next); return saved
  }, [persist])
  useEffect(() => { persist(current.current) }, [persist])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) { const next = readLibrary(window.localStorage); current.current = next; setState(next) } }
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync)
  }, [])
  const toggleFavorite = (media: Media) => {
    const exists = current.current.favorites.some(item => item.id === media.id)
    commit(s => ({ ...s, favorites: exists ? s.favorites.filter(item => item.id !== media.id) : [media, ...s.favorites] }))
    setToast(exists ? `${media.title} saiu da sua lista` : `${media.title} adicionado à sua lista`)
  }
  const saveProgress = useCallback((media: Media, positionMs: number, durationMs: number, episode?: EpisodeSelection) => {
    if (episode && !validSelection(episode)) return
    if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs) || durationMs <= 0 || positionMs < 1000) return
    commit(s => {
      const key = progressKey(media.id, episode), previous = s.progress[key]
      const position = Math.min(positionMs, durationMs)
      if (previous && isTimedProgress(previous) && previous.positionMs === position && previous.durationMs === durationMs) return s
      return { ...s, progress: { ...s.progress, [key]: { media, playbackType: 'html5', positionMs: position, durationMs, updatedAt: Date.now(), completed: previous?.completed === true || position / durationMs >= .95, ...(episode ? { episode } : {}),...(previous?.preference?{preference:previous.preference}:{}) } } }
    })
  }, [commit])
  const recordIframeOpen = useCallback((media: Media, episode?: EpisodeSelection) => {
    if (episode && !validSelection(episode)) return
    commit(s => {const key=progressKey(media.id,episode),previous=s.progress[key],checkpoint=knownProgress(previous);return { ...s, progress: { ...s.progress, [key]: { media, playbackType: 'iframe', updatedAt: Date.now(), completed: false, ...(episode ? { episode } : {}),...(previous?.preference?{preference:previous.preference}:{}),...(checkpoint?{lastKnownProgress:checkpoint}:{}) } } }})
  }, [commit])
  const savePlaybackPreference=useCallback((media:Media,value:PlaybackPreference,episode?:EpisodeSelection)=>{
    const preference=readPlaybackPreference(value),key=progressKey(media.id,episode);if(!preference||!current.current.progress[key])return false
    return commit(s=>{const previous=s.progress[key];if(!previous)return s;if(JSON.stringify(previous.preference)===JSON.stringify(preference))return s;return {...s,progress:{...s.progress,[key]:{...previous,preference}}}})
  },[commit])
  const setCompleted = useCallback((id: string, completed: boolean) => commit(s => {
    const previous = s.progress[id]
    if (!previous || previous.completed === completed) return s
    return { ...s, progress: { ...s.progress, [id]: { ...previous, ...(isTimedProgress(previous) && !completed && isCompleted(previous) ? { positionMs: 0 } : {}), completed, updatedAt: Date.now() } } }
  }), [commit])
  // Once the user deletes history, a recovery backup must not restore those deleted entries.
  // Discard it only after the edited v2 state was successfully persisted.
  const discardLegacyBackup = useCallback(() => { try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch { setStorageError(true) } }, [])
  const removeProgress = useCallback((id: string) => {
    if (commit(s => ({ ...s, progress: Object.fromEntries(Object.entries(s.progress).filter(([key]) => key !== id)) }))) discardLegacyBackup()
  }, [commit, discardLegacyBackup])
  const removeMediaHistory = useCallback((id: string) => {
    if (commit(s => ({ ...s, progress: Object.fromEntries(Object.entries(s.progress).filter(([, entry]) => entry.media.id !== id)) }))) discardLegacyBackup()
  }, [commit, discardLegacyBackup])
  const clearHistory = useCallback(() => { if (commit(s => ({ ...s, progress: {} }))) discardLegacyBackup() }, [commit, discardLegacyBackup])
  return <LibraryContext.Provider value={{ state, toggleFavorite, isFavorite: id => state.favorites.some(media => media.id === id), saveProgress, recordIframeOpen, savePlaybackPreference, setCompleted, removeProgress, removeMediaHistory, clearHistory, toast, storageError }}>
    {children}<div role="status" className={`toast ${toast ? 'visible' : ''}`}>{toast}</div>
    {storageError && <div className="storage-warning" role="status">Seu navegador bloqueou o armazenamento. Sua lista dura apenas nesta sessão.</div>}
  </LibraryContext.Provider>
}
export function useLibrary() { const value = useContext(LibraryContext); if (!value) throw new Error('LibraryProvider necessário'); return value }
