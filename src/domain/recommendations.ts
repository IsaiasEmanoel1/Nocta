import { isCompleted, knownProgress } from '../state/library'
import type { LibraryState } from '../state/library'
import type { Media, MediaKind, RailSpec } from './media'

type Interest = { kind: MediaKind; genre?: number; category?: 'anime' | 'novela'; score: number }
const day = 86_400_000
const category = (media: Media) => media.kind === 'tv' && media.genreIds.includes(10766) ? 'novela'
  : media.kind === 'tv' && media.originalLanguage === 'ja' && media.genreIds.includes(16) ? 'anime' : undefined

export function recommendationInterests(library: LibraryState, kind?: MediaKind, now = Date.now()) {
  const weights = new Map<string, { media: Media; weight: number }>()
  for (const entry of Object.values(library.progress)) {
    const checkpoint = knownProgress(entry)
    if (!checkpoint || checkpoint.durationMs <= 0 || checkpoint.positionMs < 1000) continue
    const completion = isCompleted(entry) ? 1 : Math.min(1, checkpoint.positionMs / checkpoint.durationMs)
    const recency = 2 ** (-Math.max(0, now - entry.updatedAt) / (45 * day))
    const weight = (.2 + 4 * completion ** 1.3) * recency
    if (weight > (weights.get(entry.media.id)?.weight ?? 0)) weights.set(entry.media.id, { media: entry.media, weight })
  }
  for (const media of library.favorites) weights.set(media.id, { media, weight: (weights.get(media.id)?.weight ?? 0) + 1.4 })
  const totals = new Map<string, Interest>()
  function add(interest: Omit<Interest, 'score'>, value: number) {
    const key = JSON.stringify(interest)
    totals.set(key, { ...interest, score: (totals.get(key)?.score ?? 0) + value })
  }
  for (const { media, weight } of weights.values()) {
    if (media.source !== 'tmdb' || (kind && kind !== media.kind)) continue
    const specialization = category(media)
    add({ kind: media.kind }, weight * .35)
    if (specialization) add({ kind: 'tv', category: specialization }, weight * 1.25)
    for (const genre of media.genreIds) add({ kind: media.kind, genre }, weight / Math.sqrt(media.genreIds.length))
  }
  return [...totals.values()].sort((a, b) => b.score - a.score)
}

export function recommendationRails(interests: Interest[]): RailSpec[] {
  const specific = interests.filter(item => item.category || item.genre).filter(item =>
    !(item.kind === 'tv' && (item.genre === 16 && interests.some(i => i.category === 'anime') || item.genre === 10766 && interests.some(i => i.category === 'novela'))))
  return specific.slice(0, 2).map(item => ({
    id: `taste-${item.kind}-${item.category ?? item.genre}`, title: 'Recomendado para você', mediaType: item.kind,
    source: 'discover', genres: [item.category === 'anime' ? 16 : item.category === 'novela' ? 10766 : item.genre!],
    ...(item.category === 'anime' ? { params: { with_origin_country: 'JP', with_original_language: 'ja' } } : {}),
  }))
}

export function rankRecommendations(personalized: Media[], general: Media[], interests: Interest[], excluded: Set<string>) {
  const score = (media: Media) => interests.reduce((sum, item) => sum + (item.kind === media.kind &&
    (item.category ? category(media) === item.category : !item.genre || media.genreIds.includes(item.genre)) ? item.score : 0), 0)
  const ranked = [...personalized].sort((a, b) => score(b) - score(a))
  const fresh = [...general]
  const seen = new Set(excluded)
  const items: Media[] = []
  while ((ranked.length || fresh.length) && items.length < 24) {
    const pool = (items.length % 4 === 3 && fresh.length > 0) || !ranked.length ? fresh : ranked
    const item = pool.shift()!
    if (!seen.has(item.id)) { seen.add(item.id); items.push(item) }
  }
  return items
}
